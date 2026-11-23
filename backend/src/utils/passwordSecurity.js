import { timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$/;

export const isPasswordHash = (value) => typeof value === 'string' && BCRYPT_HASH_PATTERN.test(value);

export const hashPassword = (password) => bcrypt.hash(password, 12);

export const verifyPassword = async (password, storedPassword) => {
  if (typeof password !== 'string' || typeof storedPassword !== 'string' || !storedPassword) return false;
  if (isPasswordHash(storedPassword)) return bcrypt.compare(password, storedPassword);

  const submitted = Buffer.from(password, 'utf8');
  const stored = Buffer.from(storedPassword, 'utf8');
  return submitted.length === stored.length && timingSafeEqual(submitted, stored);
};

export const toSafeUser = (user) => {
  if (!user) return null;
  const plainUser = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  const {
    password,
    resetToken,
    resetTokenExpiry,
    fingerprintHash,
    faceId,
    faceEnrollmentImage,
    faceEnrollmentDescriptor,
    dilgIdPhoto,
    dilgIdBackPhoto,
    enrollmentIdNumber,
    dilgIdVerifiedBy,
    dilgIdVerifiedDetails,
    faceVerificationAudit,
    webauthnCredentialId,
    webauthnPublicKey,
    webauthnChallenge,
    webauthnChallengeExpiry,
    webauthnChallenges,
    nativeBiometricPublicKey,
    nativeBiometricChallenge,
    nativeBiometricChallengeExpiry,
    nativeBiometricChallengeReplacesKey,
    nativeBiometricPendingKey,
    nativeBiometricPendingAt,
    webauthnPendingCredential,
    ...safeUser
  } = plainUser;
  return {
    ...safeUser,
    hasPassword: Boolean(password),
    // Whether a fingerprint is registered for Time In (browser passkey or phone app).
    hasBrowserFingerprint: Boolean(webauthnCredentialId && webauthnPublicKey),
    hasPhoneFingerprint: Boolean(nativeBiometricPublicKey),
    ...pendingFingerprints({ nativeBiometricPendingKey, nativeBiometricPendingAt, webauthnPendingCredential })
  };
};

// When a new phone or browser fingerprint was registered in place of the old one and is
// waiting for HR to approve it (null when none is waiting).
export const pendingFingerprints = user => ({
  phoneFingerprintPendingAt: user?.nativeBiometricPendingKey ? user.nativeBiometricPendingAt || new Date(0) : null,
  browserFingerprintPendingAt: user?.webauthnPendingCredential?.id ? user.webauthnPendingCredential.requestedAt || new Date(0) : null
});

// The requester's details sent with each request. Supervisors see every request, so this
// is only what reviewing a request and filling its official form need: no home address,
// birthday, government ID numbers, or emergency contact. The profile photo is left out
// too, as it would be repeated in every request.
const REQUESTER_FIELDS = [
  '_id', 'id', 'name', 'firstName', 'middleName', 'lastName', 'suffix', 'email', 'employeeId',
  'role', 'office', 'region', 'division', 'salary', 'accessLevel', 'accountStatus', 'employmentStatus'
];

export const toRequesterProfile = (user) => {
  const safeUser = toSafeUser(user);
  if (!safeUser) return null;
  return Object.fromEntries(REQUESTER_FIELDS.filter(field => safeUser[field] !== undefined).map(field => [field, safeUser[field]]));
};
