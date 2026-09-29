import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'auth-middleware-test-secret';
const { authenticate } = await import('./auth.js');
const { User } = await import('../models/User.js');
const { createAuthToken } = await import('../utils/authToken.js');

const runAuthenticate = async (token, account) => {
  const originalFind = User.findByEmail;
  User.findByEmail = async () => account;
  let statusCode = 200;
  let body;
  let nextCalled = false;
  const res = {
    set() { return this; },
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return this; }
  };
  try {
    await authenticate({ headers: { authorization: `Bearer ${token}` } }, res, () => { nextCalled = true; });
  } finally {
    User.findByEmail = originalFind;
  }
  return { statusCode, body, nextCalled };
};

const account = { _id: 'u1', email: 'juan@dilg.gov.ph', accessLevel: 'employee', accountStatus: 'Active' };

test('accepts a session when the password has not changed since it started', async () => {
  const token = createAuthToken(account);
  assert.equal((await runAuthenticate(token, { ...account, passwordChangedAt: null })).nextCalled, true);
});

test('ends sessions that started before a password change', async () => {
  const token = createAuthToken(account);
  const changedLater = new Date(Date.now() + 5000);
  const result = await runAuthenticate(token, { ...account, passwordChangedAt: changedLater });
  assert.equal(result.statusCode, 401);
  assert.match(result.body.error, /password was changed/);
});

test('keeps the session that made the change, whose new token is issued right after it', async () => {
  const changedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  const token = createAuthToken(account);
  assert.equal((await runAuthenticate(token, { ...account, passwordChangedAt: changedAt })).nextCalled, true);
});
