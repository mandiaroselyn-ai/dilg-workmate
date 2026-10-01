import crypto from 'node:crypto';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

const WINDOW_MS = 15 * 60 * 1000;

// An office usually shares one internet connection (one IP address), so limits that count
// per IP would let a few people lock out the whole office. Signed-in requests are counted
// per session, and login attempts per email address on each connection.
const clientIp = req => ipKeyGenerator(req.ip || '');

const sessionOrIp = req => {
  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) return `ip:${clientIp(req)}`;
  return `session:${crypto.createHash('sha256').update(authorization.slice(7)).digest('base64url')}`;
};

const ipAndEmail = req => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  return `${clientIp(req)}|${email}`;
};

const limit = options => rateLimit({
  windowMs: WINDOW_MS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  ...options
});

export const createRateLimits = () => {
  // Applies to every API request except the app's check for updates, which it sends every
  // few seconds while open; that check only reads a few counts and still needs a login.
  const isUpdateCheck = req => req.method === 'GET'
    && new URL(req.originalUrl, 'http://localhost').pathname === '/api/updates';
  const apiRateLimit = limit({ limit: 300, keyGenerator: sessionOrIp, skip: isUpdateCheck });

  const signedInActionLimit = () => limit({ limit: 10, keyGenerator: sessionOrIp });
  // Only failed logins count: 10 per email on a connection, and at most 100 across
  // all emails from one connection to stop password guessing against many accounts.
  // The account status check also takes a password, so it shares these limits.
  const passwordCheckLimits = [
    limit({ limit: 100, keyGenerator: clientIp, skipSuccessfulRequests: true }),
    limit({ limit: 10, keyGenerator: ipAndEmail, skipSuccessfulRequests: true })
  ];
  const routeLimits = {
    '/login': passwordCheckLimits,
    '/account-status': passwordCheckLimits,
    // Every reset request sends an email, so all requests count, per email address.
    '/password-reset-request': [limit({ limit: 5, keyGenerator: ipAndEmail })],
    // Every request notifies HR, so a few per email, and 20 across all emails per connection.
    '/password-reset-hr-request': [
      limit({ limit: 20, keyGenerator: clientIp }),
      limit({ limit: 3, keyGenerator: ipAndEmail })
    ],
    '/register': [limit({ limit: 20, keyGenerator: clientIp })],
    '/change-password': [limit({ limit: 10, keyGenerator: sessionOrIp, skipSuccessfulRequests: true })],
    '/password-reset': [limit({ limit: 20, keyGenerator: clientIp, skipSuccessfulRequests: true })],
    '/auth/google/exchange': [limit({ limit: 20, keyGenerator: clientIp, skipSuccessfulRequests: true })],
    '/face/enrollment': [signedInActionLimit()],
    '/face-enrollment': [signedInActionLimit()],
    '/sms': [signedInActionLimit()],
    // Every certificate request notifies HR.
    '/documents/requests': [signedInActionLimit()]
  };
  const enrollmentReviewLimit = signedInActionLimit();
  // Staff account changes can require the HR password; failed attempts are limited.
  const staffChangeLimit = limit({ limit: 20, keyGenerator: sessionOrIp, skipSuccessfulRequests: true });

  const runLimiters = (limiters, req, res, next) => {
    const [first, ...rest] = limiters;
    if (!first) return next();
    return first(req, res, error => (error ? next(error) : runLimiters(rest, req, res, next)));
  };

  const routeRateLimit = (req, res, next) => {
    const apiPath = new URL(req.originalUrl, 'http://localhost').pathname.replace(/^\/api/, '');
    // Sending a text is limited; HR's SMS list reloads it with GET whenever it changes.
    const isSmsListRead = apiPath === '/sms' && req.method === 'GET';
    const limiters = (isSmsListRead ? [] : routeLimits[apiPath])
      || (/^\/face\/enrollment\/[^/]+\/review$/.test(apiPath) ? [enrollmentReviewLimit] : []);
    const staffLimiters = apiPath.startsWith('/staff') && req.method !== 'GET' ? [staffChangeLimit] : [];
    return runLimiters([...limiters, ...staffLimiters], req, res, next);
  };

  return { apiRateLimit, routeRateLimit };
};
