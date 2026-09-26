import 'dotenv/config';
import { createApiApp } from '../backend/src/app.js';
import { connectDB } from '../backend/src/config/db.js';
import { User } from '../backend/src/models/User.js';

const app = createApiApp();
let initializationPromise;

export default async function handler(req, res) {
  try {
    if (!initializationPromise) {
      initializationPromise = (async () => {
        await connectDB();
        if (process.env.SEED_DEFAULT_ACCOUNTS === 'true') {
          await User.seedDefaultAccounts?.();
        }
      })();
    }
    await initializationPromise;
    return app(req, res);
  } catch (error) {
    initializationPromise = undefined;
    console.error('Vercel API initialization failed:', error);
    return res.status(500).json({ success: false, error: 'API initialization failed.' });
  }
}