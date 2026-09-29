import crypto from 'crypto';
import { User } from '../models/User.js';
import { toSafeUser } from '../utils/passwordSecurity.js';
import { createAuthToken } from '../utils/authToken.js';
import { getFrontendOrigin } from '../utils/frontendOrigin.js';
import { createMobileHandoffCode, isValidCodeChallenge, readMobileHandoffCode } from '../utils/mobileAuthHandoff.js';

const GOOGLE_AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const getRequestOrigin = req => {
  const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host;
  const forwardedProto = req.headers['x-forwarded-proto'] || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  return forwardedHost ? `${forwardedProto}://${forwardedHost}` : null;
};

const normalizeOrigin = value => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const isAllowedLocalFrontendOrigin = origin => {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:') return false;
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return host === 'localhost'
      || host === '127.0.0.1'
      || host === '::1'
      || /^10\./.test(host)
      || /^192\.168\./.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  } catch {
    return false;
  }
};

const getDevelopmentFrontendOrigin = req => {
  const requestedOrigin = normalizeOrigin(req.query.frontendOrigin);
  return requestedOrigin && isAllowedLocalFrontendOrigin(requestedOrigin)
    ? requestedOrigin
    : null;
};

const getRedirectUri = (req, mobile) => {
  const configured = mobile ? process.env.GOOGLE_MOBILE_REDIRECT_URI : process.env.GOOGLE_REDIRECT_URI;
  if (configured && !configured.includes('localhost')) return configured;
  const origin = getRequestOrigin(req);
  return origin ? `${origin}/api/auth/google/callback` : configured || REDIRECT_URI;
};

function getStateSecret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be configured for Google OAuth.');
  return process.env.JWT_SECRET;
}

function createState(mobile, frontendOrigin, codeChallenge) {
  const payload = Buffer.from(JSON.stringify({
    createdAt: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex'),
    frontendOrigin: mobile ? null : frontendOrigin,
    codeChallenge: mobile ? codeChallenge : null
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', getStateSecret()).update(payload).digest('base64url');
  return `${mobile ? 'mobile:' : ''}${payload}.${signature}`;
}

function isMobileState(state) {
  return typeof state === 'string' && state.startsWith('mobile:');
}

function readState(state) {
  if (typeof state !== 'string') return false;
  const value = state.replace(/^mobile:/, '');
  const parts = value.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expected = Buffer.from(crypto.createHmac('sha256', getStateSecret()).update(payload).digest('base64url'));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const age = Date.now() - Number(decoded.createdAt);
    if (!Number.isFinite(age) || age < -60000 || age > 10 * 60 * 1000) return null;
    return decoded;
  } catch {
    return null;
  }
}

// Escapes characters that could close the inline <script> when embedding JSON in HTML.
const toScriptJson = value => JSON.stringify(value)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

const sendPopupResult = (res, status, frontendOrigin, message) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`);
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(`
      <html>
        <body>
          <script nonce="${nonce}">
            const message = ${toScriptJson(message)};
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage(message, ${toScriptJson(frontendOrigin)});
              window.close();
            } else {
              window.location.replace(${toScriptJson(`${frontendOrigin}/#google-auth=`)} + encodeURIComponent(JSON.stringify(message)));
            }
          </script>
        </body>
      </html>
    `);
};

export const googleAuthUrl =(req, res) => {
  const mobile = req.query.mobile === '1';
  const redirectUri = getRedirectUri(req, mobile);
  if (!CLIENT_ID || !redirectUri) {
    return res.status(500).json({ success: false, error: 'Google OAuth is not configured.' });
  }

  const codeChallenge = req.query.code_challenge;
  if (mobile && !isValidCodeChallenge(codeChallenge)) {
    return res.status(400).json({ success: false, error: 'Update the WorkMate app to sign in with Google.' });
  }

  const frontendOrigin = getDevelopmentFrontendOrigin(req);
  const state = createState(mobile, frontendOrigin, codeChallenge);
  const url = new URL(GOOGLE_AUTH_BASE);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');

  res.redirect(url.toString());
};

export const googleAuthCallback = async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;
  const mobile = isMobileState(state);
  const stateData = readState(state);
  const redirectUri = getRedirectUri(req, mobile);

  if (!code || !stateData) {
    return res.status(400).send('Google sign-in could not be validated. Please try again.');
  }

  try {
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      throw new Error(tokenData.error_description || 'Google token exchange failed.');
    }

    const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profile = await userInfoResponse.json();
    if (!profile.email || profile.email_verified !== true) {
      throw new Error('Google did not return a verified email address.');
    }

    // Google sign-in only links to accounts HR has already created and activated.
    const user = await User.findByEmail(profile.email);
    if (!user) {
      throw new Error('No WorkMate account uses this Google email. Ask the HR Administrator to create your account first.');
    }
    if (user.accountStatus && user.accountStatus.toLowerCase() !== 'active') {
      throw new Error(`This account is ${user.accountStatus.toLowerCase()}. Please contact the HR Administrator.`);
    }
    user.googleId = profile.sub || user.googleId;
    user.profilePicture = profile.picture || user.profilePicture;
    user.name = profile.name || user.name;
    await user.save();

    if (mobile) {
      const mobileRedirect = process.env.MOBILE_AUTH_REDIRECT_URI || 'com.dilg.workmate.employee://oauth';
      const redirect = new URL(mobileRedirect);
      redirect.searchParams.set('code', createMobileHandoffCode({ userId: user._id, codeChallenge: stateData.codeChallenge }));
      return res.redirect(redirect.toString());
    }

    const frontendOrigin = stateData.frontendOrigin || getFrontendOrigin(req);
    sendPopupResult(res, 200, frontendOrigin, {
      type: 'google-login-success',
      token: createAuthToken(user),
      user: toSafeUser(user)
    });
  } catch (error) {
    console.error('Google auth callback error', error);
    if (mobile) {
      const mobileRedirect = process.env.MOBILE_AUTH_REDIRECT_URI || 'com.dilg.workmate.employee://oauth';
      const redirect = new URL(mobileRedirect);
      redirect.searchParams.set('error', error.message || 'Google sign-in failed.');
      return res.redirect(redirect.toString());
    }
    const frontendOrigin = stateData?.frontendOrigin || getFrontendOrigin(req);
    sendPopupResult(res, 500, frontendOrigin, { type: 'google-login-failure', error: error.message || 'Google sign-in failed.' });
  }
};

export const googleMobileExchange = async (req, res) => {
  try {
    const userId = readMobileHandoffCode(req.body?.code, req.body?.codeVerifier);
    const user = userId ? await User.findById(userId) : null;
    if (!user || (user.accountStatus && user.accountStatus.toLowerCase() !== 'active')) {
      return res.status(401).json({ success: false, error: 'Google sign-in expired. Please try again.' });
    }
    return res.status(200).json({ success: true, token: createAuthToken(user), user: toSafeUser(user) });
  } catch (error) {
    console.error('Google mobile sign-in exchange failed:', error);
    return res.status(500).json({ success: false, error: 'Google sign-in failed.' });
  }
};
