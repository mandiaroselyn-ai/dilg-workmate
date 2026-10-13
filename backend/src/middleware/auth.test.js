import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'auth-middleware-test-secret';
const { authenticate } = await import('./auth.js');
const { User } = await import('../models/User.js');
const {
  createAuthToken,
  sessionLengthFor,
  sessionLengthOf,
  verifyAuthToken,
  TOKEN_TTL_SECONDS,
  REMEMBERED_TOKEN_TTL_SECONDS,
  PHONE_APP_TOKEN_TTL_SECONDS
} = await import('../utils/authToken.js');

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

test('a session lasts 8 hours, 7 days with Remember me, and 30 days in the phone app', () => {
  assert.equal(TOKEN_TTL_SECONDS, 8 * 60 * 60);
  assert.equal(sessionLengthFor({ platform: 'web' }), TOKEN_TTL_SECONDS);
  assert.equal(sessionLengthFor({ platform: 'web', remember: true }), REMEMBERED_TOKEN_TTL_SECONDS);
  assert.equal(REMEMBERED_TOKEN_TTL_SECONDS, 7 * 24 * 60 * 60);
  assert.equal(sessionLengthFor({ platform: 'mobile' }), PHONE_APP_TOKEN_TTL_SECONDS);
  assert.equal(PHONE_APP_TOKEN_TTL_SECONDS, 30 * 24 * 60 * 60);
  // Only a real true counts, so a stray "false" string does not stretch the session.
  assert.equal(sessionLengthFor({ remember: 'false' }), TOKEN_TTL_SECONDS);
});

test('a token carries its session length, and a replacement keeps it', () => {
  const claims = verifyAuthToken(createAuthToken(account, REMEMBERED_TOKEN_TTL_SECONDS));
  assert.equal(claims.exp - claims.iat, REMEMBERED_TOKEN_TTL_SECONDS);
  assert.equal(sessionLengthOf(claims), REMEMBERED_TOKEN_TTL_SECONDS);
  const defaultClaims = verifyAuthToken(createAuthToken(account));
  assert.equal(defaultClaims.exp - defaultClaims.iat, TOKEN_TTL_SECONDS);
  // No session is made longer than the phone app's.
  const capped = verifyAuthToken(createAuthToken(account, 365 * 24 * 60 * 60));
  assert.equal(capped.exp - capped.iat, PHONE_APP_TOKEN_TTL_SECONDS);
});

test('keeps the session that made the change, whose new token is issued right after it', async () => {
  const changedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  const token = createAuthToken(account);
  assert.equal((await runAuthenticate(token, { ...account, passwordChangedAt: changedAt })).nextCalled, true);
});
