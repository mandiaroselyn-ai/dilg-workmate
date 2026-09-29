import crypto from 'node:crypto';

// The mobile Google sign-in returns through a custom URL scheme that any Android app
// could also register. Instead of putting the session token in that URL, the backend
// returns a short-lived hand-off code bound to a PKCE code challenge. Only the app that
// holds the matching code verifier can exchange it for a session token.

const HANDOFF_TTL_SECONDS = 2 * 60;
const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;

const getSecret = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be configured for mobile sign-in.');
  return process.env.JWT_SECRET;
};

const sign = value => crypto.createHmac('sha256', getSecret()).update(`mobile-handoff:${value}`).digest('base64url');

export const isValidCodeChallenge = value => typeof value === 'string' && CODE_CHALLENGE_PATTERN.test(value);

export const createCodeChallenge = verifier => crypto.createHash('sha256').update(verifier).digest('base64url');

export const createMobileHandoffCode = ({ userId, codeChallenge }) => {
  const payload = Buffer.from(JSON.stringify({
    sub: String(userId),
    codeChallenge,
    exp: Math.floor(Date.now() / 1000) + HANDOFF_TTL_SECONDS
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
};

// Returns the user ID when the code is authentic, unexpired and matches the verifier.
export const readMobileHandoffCode = (code, codeVerifier) => {
  if (typeof code !== 'string' || code.length > 1024) return null;
  if (typeof codeVerifier !== 'string' || !CODE_VERIFIER_PATTERN.test(codeVerifier)) return null;
  const [payload, signature] = code.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp <= Math.floor(Date.now() / 1000)) return null;
    const challenge = Buffer.from(createCodeChallenge(codeVerifier));
    const storedChallenge = Buffer.from(String(data.codeChallenge || ''));
    if (challenge.length !== storedChallenge.length || !crypto.timingSafeEqual(challenge, storedChallenge)) return null;
    return data.sub || null;
  } catch {
    return null;
  }
};
