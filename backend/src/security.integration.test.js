import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.UNISMS_WEBHOOK_SECRET = 'integration-webhook-secret';

const { createApiApp } = await import('./app.js');
const { authorizeRoles } = await import('./middleware/auth.js');
const { createVerificationProof, verifyVerificationProof } = await import('./utils/verificationProof.js');

const app = createApiApp();

test('rejects protected API requests without a bearer token', async () => {
  const response = await request(app).get('/api/state');
  assert.equal(response.status, 401);
  assert.equal(response.body.error, 'Authentication required.');
});

test('rejects requests from an unapproved origin', async () => {
  const response = await request(app)
    .get('/api/state')
    .set('Origin', 'https://untrusted.example');
  assert.equal(response.status, 403);
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
