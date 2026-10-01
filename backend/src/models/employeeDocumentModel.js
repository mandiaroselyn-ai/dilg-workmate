import mongoose from 'mongoose';
import { isConnected } from '../config/db.js';
import { createRecordId } from '../utils/recordId.js';
import { stampOf } from '../utils/updateStamp.js';
import { DOCUMENT_CATEGORY_IDS, DOCUMENT_STATUSES } from '../../../shared/documentCatalog.js';

// An employee's 201 File, performance, and training documents, and the certificates they
// asked HR for. The file itself (fileData) loads only when someone opens it.
const EmployeeDocumentSchema = new mongoose.Schema({
  customId: { type: String, required: true, unique: true },
  employeeId: { type: String, default: '' },
  employeeEmail: { type: String, default: '' },
  employeeName: { type: String, default: '' },
  category: { type: String, required: true, enum: DOCUMENT_CATEGORY_IDS },
  docType: { type: String, required: true },
  title: { type: String, default: '' },
  documentDate: { type: String, default: '' },
  notes: { type: String, default: '' },
  status: { type: String, enum: DOCUMENT_STATUSES, default: 'Filed' },
  // Certificate requests: what the employee needs it for, and HR's answer.
  purpose: { type: String, default: '' },
  declineReason: { type: String, default: '' },
  answeredAt: { type: Date, default: null },
  answeredBy: { type: String, default: '' },
  uploadedBy: { type: String, default: '' },
  uploadedByRole: { type: String, default: '' },
  fileName: { type: String, default: '' },
  fileType: { type: String, default: '' },
  fileSize: { type: Number, default: 0 },
  fileData: { type: String, default: '', select: false }
}, { timestamps: true });

const MongoEmployeeDocument = mongoose.models.EmployeeDocument
  || mongoose.model('EmployeeDocument', EmployeeDocumentSchema);

function ensureConnected() {
  if (!isConnected()) {
    throw new Error('MongoDB is not connected.');
  }
}

// The document as lists show it: never the file itself.
const serialize = item => {
  const { fileData, ...obj } = typeof item?.toObject === 'function' ? item.toObject() : item;
  return { ...obj, id: obj.customId, hasFile: Boolean(obj.fileName) };
};

// The documents one person sees: all of them for HR, an employee's own, and none for
// supervisors. Returns null when they see none.
export const visibleDocumentFilter = user => {
  if (user?.accessLevel === 'hr_admin') return {};
  if (user?.accessLevel !== 'employee') return null;
  const owners = [
    ...(user.employeeId ? [{ employeeId: user.employeeId }] : []),
    ...(user.email ? [{ employeeEmail: user.email.toLowerCase() }] : [])
  ];
  return owners.length ? { $or: owners } : null;
};

export const EmployeeDocument = {
  // Changes whenever a document this person sees is added, answered, or removed.
  updateStamp: async (user) => {
    ensureConnected();
    const filter = visibleDocumentFilter(user);
    return filter ? stampOf(MongoEmployeeDocument, filter) : '0:0';
  },

  findFor: async (user) => {
    ensureConnected();
    const filter = visibleDocumentFilter(user);
    if (!filter) return [];
    const list = await MongoEmployeeDocument.find(filter).sort({ createdAt: -1 }).lean();
    return list.map(serialize);
  },

  // With `withFile`, the result includes the file (fileData).
  findByCustomId: async (id, { withFile = false } = {}) => {
    ensureConnected();
    if (typeof id !== 'string' || !id) return null;
    const query = MongoEmployeeDocument.findOne({ customId: id });
    if (withFile) query.select('+fileData');
    const item = await query.lean();
    if (!item) return null;
    return withFile ? { ...item, id: item.customId } : serialize(item);
  },

  create: async (data) => {
    ensureConnected();
    const item = await MongoEmployeeDocument.create({ ...data, customId: createRecordId('doc') });
    return serialize(item);
  },

  update: async (id, changes) => {
    ensureConnected();
    const item = await MongoEmployeeDocument.findOneAndUpdate({ customId: id }, { $set: changes }, { new: true, runValidators: true }).lean();
    return item ? serialize(item) : null;
  },

  remove: async (id) => {
    ensureConnected();
    const result = await MongoEmployeeDocument.deleteOne({ customId: id });
    return result.deletedCount === 1;
  }
};
