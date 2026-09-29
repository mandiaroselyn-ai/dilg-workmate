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
  // Applies to every API request.
  const apiRateLimit = limit({ limit: 300, keyGenerator: sessionOrIp });

  const signedInActionLimit = () => limit({ limit: 10, keyGenerator: sessionOrIp });
  const routeLimits = {
    // Only failed logins count: 10 per email on a connection, and at most 100 across
    // all emails from one connection to stop password guessing against many accounts.
    '/login': [
      limit({ limit: 100, keyGenerator: clientIp, skipSuccessfulRequests: true }),
      limit({ limit: 10, keyGenerator: ipAndEmail, skipSuccessfulRequests: true })
    ],
    // Every reset request sends an email, so all requests count, per email address.
    '/password-reset-request': [limit({ limit: 5, keyGenerator: ipAndEmail })],
    '/register': [limit({ limit: 20, keyGenerator: clientIp })],
    '/change-password': [limit({ limit: 10, keyGenerator: sessionOrIp, skipSuccessfulRequests: true })],
    '/password-reset': [limit({ limit: 20, keyGenerator: clientIp, skipSuccessfulRequests: true })],
    '/auth/google/exchange': [limit({ limit: 20, keyGenerator: clientIp, skipSuccessfulRequests: true })],
    '/face/enrollment': [signedInActionLimit()],
    '/face-enrollment': [signedInActionLimit()],
    '/sms': [signedInActionLimit()]
  };
  const enrollmentReviewLimit = signedInActionLimit();

  const runLimiters = (limiters, req, res, next) => {
    const [first, ...rest] = limiters;
    if (!first) return next();
    return first(req, res, error => (error ? next(error) : runLimiters(rest, req, res, next)));
  };

  const routeRateLimit = (req, res, next) => {
    const apiPath = new URL(req.originalUrl, 'http://localhost').pathname.replace(/^\/api/, '');
    const limiters = routeLimits[apiPath]
      || (/^\/face\/enrollment\/[^/]+\/review$/.test(apiPath) ? [enrollmentReviewLimit] : []);
    return runLimiters(limiters, req, res, next);
  };

  return { apiRateLimit, routeRateLimit };
};
