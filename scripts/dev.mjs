import { spawn } from 'node:child_process';
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

const frontend = spawn(nodeCommand, [
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

let shuttingDown = false;

const stopChildren = () => {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of [backend, frontend]) {
    if (!child.killed) {
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
frontend.on('exit', (code) => exitIfNeeded('frontend', code));

process.on('SIGINT', stopChildren);
process.on('SIGTERM', stopChildren);
