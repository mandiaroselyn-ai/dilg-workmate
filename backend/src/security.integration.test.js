import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'integration-google-client-id';
process.env.GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback';
process.env.UNISMS_WEBHOOK_SECRET = 'integration-webhook-secret';

const { createApiApp } = await import('./app.js');
const { authorizeRoles } = await import('./middleware/auth.js');
const { createVerificationProof, verifyVerificationProof } = await import('./utils/verificationProof.js');
const { verifyNativeBiometricSignature } = await import('./utils/nativeBiometric.js');

const app = createApiApp();

test('rejects protected API requests without a bearer token', async () => {
  const response = await request(app).get('/api/state');
  assert.equal(response.status, 401);
  assert.equal(response.headers['x-authentication-error'], 'true');
  assert.equal(response.body.error, 'Authentication required.');
});

test('requires authentication before employee biometric enrollment submission', async () => {
  const response = await request(app).post('/api/face/enrollment').send({});
  assert.equal(response.status, 401);
  assert.equal(response.body.error, 'Authentication required.');
});

test('requires authentication on the local flat biometric enrollment API', async () => {
  const statusResponse = await request(app).get('/api/face-enrollment?action=status');
  const submissionResponse = await request(app).post('/api/face-enrollment').send({});
  assert.equal(statusResponse.status, 401);
  assert.equal(submissionResponse.status, 401);
});

test('requires authentication for native biometric challenge endpoints', async () => {
  const [options, verify] = await Promise.all([
    request(app).post('/api/biometric/native/options'),
    request(app).post('/api/biometric/native/verify').send({})
  ]);
  assert.equal(options.status, 401);
  assert.equal(verify.status, 401);
});

test('requires authentication for HR employee account management', async () => {
  const createResponse = await request(app).post('/api/employees').send({});
  const updateResponse = await request(app).patch('/api/employees/DILG-TEST-001').send({});
  const statusResponse = await request(app)
    .patch('/api/employees/DILG-TEST-001/status')
    .send({ accountStatus: 'Inactive' });

  assert.equal(createResponse.status, 401);
  assert.equal(updateResponse.status, 401);
  assert.equal(statusResponse.status, 401);
});

test('requires authentication before HR biometric enrollment review', async () => {
  const responses = await Promise.all([
    request(app).post('/api/face/enrollment/DILG-TEST-001/review').send({}),
    request(app).post('/api/face/enrollment/id/507f1f77bcf86cd799439011/review').send({}),
    request(app)
      .post('/api/face-enrollment?action=review&employeeId=DILG-TEST-001&userId=507f1f77bcf86cd799439011')
      .send({})
  ]);
  for (const response of responses) {
    assert.equal(response.status, 401);
    assert.equal(response.body.error, 'Authentication required.');
  }
});

test('requires authentication before loading restricted biometric enrollment images', async () => {
  const [employeeIdResponse, userIdResponse] = await Promise.all([
    request(app).get('/api/face/enrollment/DILG-TEST-001'),
    request(app).get('/api/face/enrollment/id/507f1f77bcf86cd799439011')
  ]);
  assert.equal(employeeIdResponse.status, 401);
  assert.equal(employeeIdResponse.body.error, 'Authentication required.');
  assert.equal(userIdResponse.status, 401);
  assert.equal(userIdResponse.body.error, 'Authentication required.');
});

test('rejects requests from an unapproved origin', async () => {
  const response = await request(app)
    .get('/api/state')
    .set('Origin', 'https://untrusted.example');
  assert.equal(response.status, 403);
});

test('binds local Google OAuth state to the active frontend origin', async () => {
  const response = await request(app)
    .get('/api/auth/google/url')
    .query({ frontendOrigin: 'http://localhost:5174' });

  assert.equal(response.status, 302);
  const state = new URL(response.headers.location).searchParams.get('state');
  const [payload, signature] = state.split('.');
  const expectedSignature = crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(payload)
    .digest('base64url');
  assert.equal(signature, expectedSignature);
  assert.equal(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).frontendOrigin, 'http://localhost:5174');
});

test('keeps the SMS webhook public but validates its payload', async () => {
  const response = await request(app)
    .post('/api/sms/webhook')
    .set('webhook-secret-key', process.env.UNISMS_WEBHOOK_SECRET)
    .send({});
  assert.equal(response.status, 400);
  assert.match(response.body.error, /sender and message content/i);
});

test('role middleware rejects an employee from an admin action', () => {
  let statusCode;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json() {
      return this;
    }
  };
  authorizeRoles('hr_admin')({ user: { accessLevel: 'employee' } }, response, () => {
    throw new Error('employee should not reach the protected handler');
  });
  assert.equal(statusCode, 403);
});

test('biometric proofs are bound to employee and type', () => {
  const proof = createVerificationProof({ employeeId: 'DILG-TEST-001', type: 'face', confidence: 99 });
  const fingerprintProof = createVerificationProof({ employeeId: 'DILG-TEST-001', type: 'fingerprint' });
  assert.equal(verifyVerificationProof(proof, { employeeId: 'DILG-TEST-001', type: 'face' }), true);
  assert.equal(verifyVerificationProof(proof, { employeeId: 'DILG-TEST-002', type: 'face' }), false);
  assert.equal(verifyVerificationProof(`${proof}tampered`, { employeeId: 'DILG-TEST-001', type: 'face' }), false);
  assert.equal(verifyVerificationProof(fingerprintProof, { employeeId: 'DILG-TEST-001', type: 'fingerprint' }), true);
  assert.equal(verifyVerificationProof('malformed', { employeeId: 'DILG-TEST-001', type: 'fingerprint' }), false);
});

test('validates native biometric signatures against P-256 public keys and exact challenges', () => {
  const challenge = 'challenge-for-native-biometric';
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const encodedPublicKey = publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
  const signature = crypto.sign('sha256', Buffer.from(challenge), privateKey).toString('base64url');
  assert.equal(verifyNativeBiometricSignature({
    publicKey: encodedPublicKey,
    challenge,
    signature
  }), true);
  assert.equal(verifyNativeBiometricSignature({
    publicKey: encodedPublicKey,
    challenge: `${challenge}-changed`,
    signature
  }), false);

  const otherCurve = crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
  assert.equal(verifyNativeBiometricSignature({
    publicKey: otherCurve.publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'),
    challenge,
    signature
  }), false);
});
