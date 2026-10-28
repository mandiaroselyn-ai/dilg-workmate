import crypto from 'crypto';
import mongoose from 'mongoose';
import { isConnected } from '../config/db.js';

// A file the app made (such as a DTR) waiting for the WorkMate Android app to download it. The
// app downloads through the phone's download manager, which only fetches an https link and
// sends no sign-in, so the file is kept here for a few minutes under a random link. Only the
// link's hash is saved, and the database removes the file once it expires.
const DownloadSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  fileName: { type: String, required: true },
  mimeType: { type: String, required: true },
  data: { type: Buffer, required: true },
  owner: { type: String, default: '' },
  expiresAt: { type: Date, required: true, expires: 0 }
});

const MongoDownload = mongoose.models.Download || mongoose.model('Download', DownloadSchema);

// How long a download link works: enough for the phone to fetch it (the app's page and the
// download manager each fetch it once).
export const DOWNLOAD_LINK_MINUTES = 5;

function ensureConnected() {
  if (!isConnected()) throw new Error('MongoDB is not connected.');
}

const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

export const Download = {
  // Keeps a file for a few minutes and returns the token of its link.
  create: async ({ fileName, mimeType, data, owner }, now = new Date()) => {
    ensureConnected();
    const token = crypto.randomBytes(32).toString('base64url');
    await MongoDownload.create({
      tokenHash: hashToken(token),
      fileName,
      mimeType,
      data,
      owner,
      expiresAt: new Date(now.getTime() + DOWNLOAD_LINK_MINUTES * 60 * 1000)
    });
    return token;
  },

  // The file of a link that has not expired, or null.
  find: async (token, now = new Date()) => {
    ensureConnected();
    if (typeof token !== 'string' || !token) return null;
    return MongoDownload.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: now } });
  }
};
