import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEmployeeDraftUpdate, buildEmployeeRequest, buildEmployeeWithdrawal, pickReviewUpdate, reviewUpdateProblem } from './requestFields.js';

const employee = {
  employeeId: 'DILG-2026-1001',
  email: 'juan@dilg.gov.ph',
  name: 'Juan Dela Cruz',
  phoneNumber: '09171234567'
};

test('employees cannot submit a request that is already approved', () => {
  const request = buildEmployeeRequest({
    type: 'Leave Request',
    purpose: 'Vacation',
    status: 'Approved',
    approver: 'Provincial Director',
    remarks: 'Approved',
    supervisorSignature: 'data:image/png;base64,forged',
    directorName: 'Forged Director',
    statusHistory: [{ status: 'Approved', actor: 'Director' }]
  }, employee, '2026-09-29');

  assert.equal(request.status, 'Pending');
  assert.equal(request.approver, undefined);
  assert.equal(request.supervisorSignature, undefined);
  assert.equal(request.directorName, undefined);
  assert.deepEqual(request.statusHistory, [{ status: 'Pending', date: '2026-09-29', actor: 'Juan Dela Cruz' }]);
  assert.equal(request.type, 'Leave Request');
  assert.equal(request.purpose, 'Vacation');
});

test('employees can still save drafts', () => {
  const request = buildEmployeeRequest({ type: 'Travel Order', status: 'Draft' }, employee);
  assert.equal(request.status, 'Draft');
  assert.match(request.remarks, /Draft/);
});

test('employee requests are owned by the signed-in employee and get a server ID', () => {
  const request = buildEmployeeRequest({
    id: 'req-of-someone-else',
    employeeId: 'DILG-OTHER',
    employeeEmail: 'other@dilg.gov.ph'
  }, employee);
  assert.equal(request.id, undefined);
  assert.equal(request.employeeId, employee.employeeId);
  assert.equal(request.employeeEmail, employee.email);
});

test('review updates only change review fields', () => {
  const update = pickReviewUpdate({
    status: 'Approved',
    remarks: 'OK',
    supervisorName: 'Supervisor',
    employeeId: 'DILG-OTHER',
    startDate: '2020-01-01',
    customId: 'req-1'
  });
  assert.deepEqual(update, { status: 'Approved', remarks: 'OK', supervisorName: 'Supervisor' });
});

const draft = {
  customId: 'req-1',
  status: 'Draft',
  employeeId: employee.employeeId,
  employeeEmail: employee.email,
  statusHistory: [{ status: 'Draft', date: '2026-09-28', actor: employee.name }]
};

test('employees can submit their own draft with edited content', () => {
  const update = buildEmployeeDraftUpdate(draft, {
    status: 'Pending',
    purpose: 'Updated purpose',
    travelVenue: 'Boac',
    approver: 'Forged',
    employeeId: 'DILG-OTHER'
  }, employee, '2026-09-29');

  assert.equal(update.status, 'Pending');
  assert.equal(update.purpose, 'Updated purpose');
  assert.equal(update.travelVenue, 'Boac');
  assert.equal(update.submissionDate, '2026-09-29');
  assert.equal(update.approver, undefined);
  assert.equal(update.employeeId, undefined);
  assert.deepEqual(update.statusHistory.at(-1), { status: 'Pending', date: '2026-09-29', actor: employee.name });
});

test('employees can discard their own draft without changing its content', () => {
  const update = buildEmployeeDraftUpdate(draft, { status: 'Cancelled', purpose: 'ignored' }, employee, '2026-09-29');
  assert.equal(update.status, 'Cancelled');
  assert.equal(update.purpose, undefined);
});

test('employees cannot approve drafts or change other people\'s requests', () => {
  assert.equal(buildEmployeeDraftUpdate(draft, { status: 'Approved' }, employee).status, 'Draft');
  assert.equal(buildEmployeeDraftUpdate({ ...draft, status: 'Pending' }, { status: 'Cancelled' }, employee), null);
  assert.equal(buildEmployeeDraftUpdate(draft, { status: 'Pending' }, { employeeId: 'DILG-OTHER', email: 'other@dilg.gov.ph' }), null);
});

test('employees can withdraw their own request while it is still undecided', () => {
  const pending = { ...draft, status: 'For Supervisor' };
  const update = buildEmployeeWithdrawal(pending, { status: 'Withdrawn', withdrawalReason: 'Schedule changed' }, employee, '2026-09-29');
  assert.equal(update.status, 'Withdrawn');
  assert.match(update.remarks, /Schedule changed/);
  assert.deepEqual(update.statusHistory.at(-1), { status: 'Withdrawn', date: '2026-09-29', actor: employee.name });
});

test('employees cannot withdraw decided requests or other people\'s requests', () => {
  assert.equal(buildEmployeeWithdrawal({ ...draft, status: 'Approved' }, { status: 'Withdrawn' }, employee), null);
  assert.equal(buildEmployeeWithdrawal({ ...draft, status: 'Pending' }, { status: 'Approved' }, employee), null);
  assert.equal(buildEmployeeWithdrawal({ ...draft, status: 'Pending' }, { status: 'Withdrawn' }, { employeeId: 'X', email: 'x@dilg.gov.ph' }), null);
});

test('HR can only forward a request that is waiting for HR', () => {
  const forward = { status: 'For Supervisor', remarks: 'Checked.' };
  assert.equal(reviewUpdateProblem('Pending', forward, 'hr_admin'), null);
  assert.equal(reviewUpdateProblem('Pending Review', forward, 'hr_admin'), null);
  assert.match(reviewUpdateProblem('For Supervisor', forward, 'hr_admin'), /already forwarded/);
  assert.match(reviewUpdateProblem('Approved', forward, 'hr_admin'), /already Approved/);
  assert.match(reviewUpdateProblem('Rejected', forward, 'hr_admin'), /already Rejected/);
  assert.match(reviewUpdateProblem('Pending', { status: 'Approved' }, 'hr_admin'), /only forward/);
});

test('reviewers cannot act on drafts or withdrawn requests', () => {
  for (const role of ['hr_admin', 'supervisor']) {
    assert.match(reviewUpdateProblem('Draft', { status: 'For Supervisor' }, role), /draft/);
    assert.match(reviewUpdateProblem('Withdrawn', { status: 'Approved' }, role), /withdrew/);
    assert.match(reviewUpdateProblem('Withdrawn', { remarks: 'Note.' }, role), /withdrew/);
  }
});

test('the supervisor approves or rejects, and remarks alone are allowed', () => {
  assert.equal(reviewUpdateProblem('For Supervisor', { status: 'Approved' }, 'supervisor'), null);
  assert.equal(reviewUpdateProblem('Pending', { status: 'Rejected' }, 'supervisor'), null);
  assert.match(reviewUpdateProblem('For Supervisor', { status: 'Pending' }, 'supervisor'), /approve or reject/);
  assert.equal(reviewUpdateProblem('Approved', { remarks: 'Noted.' }, 'hr_admin'), null);
});
