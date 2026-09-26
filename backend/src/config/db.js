import dns from 'dns';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dns.setServers(['1.1.1.1', '8.8.8.8']);
dns.promises.setServers(['1.1.1.1', '8.8.8.8']);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../.env');

dotenv.config({ path: envPath });

let isMongoConnected = false;

export async function connectDB() {
  const mongoURI = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!mongoURI) {
    throw new Error('MONGO_URI or MONGODB_URI environment variable is required.');
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    heartbeatFrequencyMS: 10000,
    family: 4
  });
  isMongoConnected = true;
  console.log('🚀 Connected to MongoDB database of DILG WorkMate successfully!');
  return true;
}

export function isConnected() {
  return isMongoConnected;
}
