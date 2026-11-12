import mongoose from 'mongoose';
import { isConnected } from '../config/db.js';

// A Post Activity Report or Certificate of Appearance an employee attached to an approved Travel
// Order (shared/travelDocuments.js).
// The file is kept apart from the request, which carries only a short note of it.
const TravelDocumentSchema = new mongoose.Schema({
  documentId: { type: String, required: true, unique: true },
  ref: { type: String, required: true, index: true },
  kind: { type: String, required: true },
  fileName: { type: String, default: '' },
  mimeType: { type: String, default: '' },
  size: { type: Number, default: 0 },
  data: { type: Buffer, required: true },
  uploadedBy: {
    employeeId: { type: String, default: '' },
    name: { type: String, default: '' },
    email: { type: String, default: '' }
  },
  uploadedAt: { type: Date, default: Date.now }
}, { timestamps: true });

const MongoTravelDocument = mongoose.models.TravelDocument || mongoose.model('TravelDocument', TravelDocumentSchema);

function ensureConnected() {
  if (!isConnected()) throw new Error('MongoDB is not connected.');
}

// What the Travel Order keeps about an uploaded file.
export const travelDocumentNote = doc => ({
  id: doc.documentId,
  kind: doc.kind,
  fileName: doc.fileName,
  mimeType: doc.mimeType,
  size: doc.size,
  uploadedBy: doc.uploadedBy?.name || '',
  uploadedByEmployeeId: doc.uploadedBy?.employeeId || '',
  uploadedAt: doc.uploadedAt
});

export const TravelDocument = {
  find: async (ref, documentId) => {
    ensureConnected();
    const found = await MongoTravelDocument.findOne({ ref, documentId });
    if (!found) return null;
    const { data, ...rest } = found.toObject();
    return { ...rest, data: Buffer.from(found.data) };
  },

  save: async ({ documentId, ref, kind, fileName, mimeType, bytes, uploadedBy }) => {
    ensureConnected();
    const saved = await MongoTravelDocument.create({ documentId, ref, kind, fileName, mimeType, size: bytes.length, data: Buffer.from(bytes), uploadedBy });
    return saved.toObject();
  },

  remove: async (ref, documentId) => {
    ensureConnected();
    await MongoTravelDocument.deleteOne({ ref, documentId });
  }
};
