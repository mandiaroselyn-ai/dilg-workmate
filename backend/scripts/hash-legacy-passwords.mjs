import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';

try {
  await connectDB();
  const migratedCount = await User.hashLegacyPasswords();
  console.log(`Hashed ${migratedCount} legacy password(s).`);
} catch (error) {
  console.error('Password migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}