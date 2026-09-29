import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'registration-test-secret';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { Announcement } = await import('./models/announcementModel.js');

const app = createApiApp();

const signUp = {
  name: 'Juan Dela Cruz',
  email: 'Juan.DelaCruz@dilg.gov.ph',
  role: 'Administrative Aide',
  office: 'DILG Marinduque - Boac',
  region: 'MIMAROPA',
  phoneNumber: '09171234567',
  password: 'a-long-password-42'
};

test('a sign-up form account waits for HR approval and is not signed in', async t => {
  t.mock.method(User, 'findByEmail', async () => null);
  t.mock.method(Announcement, 'createNotification', async data => data);
  const create = t.mock.method(User, 'createSelfServiceEmployee', async data => ({ ...data, _id: 'new-1', employeeId: 'DILG-2026-123456', accessLevel: 'employee' }));

  const response = await request(app).post('/api/register').send({ ...signUp, accessLevel: 'hr_admin', accountStatus: 'Active' });

  assert.equal(response.status, 201);
  const saved = create.mock.calls[0].arguments[0];
  assert.equal(saved.accountStatus, 'Pending');
  assert.equal(saved.email, 'juan.delacruz@dilg.gov.ph');
  // Only the sign-up fields are used, so nobody can sign themselves up as HR/Admin or active.
  assert.equal(saved.accessLevel, undefined);
  assert.equal(response.body.token, undefined);
  assert.match(response.body.message, /HR Administrator must activate it/);
});

test('HR is told a new account is waiting for approval', async t => {
  t.mock.method(User, 'findByEmail', async () => null);
  t.mock.method(User, 'createSelfServiceEmployee', async data => ({ ...data, _id: 'new-2', employeeId: 'DILG-2026-654321', accessLevel: 'employee' }));
  const notify = t.mock.method(Announcement, 'createNotification', async data => data);

  await request(app).post('/api/register').send(signUp);

  const notice = notify.mock.calls[0].arguments[0];
  assert.equal(notice.title, 'New Account Awaiting Approval');
  assert.equal(notice.recipientRole, 'hr_admin');
  assert.match(notice.message, /waiting for HR activation/);
});

test('an email that already has an account cannot sign up again', async t => {
  t.mock.method(User, 'findByEmail', async () => ({ email: 'juan.delacruz@dilg.gov.ph' }));
  const create = t.mock.method(User, 'createSelfServiceEmployee', async () => null);

  const response = await request(app).post('/api/register').send(signUp);

  assert.equal(response.status, 409);
  assert.equal(create.mock.callCount(), 0);
});
