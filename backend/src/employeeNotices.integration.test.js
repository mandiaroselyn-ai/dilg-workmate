import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'employee-notices-test-secret';
process.env.UNISMS_WEBHOOK_SECRET = 'employee-notices-webhook-secret';
// Texts are "sent" to a stand-in for the SMS service, so nothing leaves the test.
process.env.UNISMS_API_KEY = '';
const texts = [];
globalThis.fetch = async (url, options) => {
  texts.push(JSON.parse(options.body));
  return new Response(JSON.stringify({ id: `msg-${texts.length}` }), { status: 200 });
};

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { Leave } = await import('./models/leaveModel.js');
const { DtrLog } = await import('./models/dtrLogModel.js');
const { Announcement } = await import('./models/announcementModel.js');
const { createAuthToken } = await import('./utils/authToken.js');
const { attendanceReviewNotices, changedRecordFields, requestDecisionNotice } = await import('./services/employeeNotices.js');

const app = createApiApp();
const employee = { _id: 'emp-1', name: 'Juan Dela Cruz', email: 'juan@dilg.gov.ph', employeeId: 'DILG-2026-1', accessLevel: 'employee', accountStatus: 'Active', phoneNumber: '0917 123 4567' };
const supervisor = { _id: 'sup-1', name: 'Ana Reyes', email: 'ana@dilg.gov.ph', employeeId: 'DILG-2026-2', accessLevel: 'supervisor', accountStatus: 'Active' };
const hr = { _id: 'hr-1', name: 'HR Officer', email: 'hr@dilg.gov.ph', employeeId: 'DILG-2026-3', accessLevel: 'hr_admin', accountStatus: 'Active' };
const leave = { id: 'LV-1', type: 'Leave Request', leaveType: 'Vacation Leave', startDate: '2026-10-05', endDate: '2026-10-07', workingDays: 3, employeeId: employee.employeeId, employeeEmail: employee.email, employeePhoneNumber: '0918 000 0000' };

// Turns on the SMS service for one test and returns the texts it sends.
const withSms = t => {
  process.env.UNISMS_API_KEY = 'test-key';
  texts.length = 0;
  t.after(() => { process.env.UNISMS_API_KEY = ''; });
  t.mock.method(Announcement, 'createSmsAlert', async data => data);
  return texts;
};

test('a request decision tells the employee what, when, who, and why', () => {
  const approved = requestDecisionNotice({ ...leave, status: 'Approved' }, { reviewer: 'Ana Reyes', remarks: ' Enjoy your leave. ' });
  assert.equal(approved.title, 'Leave Request Approved');
  assert.equal(approved.message, 'Your Leave Request LV-1 (Vacation Leave, Oct 5 to Oct 7, 2026) was approved by Ana Reyes. Remarks: Enjoy your leave.');
  assert.equal(approved.sms, `DILG WorkMate: ${approved.message}`);

  const forwarded = requestDecisionNotice({ ...leave, status: 'For Supervisor', endDate: '2026-10-05' }, { reviewer: 'HR Officer' });
  assert.equal(forwarded.title, 'Leave Request Sent to Supervisor');
  assert.equal(forwarded.message, 'Your Leave Request LV-1 (Vacation Leave, Oct 5, 2026) was checked by HR and sent to your supervisor for approval.');

  const travel = requestDecisionNotice({ id: 'TO-1', type: 'Travel Order', travelVenue: 'Boac', startDate: '2026-10-05', endDate: '2026-10-05', status: 'Rejected' }, { reviewer: 'Ana Reyes' });
  assert.equal(travel.message, 'Your Travel Order TO-1 (Boac, Oct 5, 2026) was disapproved by Ana Reyes.');

  assert.equal(requestDecisionNotice({ ...leave, status: 'Pending' }), null);
});

test('the supervisor\'s decision reaches the employee from the server, at their current number', async t => {
  const sent = withSms(t);
  t.mock.method(User, 'findByEmail', async email => (email === supervisor.email ? supervisor : null));
  t.mock.method(User, 'findByEmployeeId', async () => employee);
  t.mock.method(User, 'deductLeaveCredits', async () => null);
  t.mock.method(Leave, 'findByCustomId', async () => ({ ...leave, status: 'For Supervisor' }));
  t.mock.method(Leave, 'updateStatus', async (_id, update) => ({ ...leave, ...update }));
  t.mock.method(Leave, 'markCreditsDeducted', async () => true);
  const notify = t.mock.method(Announcement, 'createNotification', async data => data);

  const response = await request(app)
    .patch('/api/requests/LV-1')
    .set('Authorization', `Bearer ${createAuthToken(supervisor)}`)
    .send({ status: 'Approved', remarks: 'Approved.' });
  assert.equal(response.status, 200);

  const notice = notify.mock.calls.map(call => call.arguments[0]).find(item => item.employeeId === employee.employeeId);
  assert.equal(notice.title, 'Leave Request Approved');
  assert.equal(notice.view, 'requests');
  assert.match(notice.message, /was approved by Ana Reyes\. Remarks: Approved\.$/);
  assert.equal(sent.length, 1);
  // The number on the profile now, not the one saved with the request.
  assert.equal(sent[0].recipient, '+639171234567');
  assert.match(sent[0].content, /^DILG WorkMate: Your Leave Request LV-1/);
});

