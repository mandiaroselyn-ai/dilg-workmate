import crypto from 'node:crypto';

// A Google account with no WorkMate account yet fills in the sign-up form (its details and a
// WorkMate password) before its account is made. This token carries what Google verified
// (the email, Google's account ID, name, and picture) to that form and back to
// /api/register, signed so the email cannot be changed. It is not a session: it can only
// make a Pending account for that email, and it expires in 30 minutes.

const SIGN_UP_TTL_SECONDS = 30 * 60;

const getSecret = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be configured for Google sign-up.');
  return process.env.JWT_SECRET;
};

const sign = value => crypto.createHmac('sha256', getSecret()).update(`google-sign-up:${value}`).digest('base64url');

export const createGoogleSignUpToken = ({ email, googleId = '', name = '', picture = '' }) => {
  const payload = Buffer.from(JSON.stringify({
    email,
    googleId,
    name,
    picture,
    exp: Math.floor(Date.now() / 1000) + SIGN_UP_TTL_SECONDS
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
};

// Returns { email, googleId, name, picture } when the token is authentic and unexpired.
export const readGoogleSignUpToken = token => {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp <= Math.floor(Date.now() / 1000)) return null;
    if (typeof data.email !== 'string' || !data.email) return null;
    const text = value => (typeof value === 'string' ? value : '');
    return { email: data.email, googleId: text(data.googleId), name: text(data.name), picture: text(data.picture) };
  } catch {
    return null;
  }
};

// What the page gets for a Google account that still has to sign up. The phone app passes
// on only a user and a token from a Google sign-in, so the sign-up comes back in that shape,
// on the web and the phone alike, with the user marked googleSignUp.
export const googleSignUpResult = profile => ({
  token: createGoogleSignUpToken(profile),
  user: { googleSignUp: true, name: profile.name, email: profile.email }
});
