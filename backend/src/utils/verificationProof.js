import crypto from 'node:crypto';

const PROOF_TTL_SECONDS = 5 * 60;

const getSecret = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be configured for biometric proofs.');
  return process.env.JWT_SECRET;
};

const sign = value => crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');

// `method` names the registered fingerprint that was checked: 'browser' or 'phone-app'.
export const createVerificationProof = ({ employeeId, type, confidence = 0, method = '' }) => {
  const payload = Buffer.from(JSON.stringify({
    employeeId,
    type,
    confidence,
    method,
    // Unique ID so a Time In can mark this proof as used.
    jti: crypto.randomBytes(12).toString('base64url'),
    exp: Math.floor(Date.now() / 1000) + PROOF_TTL_SECONDS
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
};

// Returns the proof's contents when it is authentic, unexpired, and issued for this
// employee and verification type; otherwise null.
export const readVerificationProof = (proof, { employeeId, type }) => {
  if (!proof || typeof proof !== 'string') return null;
  const [payload, signature] = proof.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.employeeId === employeeId && data.type === type && data.exp > Math.floor(Date.now() / 1000) ? data : null;
  } catch {
    return null;
  }
};

export const verifyVerificationProof = (proof, expected) => Boolean(readVerificationProof(proof, expected));