test('an SMS reply is shown to HR, not back to the employee who sent it', async t => {
  t.mock.method(User, 'findByPhoneNumber', async () => employee);
  t.mock.method(Announcement, 'createIncomingSms', async data => data);
  const notify = t.mock.method(Announcement, 'createNotification', async data => data);
  const response = await request(app)
    .post('/api/sms/webhook')
    .set('webhook-secret-key', process.env.UNISMS_WEBHOOK_SECRET)
    .send({ message: { sender: '09171234567', content: 'Noted, thank you.' } });
  assert.equal(response.status, 200);
  const notice = notify.mock.calls[0].arguments[0];
  assert.equal(notice.recipientRole, 'hr_admin');
  assert.equal(notice.employeeId, undefined);
  assert.equal(notice.message, 'Juan Dela Cruz (+639171234567) replied by SMS: Noted, thank you.');
});

test('HR\'s attendance updates give each employee one summary', () => {
  const records = [
    { id: 'a1', date: '2026-10-01', employeeId: 'E1' },
    { id: 'a2', date: '2026-10-02', employeeId: 'E1' },
    { id: 'a3', date: '2026-10-02', employeeId: 'E2' }
  ];
  const notices = attendanceReviewNotices([
    { id: 'a1', timeIn: '08:05 AM', verificationAudit: { verifiedBy: 'HR' } },
    { id: 'a2', verificationAudit: { verifiedBy: 'HR' } },
    { id: 'a3', offlineDecision: 'rejected' }
  ], records);
  assert.equal(notices.length, 2);
  assert.deepEqual(notices[0].person, { employeeId: 'E1', employeeEmail: '' });
  assert.equal(notices[0].title, 'Attendance Corrected by HR');
  assert.equal(notices[0].message, 'HR corrected your attendance for Oct 1. HR verified your attendance for Oct 2.');
  assert.equal(notices[1].title, 'Offline Time In Not Accepted');
  assert.equal(notices[1].message, 'Your offline Time In for Oct 2 was not accepted. Please contact HR.');
});

test('HR saving attendance notifies the employees whose records changed', async t => {
  t.mock.method(User, 'findByEmail', async () => hr);
  t.mock.method(DtrLog, 'bulkUpdate', async () => [{ id: 'a1', date: '2026-10-01', employeeId: employee.employeeId, employeeEmail: employee.email }]);
  const notify = t.mock.method(Announcement, 'createNotification', async data => data);
  const response = await request(app)
    .put('/api/attendance/history')
    .set('Authorization', `Bearer ${createAuthToken(hr)}`)
    .send([{ id: 'a1', offlineDecision: 'approved' }]);
  assert.equal(response.status, 200);
  const notice = notify.mock.calls[0].arguments[0];
  assert.equal(notice.employeeId, employee.employeeId);
  assert.equal(notice.view, 'attendance');
  assert.equal(notice.message, 'Your offline Time In for Oct 1 was approved and now counts in your DTR.');
});

test('the employee hears which HR-kept details HR changed', () => {
  assert.deepEqual(
    changedRecordFields(
      { role: 'LGOO II', office: 'Boac', approvedWfhLocation: { municipality: 'Boac', barangay: 'Isok I' } },
      { role: 'LGOO III', office: 'Boac', approvedWfhLocation: { municipality: 'Gasan', barangay: 'Bahi' } }
    ),
    ['Position', 'Approved WFH location']
  );
  assert.deepEqual(changedRecordFields({ role: 'LGOO II', address: 'Boac' }, { role: 'LGOO II', address: 'Gasan' }), []);
});

test('a password reset by HR is told to the person, without the password', async t => {
  const sent = withSms(t);
  t.mock.method(User, 'findByEmail', async () => hr);
  t.mock.method(User, 'findAccount', async () => employee);
  t.mock.method(User, 'changePassword', async () => true);
  const notify = t.mock.method(Announcement, 'createNotification', async data => data);
  const response = await request(app)
    .patch(`/api/employees/${employee.employeeId}/password`)
    .set('Authorization', `Bearer ${createAuthToken(hr)}`)
    .send({ newPassword: 'Temporary-Pass-2026' });
  assert.equal(response.status, 200);
  const notice = notify.mock.calls.map(call => call.arguments[0]).find(item => item.employeeId === employee.employeeId);
  assert.equal(notice.title, 'Password Reset by HR');
  assert.equal(notice.view, 'settings');
  assert.equal(sent.length, 1);
  assert.doesNotMatch(sent[0].content, /Temporary-Pass-2026/);
});
