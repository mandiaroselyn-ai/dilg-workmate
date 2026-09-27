import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, isPasswordHash, toSafeUser, verifyPassword } from './passwordSecurity.js';

test('hashes passwords and verifies only the matching value', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.equal(isPasswordHash(hash), true);
  assert.equal(await verifyPassword('correct horse battery staple', hash), true);
  assert.equal(await verifyPassword('incorrect password', hash), false);
});

test('allows a legacy plaintext password to be verified during migration', async () => {
  assert.equal(await verifyPassword('legacy-password', 'legacy-password'), true);
  assert.equal(await verifyPassword('wrong-password', 'legacy-password'), false);
});

test('removes authentication and biometric secrets from API user objects', () => {
  const safeUser = toSafeUser({
    email: 'employee@example.com',
    password: 'hash',
    resetToken: 'token',
    resetTokenExpiry: new Date(),
    fingerprintHash: 'fingerprint',
    faceId: 'face-id',
    faceEnrollmentImage: 'private-enrollment-selfie',
    faceEnrollmentDescriptor: Array(128).fill(0.1),
    dilgIdPhoto: 'private-id-image',
    dilgIdBackPhoto: 'private-id-back-image',
    dilgIdVerifiedBy: 'hr-user',
    dilgIdVerifiedDetails: { name: 'Employee' },
    biometricEnrollmentStatus: 'pending',
    biometricEnrollmentReviewNote: 'private HR note',
    faceLivenessStatus: 'not-configured',
    faceVerificationAudit: [{ outcome: 'verified' }]
  });

  assert.equal('faceEnrollmentDescriptor' in safeUser, false);
  assert.deepEqual(safeUser, {
    email: 'employee@example.com',
    biometricEnrollmentStatus: 'pending',
    biometricEnrollmentReviewNote: 'private HR note',
    faceLivenessStatus: 'not-configured'
  });
});