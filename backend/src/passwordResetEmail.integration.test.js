import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

// A mail server that refuses connections, like a placeholder host that does not exist.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'password-reset-email-test-secret';
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '1';
process.env.SMTP_SECURE = 'false';
process.env.SMTP_USER = 'reset@example.com';
process.env.SMTP_PASS = 'not-a-real-password';
process.env.EMAIL_FROM = 'DILG WorkMate <reset@example.com>';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');

const app = createApiApp();

test('a broken email service is reported instead of claiming the link was sent', async t => {
  const lookup = t.mock.method(User, 'findByEmail', async () => ({ email: 'juan.delacruz@gmail.com' }));
  const response = await request(app).post('/api/password-reset-request').send({ email: 'juan.delacruz@gmail.com' });
  assert.equal(response.status, 503);
  assert.match(response.body.error, /email service is not set up correctly/);
  // The email is not looked up, so the answer is the same whether or not the account exists.
  assert.equal(lookup.mock.callCount(), 0);
});

test('DILG email accounts are told to contact HR, whether or not the account exists', async t => {
  const lookup = t.mock.method(User, 'findByEmail', async () => null);
  for (const email of ['juan@dilg.gov.ph', 'Ana@Region4b.DILG.gov.ph']) {
    const response = await request(app).post('/api/password-reset-request').send({ email });
    assert.equal(response.status, 200, email);
    assert.equal(response.body.contactHr, true, email);
    assert.match(response.body.message, /contact your HR Administrator/);
  }
  assert.equal(lookup.mock.callCount(), 0);
});

test('Gmail accounts still go on to the email reset', async t => {
  t.mock.method(User, 'findByEmail', async () => null);
  const response = await request(app).post('/api/password-reset-request').send({ email: 'juan.delacruz@gmail.com' });
  // The test mail server refuses connections, so this reaches the email service check.
  assert.equal(response.status, 503);
  assert.equal(response.body.contactHr, undefined);
});
