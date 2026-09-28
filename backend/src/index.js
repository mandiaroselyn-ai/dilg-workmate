import './config/env.js';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { connectDB } from './config/db.js';
import { User } from './models/User.js';
import { createApiApp } from './app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5000;

async function startServer() {
  // 1. Establish database connection using MongoDB Atlas only
  await connectDB();
  await User.seedDefaultAccounts?.();

  const app = createApiApp();

  // 3. Dynamic Host Interface for dev mode and static deployment deliveries
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      root: path.resolve(__dirname, '../../'),
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        allowedHosts: [new URL(process.env.FRONTEND_URL || 'http://localhost:5173').hostname],
        // Expo/Metro owns the native project files; web Vite must not watch them.
        watch: {
          ignored: ['**/mobile/**']
        }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, '../../dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // 4. Ingress Route Listener setup
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`DILG WorkMate backend hub is running beautifully at http://localhost:${PORT}`);
  });

  server.on('error', error => {
    if (error.code === 'EADDRINUSE') {
      console.log(`DILG WorkMate backend is already running on port ${PORT}.`);
      return;
    }
    console.error('Backend server error:', error);
    process.exitCode = 1;
  });
}

startServer();
