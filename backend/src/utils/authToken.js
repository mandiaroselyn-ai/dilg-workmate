import crypto from 'node:crypto';

// How long a sign-in lasts: a work day by default, a week on a computer when "Remember me"
// is checked, and 30 days in the WorkMate phone app on the employee's own phone. Deactivating
// the account or changing the password still ends every session at once (see auth.js).
export const TOKEN_TTL_SECONDS = 8 * 60 * 60;
export const REMEMBERED_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
export const PHONE_APP_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export const sessionLengthFor = ({ platform, remember } = {}) => {
  if (platform === 'mobile') return PHONE_APP_TOKEN_TTL_SECONDS;
  return remember === true ? REMEMBERED_TOKEN_TTL_SECONDS : TOKEN_TTL_SECONDS;
};

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'your_secret_key_here') {
    throw new Error('JWT_SECRET must be configured with a strong secret.');
  }
  return secret;
};

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const decode = value => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

const sign = value => crypto
  .createHmac('sha256', getSecret())
  .update(value)
  .digest('base64url');

export const createAuthToken = (user, ttlSeconds = TOKEN_TTL_SECONDS) => {
  const lifetime = Number.isFinite(ttlSeconds) && ttlSeconds > 0
    ? Math.min(ttlSeconds, PHONE_APP_TOKEN_TTL_SECONDS)
    : TOKEN_TTL_SECONDS;
  const header = encode({ alg: 'HS256', typ: 'DILG' });
  const payload = encode({
    sub: String(user._id || user.id || user.employeeId || user.email),
    email: user.email,
    accessLevel: user.accessLevel || 'employee',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + lifetime
  });
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${sign(unsigned)}`;
};

export const verifyAuthToken = token => {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const unsigned = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(unsigned));
  const received = Buffer.from(parts[2]);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;

  const payload = decode(parts[1]);
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload;
};

// How long a session was given, from its token, so a token replacing it keeps that length.
export const sessionLengthOf = claims => {
  const length = Number(claims?.exp) - Number(claims?.iat);
  return Number.isFinite(length) && length > 0 ? length : TOKEN_TTL_SECONDS;
};

// When the token was issued, in milliseconds. Tokens created before `iat` was added
// are dated from their expiry time.
export const tokenIssuedAtMs = claims => 1000 * (Number.isFinite(claims?.iat) ? claims.iat : Number(claims?.exp) - TOKEN_TTL_SECONDS);