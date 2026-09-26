import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('Missing MONGO_URI');
  process.exit(1);
}

const UserSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const User = mongoose.models.User || mongoose.model('User', UserSchema);

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const users = await User.find({}, { email: 1, accessLevel: 1 }).limit(100).lean();
  console.log(JSON.stringify(users, null, 2));
  await mongoose.disconnect();
} catch (err) {
  console.error(err);
  process.exit(1);
}
