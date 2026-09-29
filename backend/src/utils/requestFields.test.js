import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEmployeeRequest, pickReviewUpdate } from './requestFields.js';

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
