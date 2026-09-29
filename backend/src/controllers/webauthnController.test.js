import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'webauthn-test-secret';
process.env.FRONTEND_URL = 'https://dilg-workmate.vercel.app';
process.env.WEBAUTHN_RP_ID = 'dilg-workmate.vercel.app';
const { User } = await import('../models/User.js');
const { createAuthenticationOptions, registeredTransports } = await import('./webauthnController.js');

test('uses the phone\'s built-in sensor for registrations that did not record a transport', () => {
  assert.deepEqual(registeredTransports([]), ['internal']);
  assert.deepEqual(registeredTransports(undefined), ['internal']);
  assert.deepEqual(registeredTransports(['internal', 'hybrid', 'bogus']), ['internal', 'hybrid']);
});

test('Time In options point Chrome at the registered fingerprint on this phone', async () => {
  const originalSave = User.saveWebAuthnChallenge;
  User.saveWebAuthnChallenge = async () => ({});
  let statusCode = 200;
  let body;
  const res = { status(code) { statusCode = code; return this; }, json(value) { body = value; return this; } };
  try {
    await createAuthenticationOptions({
      user: { _id: '64b000000000000000000001', webauthnCredentialId: 'credential-abc', webauthnPublicKey: 'key', webauthnTransports: [] },
      headers: { host: 'dilg-workmate.vercel.app', origin: 'https://dilg-workmate.vercel.app' },
      get: () => undefined
    }, res);
  } finally {
    User.saveWebAuthnChallenge = originalSave;
  }
  assert.equal(statusCode, 200);
  assert.deepEqual(body.allowCredentials, [{ id: 'credential-abc', type: 'public-key', transports: ['internal'] }]);
  assert.equal(body.userVerification, 'required');
});
