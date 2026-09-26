import crypto from 'node:crypto';

const TOKEN_TTL_SECONDS = 8 * 60 * 60;

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

export const createAuthToken = user => {
  const header = encode({ alg: 'HS256', typ: 'DILG' });
  const payload = encode({
    sub: String(user._id || user.id || user.employeeId || user.email),
    email: user.email,
    accessLevel: user.accessLevel || 'employee',
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
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