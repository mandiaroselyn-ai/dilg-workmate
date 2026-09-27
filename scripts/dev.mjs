import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const nodeCommand = process.execPath;

console.log('Starting backend and frontend...');

const backend = spawn(nodeCommand, ['backend/src/index.js'], {
  cwd: rootDir,
  stdio: 'inherit',
});

let shuttingDown = false;

const waitForBackend = async () => {
  const deadline = Date.now() + 60000;

  while (!shuttingDown && Date.now() < deadline) {
    if (backend.exitCode !== null || backend.signalCode !== null) {
      throw new Error('Backend exited before it became ready.');
    }

    const ready = await new Promise(resolve => {
      const socket = net.createConnection({ host: '127.0.0.1', port: 5000 });
      const finish = result => {
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(500, () => finish(false));
      socket.once('connect', () => finish(true));
      socket.once('error', () => finish(false));
    });

    if (ready) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  if (!shuttingDown) {
    throw new Error('Backend did not become ready within 60 seconds.');
  }
};

let frontend = null;

const stopChildren = () => {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of [backend, frontend].filter(Boolean)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
    }
  }
};

const exitIfNeeded = (name, code) => {
  if (!shuttingDown && code && code !== 0) {
    console.error(`${name} exited with code ${code}`);
    stopChildren();
    process.exitCode = code;
  }
};

backend.on('exit', (code) => exitIfNeeded('backend', code));
backend.on('error', error => {
  console.error('Unable to start backend:', error);
  stopChildren();
  process.exitCode = 1;
});

process.on('SIGINT', stopChildren);
process.on('SIGTERM', stopChildren);

try {
  await waitForBackend();
  if (!shuttingDown) {
    frontend = spawn(nodeCommand, [
      'node_modules/vite/bin/vite.js',
      '--host',
      '--config',
      'vite.config.ts',
      '--port',
      '5173',
    ], {
      cwd: rootDir,
      stdio: 'inherit',
    });
    frontend.on('exit', code => exitIfNeeded('frontend', code));
    frontend.on('error', error => {
      console.error('Unable to start frontend:', error);
      stopChildren();
      process.exitCode = 1;
    });
  }
} catch (error) {
  console.error(error.message);
  stopChildren();
  process.exitCode = 1;
}
