import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'rate-limit-test-secret';
process.env.FRONTEND_URL = 'http://localhost:5173';

const { createApiApp } = await import('./app.js');

// A login with no password fails validation without touching the database.
const failedLogin = (app, email) => request(app).post('/api/login').send({ email, role: 'employee' });

test('failed logins for one email do not lock out other people on the same connection', async () => {
  const app = createApiApp();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal((await failedLogin(app, 'juan@dilg.gov.ph')).status, 400);
  }
  assert.equal((await failedLogin(app, 'juan@dilg.gov.ph')).status, 429);
  assert.equal((await failedLogin(app, 'maria@dilg.gov.ph')).status, 400);
});

test('limits failed logins across all emails from one connection', async () => {
  const app = createApiApp();
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await failedLogin(app, `user${attempt}@dilg.gov.ph`);
  }
  assert.equal((await failedLogin(app, 'someone-new@dilg.gov.ph')).status, 429);
});

test('counts signed-in requests per session instead of per connection', async () => {
  const app = createApiApp();
  const first = await request(app).get('/api/state').set('Authorization', 'Bearer session-a');
  const second = await request(app).get('/api/state').set('Authorization', 'Bearer session-b');
  assert.equal(first.headers['ratelimit-policy'], second.headers['ratelimit-policy']);
  assert.match(first.headers.ratelimit, /remaining=299/);
  assert.match(second.headers.ratelimit, /remaining=299/);
});
