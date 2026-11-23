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
    faceVerificationAudit: [{ outcome: 'verified' }],
    webauthnChallenges: [{ challenge: 'private-pending-challenge' }],
    nativeBiometricPublicKey: 'native-public-key',
    nativeBiometricChallenge: 'active-native-challenge',
    nativeBiometricChallengeExpiry: new Date(),
    nativeBiometricPendingKey: 'new-phone-public-key',
    nativeBiometricPendingAt: new Date('2026-11-24T01:00:00Z'),
    webauthnPendingCredential: { id: 'new-passkey', publicKey: 'new-passkey-public-key', requestedAt: new Date('2026-11-24T02:00:00Z') }
  });

  assert.equal('faceEnrollmentDescriptor' in safeUser, false);
  assert.equal('webauthnChallenges' in safeUser, false);
  assert.equal('nativeBiometricPublicKey' in safeUser, false);
  assert.equal('nativeBiometricChallenge' in safeUser, false);
  assert.equal('nativeBiometricPendingKey' in safeUser, false);
  assert.equal('webauthnPendingCredential' in safeUser, false);
  assert.deepEqual(safeUser, {
    email: 'employee@example.com',
    biometricEnrollmentStatus: 'pending',
    biometricEnrollmentReviewNote: 'private HR note',
    faceLivenessStatus: 'not-configured',
    // Only whether a password exists is shared, never the password itself.
    hasPassword: true,
    // Only yes/no flags about registered fingerprints are shared, never keys.
    hasBrowserFingerprint: false,
    hasPhoneFingerprint: true,
    // A new phone or browser fingerprint waiting for HR: only when it was registered.
    phoneFingerprintPendingAt: new Date('2026-11-24T01:00:00Z'),
    browserFingerprintPendingAt: new Date('2026-11-24T02:00:00Z')
  });
});