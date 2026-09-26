import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from './src/config/db.js';
import { User } from './src/models/User.js';

const hrAdmin = {
  name: 'Patricia Anne Ortiz',
  email: 'patricia.ortiz@dilg.gov.ph',
  password: process.env.DEFAULT_HR_ADMIN_PASSWORD,
  role: 'HR Administrative Officer V',
  office: 'Provincial Administrative Section',
  region: 'DILG Region IV-B - MIMAROPA',
  phoneNumber: '+63 920 334 5512',
  employeeId: 'DILG-2015-4421',
  accessLevel: 'hr_admin',
  profilePicture: ''
};

async function main() {
  if (!hrAdmin.password || hrAdmin.password.length < 12) {
    throw new Error('Set DEFAULT_HR_ADMIN_PASSWORD to a unique password of at least 12 characters.');
  }
  await connectDB();
  const existingUser = await User.findByEmail(hrAdmin.email);
  const user = existingUser || await User.create({ ...hrAdmin, email: hrAdmin.email.toLowerCase() });
  console.log('HR admin account saved to MongoDB:');
  console.log({ email: user.email, accessLevel: user.accessLevel, role: user.role, name: user.name });
}

main().catch(err => {
  console.error('Failed to seed HR admin account:', err);
  process.exit(1);
}).finally(() => mongoose.disconnect());