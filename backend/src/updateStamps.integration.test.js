import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'update-stamps-test-secret';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { Announcement } = await import('./models/announcementModel.js');
const { DtrLog } = await import('./models/dtrLogModel.js');
const { Leave, visibleRequestFilter } = await import('./models/leaveModel.js');
const { EmployeeDocument, visibleDocumentFilter } = await import('./models/employeeDocumentModel.js');
const { createAuthToken } = await import('./utils/authToken.js');

const app = createApiApp();

const employee = { _id: 'emp-1', email: 'juan@dilg.gov.ph', employeeId: 'DILG-2026-1', accessLevel: 'employee', accountStatus: 'Active' };
const hr = { _id: 'hr-1', email: 'hr@dilg.gov.ph', accessLevel: 'hr_admin', accountStatus: 'Active' };

// Signs in as the given account with the database calls replaced by fixed fingerprints.
const signIn = (t, account) => {
  t.mock.method(User, 'findByEmail', async () => account);
  t.mock.method(Announcement, 'updateStamps', async () => ({ announcements: 'a1', events: 'e1', notifications: 'n1' }));
  const requestStamp = t.mock.method(Leave, 'updateStamp', async () => 'r1');
  t.mock.method(EmployeeDocument, 'updateStamp', async () => 'doc1');
  const attendanceStamp = t.mock.method(DtrLog, 'updateStamp', async () => 'd1');
  const smsStamp = t.mock.method(Announcement, 'smsStamp', async () => 's1');
  return {
    get: path => request(app).get(path).set('Authorization', `Bearer ${createAuthToken(account)}`),
    requestStamp,
    attendanceStamp,
    smsStamp
  };
};

test('employees get fingerprints of their lists, without attendance', async t => {
  const session = signIn(t, employee);
  const response = await session.get('/api/updates');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.stamps, { announcements: 'a1', events: 'e1', notifications: 'n1', requests: 'r1', documents: 'doc1' });
  assert.equal(session.requestStamp.mock.calls[0].arguments[0].email, employee.email);
  assert.equal(session.attendanceStamp.mock.callCount(), 0);
  assert.equal(session.smsStamp.mock.callCount(), 0);
});

test('HR/Admins also get the attendance and SMS fingerprints', async t => {
  const session = signIn(t, hr);
  const response = await session.get('/api/updates');
  assert.equal(response.status, 200);
  assert.equal(response.body.stamps.attendance, 'd1');
  assert.equal(response.body.stamps.sms, 's1');
});

test('checking for updates often never uses up the request limit', async t => {
  const session = signIn(t, employee);
  for (let i = 0; i < 310; i++) {
    const response = await session.get('/api/updates');
    assert.notEqual(response.status, 429, `check ${i + 1} was rate limited`);
  }
});

test('the update check needs a login', async () => {
  assert.equal((await request(app).get('/api/updates')).status, 401);
});

test('employees are matched to their own requests only', () => {
  assert.deepEqual(visibleRequestFilter(employee), { $or: [{ employeeId: 'DILG-2026-1' }, { employeeEmail: 'juan@dilg.gov.ph' }] });
  assert.deepEqual(visibleRequestFilter({ ...employee, employeeId: '' }), { $or: [{ employeeEmail: 'juan@dilg.gov.ph' }] });
  assert.equal(visibleRequestFilter({ accessLevel: 'employee' }), null);
  assert.deepEqual(visibleRequestFilter(hr), {});
  assert.deepEqual(visibleRequestFilter({ accessLevel: 'supervisor' }), {});
});

test('employees are matched to their own documents only, and supervisors to none', () => {
  assert.deepEqual(visibleDocumentFilter(employee), { $or: [{ employeeId: 'DILG-2026-1' }, { employeeEmail: 'juan@dilg.gov.ph' }] });
  assert.equal(visibleDocumentFilter({ accessLevel: 'employee' }), null);
  assert.deepEqual(visibleDocumentFilter(hr), {});
  assert.equal(visibleDocumentFilter({ accessLevel: 'supervisor' }), null);
});
