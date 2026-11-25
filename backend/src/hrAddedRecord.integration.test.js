import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'hr-added-record-test-secret';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { DtrLog } = await import('./models/dtrLogModel.js');
const { Leave } = await import('./models/leaveModel.js');
const { Announcement } = await import('./models/announcementModel.js');
const { createAuthToken } = await import('./utils/authToken.js');
const { readHrRecord } = await import('./utils/hrAddedRecord.js');
const { dtrIssue } = await import('../../src/utils/hrAttendance.js');

const app = createApiApp();
const hr = { _id: '64b000000000000000000071', email: 'hr@dilg.gov.ph', employeeId: 'HR-7', name: 'Ma. Joane O. Salcedo', accessLevel: 'hr_admin', hrTask: 'leave-credits', accountStatus: 'Active' };
const employee = { _id: '64b000000000000000000072', email: 'juan@dilg.gov.ph', employeeId: 'EMP-7', name: 'Juan Dela Cruz', office: 'DILG Provincial Office', accessLevel: 'employee', accountStatus: 'Active' };
const day = { employee: employee._id, date: '2026-11-24', dutyType: 'office', location: 'DILG Provincial Office', timeIn: '08:10 AM', lunchOut: '12:00 PM', lunchIn: '01:00 PM', timeOut: '05:10 PM', reason: 'Phone battery died; letter of explanation approved by the PD.' };

const signIn = (t, as, { hasRecord = false, absences = [] } = {}) => {
  t.mock.method(User, 'findByEmail', async email => (email === as.email ? as : null));
  t.mock.method(User, 'findEmployeeAccount', async id => ([employee._id, employee.email, employee.employeeId].includes(id) ? employee : null));
  t.mock.method(DtrLog, 'hasLogOnDate', async () => hasRecord);
  t.mock.method(Leave, 'findAbsencesOfEmployee', async () => absences);
  t.mock.method(Announcement, 'createNotification', async notice => notice);
  const added = t.mock.method(DtrLog, 'addByHr', async (record, account, reviewer) => ({ id: 'att-9', ...record, employeeId: account.employeeId, hrEntry: { addedBy: reviewer, reason: record.reason } }));
  // Today is November 25, 2026 in Manila.
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-25T02:00:00Z') });
  const send = body => request(app).post('/api/attendance/history').set('Authorization', `Bearer ${createAuthToken(as)}`).send(body);
  return { send, added };
};

test('HR adds a record for a day without one, with the reason, and the employee is told', async t => {
  const { send, added } = signIn(t, hr);
  const response = await send(day);
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const [record, account, reviewer] = added.mock.calls[0].arguments;
  assert.equal(account, employee);
  assert.equal(reviewer, hr.name);
  assert.equal(record.date, '2026-11-24');
  assert.equal(record.timeIn, '08:10 AM');
  assert.equal(record.timeOut, '05:10 PM');
  assert.equal(record.reason, day.reason);
  // Tuesday: in by 9:00 AM is on time.
  assert.equal(record.late, false);
  const notice = Announcement.createNotification.mock.calls[0].arguments[0];
  assert.equal(notice.title, 'Attendance Added by HR');
  assert.match(notice.message, /on 2026-11-24: Time In 08:10 AM, Lunch Out 12:00 PM, Lunch In 01:00 PM, Time Out 05:10 PM\. Reason: Phone battery died/);
  assert.equal(notice.employeeId, employee.employeeId);
});

test('only HR adds records, and not over a record, a leave or Travel Order day, or a day to come', async t => {
  const asEmployee = signIn(t, employee);
  assert.equal((await asEmployee.send(day)).status, 403);
  assert.equal(asEmployee.added.mock.callCount(), 0);
  t.mock.restoreAll();
  t.mock.timers.reset();

  const existing = signIn(t, hr, { hasRecord: true });
  const taken = await existing.send(day);
  assert.equal(taken.status, 409);
  assert.match(taken.body.error, /already has a record on 2026-11-24\. Correct it in DTR Records instead/);
  t.mock.restoreAll();
  t.mock.timers.reset();

  const onLeave = signIn(t, hr, { absences: [{ id: 'LV-2', type: 'Leave Request', status: 'Approved', startDate: '2026-11-24', endDate: '2026-11-24' }] });
  const leave = await onLeave.send(day);
  assert.equal(leave.status, 409);
  assert.match(leave.body.error, /approved leave \(LV-2\)/);
  const future = await onLeave.send({ ...day, date: '2026-11-26' });
  assert.equal(future.status, 400);
  assert.match(future.body.error, /today or a day that has passed/);
  const unknown = await onLeave.send({ ...day, employee: 'nobody@dilg.gov.ph' });
  assert.equal(unknown.status, 404);
  assert.equal(onLeave.added.mock.callCount(), 0);
});

test('a record HR adds needs its times in order and a reason', () => {
  const today = '2026-11-25';
  assert.equal(readHrRecord(day, today).value.timeIn, '08:10 AM');
  assert.match(readHrRecord({ ...day, reason: ' ' }, today).error, /Write why HR is adding this record/);
  assert.match(readHrRecord({ ...day, timeIn: '' }, today).error, /Time In must be a time/);
  assert.match(readHrRecord({ ...day, timeOut: '07:00 AM' }, today).error, /Time Out must be later than Lunch In/);
  assert.match(readHrRecord({ ...day, lunchOut: '', lunchIn: '01:00 PM' }, today).error, /Lunch Out with the Lunch In/);
  assert.match(readHrRecord({ ...day, dutyType: 'beach' }, today).error, /Office, Field, or WFH/);
  assert.match(readHrRecord({ ...day, location: '' }, today).error, /Write where the employee worked/);
  // Only the Time In: the rest can wait.
  const timeInOnly = readHrRecord({ ...day, lunchOut: '', lunchIn: '', timeOut: '' }, today).value;
  assert.equal(timeInOnly.timeOut, null);
  // After 9:00 AM on a Tuesday is late.
  assert.equal(readHrRecord({ ...day, timeIn: '09:20 AM' }, today).value.late, true);
});

test('a record HR added is not flagged for a missing selfie or fingerprint', () => {
  const added = { id: 'att-9', date: '2026-11-24', timeIn: '08:10 AM', lunchOut: '12:00 PM', lunchIn: '01:00 PM', timeOut: '05:10 PM', hrEntry: { addedBy: 'HR', reason: 'Phone died' } };
  assert.equal(dtrIssue(added, '2026-11-25'), null);
  assert.equal(dtrIssue({ ...added, hrEntry: null }, '2026-11-25'), 'Missing Selfie Verification');
  assert.equal(dtrIssue({ ...added, timeOut: null }, '2026-11-25'), 'Missing Time Out');
});
