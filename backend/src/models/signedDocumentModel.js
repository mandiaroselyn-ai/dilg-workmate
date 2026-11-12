import mongoose from 'mongoose';
import { isConnected } from '../config/db.js';

// The PDF a form became once it was signed in Adobe and uploaded (see shared/signedForms.js).
// One per kind and reference (a request's ID, or a DTR submission's ID); signing again by the
// same step replaces it. The bytes are kept apart from the request or DTR, which carry only a
// short note of who uploaded it and when.
const SignedDocumentSchema = new mongoose.Schema({
  kind: { type: String, required: true },
  ref: { type: String, required: true },
  fileName: { type: String, default: '' },
  size: { type: Number, default: 0 },
  sha256: { type: String, default: '' },
  signatures: { type: Number, default: 0 },
  data: { type: Buffer, required: true },
  uploadedBy: {
    name: { type: String, default: '' },
    position: { type: String, default: '' },
    email: { type: String, default: '' }
  },
  uploadedAt: { type: Date, default: Date.now }
}, { timestamps: true });
SignedDocumentSchema.index({ kind: 1, ref: 1 }, { unique: true });

const MongoSignedDocument = mongoose.models.SignedDocument || mongoose.model('SignedDocument', SignedDocumentSchema);

function ensureConnected() {
  if (!isConnected()) throw new Error('MongoDB is not connected.');
}

// What a request or DTR keeps about an uploaded file.
export const signedNote = doc => ({
  fileName: doc.fileName,
  size: doc.size,
  signatures: doc.signatures,
  uploadedBy: doc.uploadedBy?.name || '',
  uploadedAt: doc.uploadedAt
});

export const SignedDocument = {
  find: async (kind, ref) => {
    ensureConnected();
    const found = await MongoSignedDocument.findOne({ kind, ref });
    return found ? { kind: found.kind, ref: found.ref, fileName: found.fileName, size: found.size, sha256: found.sha256, signatures: found.signatures, uploadedBy: found.uploadedBy, uploadedAt: found.uploadedAt, data: Buffer.from(found.data) } : null;
  },

  save: async ({ kind, ref, fileName, bytes, signatures, sha256, uploadedBy }) => {
    ensureConnected();
    await MongoSignedDocument.updateOne(
      { kind, ref },
      { $set: { fileName, size: bytes.length, sha256, signatures, data: Buffer.from(bytes), uploadedBy, uploadedAt: new Date() } },
      { upsert: true }
    );
  }
};
