import express from 'express';
import userRoutes from './routes/userRoutes.js';
import dtrRoutes from './routes/dtrRoutes.js';
import leaveRoutes from './routes/leaveRoutes.js';
import travelRoutes from './routes/travelRoutes.js';
import announcementRoutes from './routes/announcementRoutes.js';
import googleAuthRoutes from './routes/googleAuthRoutes.js';
import { authenticate } from './middleware/auth.js';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { apiErrorHandler, apiNotFound, validateApiBody } from './middleware/requestSecurity.js';

export function createApiApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && origin !== allowedOrigin) return res.status(403).json({ success: false, error: 'Origin is not allowed.' });
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    next();
  });

  const apiRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false });
  const strictRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });
  app.use('/api', apiRateLimit);
  app.use('/api', (req, res, next) => {
    const apiPath = new URL(req.originalUrl, 'http://localhost').pathname.replace(/^\/api/, '');
    const limitedPaths = ['/login', '/password-reset-request', '/password-reset', '/face/verify', '/sms'];
    if (!limitedPaths.includes(apiPath)) return next();
    return strictRateLimit(req, res, next);
  });
  app.use('/api', validateApiBody);

  app.use('/api', (req, res, next) => {
    const apiPath = new URL(req.originalUrl, 'http://localhost').pathname.replace(/^\/api/, '');
    const publicRoutes = [
      req.method === 'POST' && ['/login', '/register', '/password-reset-request', '/password-reset'].includes(apiPath),
      req.method === 'GET' && apiPath.startsWith('/auth/google'),
      req.method === 'POST' && apiPath === '/sms/webhook'
    ];
    if (publicRoutes.some(Boolean)) return next();
    return authenticate(req, res, next);
  });

  app.use('/api', userRoutes);
  app.use('/api', dtrRoutes);
  app.use('/api/dtr', dtrRoutes);
  app.use('/api', leaveRoutes);
  app.use('/api', travelRoutes);
  app.use('/api', announcementRoutes);
  app.use('/api/auth', googleAuthRoutes);
  app.use('/api', apiNotFound);
  app.use(apiErrorHandler);
  return app;
}