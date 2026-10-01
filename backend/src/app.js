import express from 'express';
import userRoutes from './routes/userRoutes.js';
import staffRoutes from './routes/staffRoutes.js';
import dtrRoutes from './routes/dtrRoutes.js';
import leaveRoutes from './routes/leaveRoutes.js';
import travelRoutes from './routes/travelRoutes.js';
import announcementRoutes from './routes/announcementRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import googleAuthRoutes from './routes/googleAuthRoutes.js';
import { authenticate } from './middleware/auth.js';
import helmet from 'helmet';
import { createRateLimits } from './middleware/rateLimits.js';
import { apiErrorHandler, apiNotFound, validateApiBody } from './middleware/requestSecurity.js';
import { getAllowedFrontendOrigins } from './utils/frontendOrigin.js';

const API_CONTENT_SECURITY_POLICY = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

const isAllowedDevelopmentOrigin = origin => {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== 'http:') return false;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
    return /^10\./.test(hostname)
      || /^192\.168\./.test(hostname)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
  } catch {
    return false;
  }
};

export function createApiApp() {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.VERCEL) app.set('trust proxy', 1);
  else if (process.env.NODE_ENV !== 'production') app.set('trust proxy', 'loopback');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  // API responses are JSON, so they never need to load or run anything. The Google
  // callback page replaces this with a nonce-based policy for its one inline script.
  app.use('/api', (req, res, next) => {
    res.setHeader('Content-Security-Policy', API_CONTENT_SECURITY_POLICY);
    next();
  });
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  const allowedOrigins = getAllowedFrontendOrigins();
  if (allowedOrigins.size === 0) allowedOrigins.add('http://localhost:5173');
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    let requestOrigin;
    try {
      requestOrigin = origin ? new URL(origin).origin : null;
    } catch {
      return res.status(403).json({ success: false, error: 'Origin is not allowed.' });
    }
    if (requestOrigin && !allowedOrigins.has(requestOrigin) && !isAllowedDevelopmentOrigin(requestOrigin)) {
      return res.status(403).json({ success: false, error: 'Origin is not allowed.' });
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    next();
  });

  const { apiRateLimit, routeRateLimit } = createRateLimits();
  app.use('/api', apiRateLimit);
  app.use('/api', routeRateLimit);
  app.use('/api', validateApiBody);

  app.use('/api', (req, res, next) => {
    const apiPath = new URL(req.originalUrl, 'http://localhost').pathname.replace(/^\/api/, '');
    const publicRoutes = [
      req.method === 'POST' && ['/login', '/account-status', '/register', '/password-reset-request', '/password-reset-hr-request', '/password-reset', '/auth/google/exchange'].includes(apiPath),
      req.method === 'GET' && apiPath.startsWith('/auth/google'),
      req.method === 'POST' && apiPath === '/sms/webhook'
    ];
    if (publicRoutes.some(Boolean)) return next();
    return authenticate(req, res, next);
  });

  app.use('/api', userRoutes);
  app.use('/api', staffRoutes);
  app.use('/api', dtrRoutes);
  app.use('/api/dtr', dtrRoutes);
  app.use('/api', leaveRoutes);
  app.use('/api', travelRoutes);
  app.use('/api', announcementRoutes);
  app.use('/api', documentRoutes);
  app.use('/api/auth', googleAuthRoutes);
  app.use('/api', apiNotFound);
  app.use(apiErrorHandler);
  return app;
}