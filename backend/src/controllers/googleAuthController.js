import crypto from 'crypto';
import { User } from '../models/User.js';
import { toSafeUser } from '../utils/passwordSecurity.js';
import { createAuthToken } from '../utils/authToken.js';
import { getFrontendOrigin } from '../utils/frontendOrigin.js';

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

function createState(mobile) {
  const payload = `${Date.now()}.${crypto.randomBytes(16).toString('hex')}`;
  const signature = crypto.createHmac('sha256', getStateSecret()).update(payload).digest('base64url');
  return `${mobile ? 'mobile:' : ''}${payload}.${signature}`;
}

function isMobileState(state) {
  return typeof state === 'string' && state.startsWith('mobile:');
}

function isValidState(state) {
  if (typeof state !== 'string') return false;
  const value = state.replace(/^mobile:/, '');
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(crypto.createHmac('sha256', getStateSecret()).update(payload).digest('base64url'));
  const received = Buffer.from(parts[2]);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return false;
  return Date.now() - Number(parts[0]) <= 10 * 60 * 1000;
}

export const googleAuthUrl = (req, res) => {
  const mobile = req.query.mobile === '1';
  const redirectUri = getRedirectUri(req, mobile);
  if (!CLIENT_ID || !redirectUri) {
    return res.status(500).json({ success: false, error: 'Google OAuth is not configured.' });
  }

  const state = createState(mobile);
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
  const redirectUri = getRedirectUri(req, mobile);

  if (!code || !isValidState(state)) {
    return res.status(400).send('Missing Google authorization code.');
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
    if (!profile.email) {
      throw new Error('Google profile did not return an email address.');
    }

    const existingUser = await User.findByEmail(profile.email);
    let user;

    if (existingUser) {
      existingUser.googleId = profile.sub || existingUser.googleId;
      existingUser.profilePicture = profile.picture || existingUser.profilePicture;
      existingUser.name = profile.name || existingUser.name;
      await existingUser.save();
      user = existingUser;
    } else {
      user = await User.create({
        name: profile.name,
        email: profile.email.toLowerCase(),
        profilePicture: profile.picture || '',
        googleId: profile.sub || '',
        accessLevel: 'employee'
      });
    }

    if (isMobileState(state)) {
      const mobileRedirect = process.env.MOBILE_AUTH_REDIRECT_URI || 'com.dilg.workmate.employee://oauth';
      const redirect = new URL(mobileRedirect);
      redirect.searchParams.set('user', JSON.stringify(toSafeUser(user)));
      redirect.searchParams.set('token', createAuthToken(user));
      return res.redirect(redirect.toString());
    }

    const token = createAuthToken(user);
    const frontendOrigin = getFrontendOrigin(req);
    const successMessage = {
      type: 'google-login-success',
      token,
      user: toSafeUser(user)
    };
    const html = `
      <html>
        <body>
          <script>
            const message = ${JSON.stringify(successMessage)};
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage(message, ${JSON.stringify(frontendOrigin)});
              window.close();
            } else {
              window.location.replace(${JSON.stringify(`${frontendOrigin}/#google-auth=`)} + encodeURIComponent(JSON.stringify(message)));
            }
          </script>
        </body>
      </html>
    `;
    res.status(200).send(html);
  } catch (error) {
    console.error('Google auth callback error', error);
    if (mobile) {
      const mobileRedirect = process.env.MOBILE_AUTH_REDIRECT_URI || 'com.dilg.workmate.employee://oauth';
      const redirect = new URL(mobileRedirect);
      redirect.searchParams.set('error', error.message || 'Google sign-in failed.');
      return res.redirect(redirect.toString());
    }
    const frontendOrigin = getFrontendOrigin(req);
    const failureMessage = { type: 'google-login-failure', error: error.message || 'Google sign-in failed.' };
    const html = `
      <html>
        <body>
          <script>
            const message = ${JSON.stringify(failureMessage)};
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage(message, ${JSON.stringify(frontendOrigin)});
              window.close();
            } else {
              window.location.replace(${JSON.stringify(`${frontendOrigin}/#google-auth=`)} + encodeURIComponent(JSON.stringify(message)));
            }
          </script>
        </body>
      </html>
    `;
    res.status(500).send(html);
  }
};
