import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'mobile-handoff-test-secret';

const {
  createCodeChallenge,
  createMobileHandoffCode,
  isValidCodeChallenge,
  readMobileHandoffCode
} = await import('./mobileAuthHandoff.js');

const verifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = createCodeChallenge(verifier);

test('accepts a hand-off code only with the matching code verifier', () => {
  const code = createMobileHandoffCode({ userId: 'user-1', codeChallenge });
  assert.equal(readMobileHandoffCode(code, verifier), 'user-1');
  assert.equal(readMobileHandoffCode(code, crypto.randomBytes(32).toString('base64url')), null);
});

test('rejects a hand-off code whose payload was changed', () => {
  const code = createMobileHandoffCode({ userId: 'user-1', codeChallenge });
  const [, signature] = code.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({
    sub: 'hr-admin',
    codeChallenge,
    exp: Math.floor(Date.now() / 1000) + 60
  })).toString('base64url');
  assert.equal(readMobileHandoffCode(`${forgedPayload}.${signature}`, verifier), null);
});

test('rejects an expired hand-off code', (t) => {
  const code = createMobileHandoffCode({ userId: 'user-1', codeChallenge });
  const now = Date.now();
  t.mock.method(Date, 'now', () => now + 3 * 60 * 1000);
  assert.equal(readMobileHandoffCode(code, verifier), null);
});

test('validates the code challenge format', () => {
  assert.equal(isValidCodeChallenge(codeChallenge), true);
  assert.equal(isValidCodeChallenge('short'), false);
  assert.equal(isValidCodeChallenge(undefined), false);
});
