import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'support-requests-test-secret';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { Announcement } = await import('./models/announcementModel.js');
const { createAuthToken } = await import('./utils/authToken.js');

const app = createApiApp();

const employee = { _id: 'emp-1', name: 'Juan Dela Cruz', email: 'juan@dilg.gov.ph', employeeId: 'E1', phoneNumber: '0917 123 4567', accessLevel: 'employee', accountStatus: 'Active' };
const supervisor = { _id: 'sup-1', name: 'OIC', email: 'oic@dilg.gov.ph', accessLevel: 'supervisor', accountStatus: 'Active' };

const send = (t, account, body) => {
  t.mock.method(User, 'findByEmail', async () => account);
  const notifications = t.mock.method(Announcement, 'createNotification', async data => data);
  const response = request(app).post('/api/support-requests').set('Authorization', `Bearer ${createAuthToken(account)}`).send(body);
  return { response, notifications };
};

test('an employee help request reaches HR with their contact details', async t => {
  const { response, notifications } = send(t, employee, {
    topic: 'Time In and attendance', subject: 'Out of Range at the office', details: 'The app says Out of Range even inside the building.'
  });
  assert.equal((await response).status, 201);
  assert.equal(notifications.mock.callCount(), 1);
  const notice = notifications.mock.calls[0].arguments[0];
  assert.equal(notice.recipientRole, 'hr_admin');
  assert.equal(notice.title, 'Help Request: Time In and attendance');
  assert.match(notice.message, /Juan Dela Cruz \(E1\) asked for help: Out of Range at the office\./);
  assert.match(notice.message, /Contact: 0917 123 4567 \/ juan@dilg\.gov\.ph/);
});

test('a help request needs a known topic, a subject, and details', async t => {
  for (const body of [
    { topic: 'Payroll', subject: 'Payslip', details: 'Where is my payslip?' },
    { topic: 'Other', subject: ' ', details: 'Something is wrong.' },
    { topic: 'Other', subject: 'Help', details: '' }
  ]) {
    const { response, notifications } = send(t, employee, body);
    assert.equal((await response).status, 400, JSON.stringify(body));
    assert.equal(notifications.mock.callCount(), 0);
  }
});

test('only employees send help requests', async t => {
  const { response } = send(t, supervisor, { topic: 'Other', subject: 'Help', details: 'Details' });
  assert.equal((await response).status, 403);
});
