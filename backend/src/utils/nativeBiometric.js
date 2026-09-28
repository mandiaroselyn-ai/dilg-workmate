import crypto from 'node:crypto';

export const createNativeBiometricChallenge = () => crypto.randomBytes(32).toString('base64url');

export const verifyNativeBiometricSignature = ({ publicKey, challenge, signature }) => {
  if (typeof publicKey !== 'string' || typeof challenge !== 'string' || typeof signature !== 'string') return false;

  try {
    const key = crypto.createPublicKey({
      key: Buffer.from(publicKey, 'base64url'),
      format: 'der',
      type: 'spki'
    });
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') return false;
    return crypto.verify(
      'sha256',
      Buffer.from(challenge, 'utf8'),
      key,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    return false;
  }
};
