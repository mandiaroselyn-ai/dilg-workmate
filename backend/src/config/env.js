import 'dotenv/config';
import dotenv from 'dotenv';
import path from 'node:path';
import { existsSync } from 'node:fs';

const backendEnvPath = path.resolve(process.cwd(), 'backend', '.env');

if (existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
}