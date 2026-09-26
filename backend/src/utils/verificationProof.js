import crypto from 'node:crypto';

const PROOF_TTL_SECONDS = 5 * 60;

const getSecret = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be configured for biometric proofs.');
  return process.env.JWT_SECRET;
};

const sign = value => crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');

export const createVerificationProof = ({ employeeId, type, confidence = 0 }) => {
  const payload = Buffer.from(JSON.stringify({
    employeeId,
    type,
    confidence,
    exp: Math.floor(Date.now() / 1000) + PROOF_TTL_SECONDS
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
};

export const verifyVerificationProof = (proof, { employeeId, type }) => {
  if (!proof || typeof proof !== 'string') return false;
  const [payload, signature] = proof.split('.');
  if (!payload || !signature) return false;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.employeeId === employeeId && data.type === type && data.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
};