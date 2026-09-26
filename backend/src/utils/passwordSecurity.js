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
    webauthnCredentialId,
    webauthnPublicKey,
    webauthnChallenge,
    webauthnChallengeExpiry,
    ...safeUser
  } = plainUser;
  return safeUser;
};
