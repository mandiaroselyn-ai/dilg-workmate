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
  const lookup = t.mock.method(User, 'findByEmail', async () => ({ email: 'juan@dilg.gov.ph' }));
  const response = await request(app).post('/api/password-reset-request').send({ email: 'juan@dilg.gov.ph' });
  assert.equal(response.status, 503);
  assert.match(response.body.error, /email service is not set up correctly/);
  // The email is not looked up, so the answer is the same whether or not the account exists.
  assert.equal(lookup.mock.callCount(), 0);
});
