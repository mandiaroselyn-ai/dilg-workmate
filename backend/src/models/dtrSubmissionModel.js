import mongoose from 'mongoose';
import crypto from 'crypto';
import { isConnected } from '../config/db.js';

// An employee's DTR (CSC Form No. 48) for one month, signed through WorkMate: the employee
// certifies it ("I CERTIFY on my honor...") and the Supervisor, as the In-charge, verifies it
// ("VERIFIED as to the prescribed office hours"). `status` is 'Submitted' (signed by the
// employee, waiting for the Supervisor), 'Verified', or 'Returned' (sent back to the employee
// with remarks, to fix and sign again). `contentHash` is the month's attendance as the employee
// signed it (see dtrContentHash), so the Supervisor cannot verify a DTR that changed since.
const SignatureSchema = new mongoose.Schema({
  image: { type: String, default: '' }, // data:image/png or jpeg
  name: { type: String, default: '' },
  position: { type: String, default: '' },
  signedAt: { type: Date, default: null }
}, { _id: false });

const DtrSubmissionSchema = new mongoose.Schema({
  customId: { type: String, required: true, unique: true },
  employeeId: { type: String, required: true },
  employeeEmail: { type: String, default: '' },
  employeeName: { type: String, default: '' },
  month: { type: String, required: true }, // YYYY-MM
  status: { type: String, required: true },
  employeeSignature: { type: SignatureSchema, default: null },
  verification: { type: SignatureSchema, default: null },
  remarks: { type: String, default: '' },
  contentHash: { type: String, default: '' },
  // The DTR the Supervisor signed in Adobe and uploaded, as a short note (see signedDocumentModel).
  signedForm: { type: mongoose.Schema.Types.Mixed, default: null },
  history: {
    type: [{
      action: String, // submitted, verified, returned
      by: String,
      at: { type: Date, default: Date.now },
      remarks: { type: String, default: '' }
    }],
    default: []
  }
}, { timestamps: true });
DtrSubmissionSchema.index({ employeeId: 1, month: 1 }, { unique: true });

const MongoDtrSubmission = mongoose.models.DtrSubmission || mongoose.model('DtrSubmission', DtrSubmissionSchema);

function ensureConnected() {
  if (!isConnected()) throw new Error('MongoDB is not connected.');
}

const toClient = item => {
  const obj = typeof item.toObject === 'function' ? item.toObject() : { ...item };
  delete obj._id;
  delete obj.__v;
  return { ...obj, id: obj.customId };
};

// The month's attendance as the DTR reads it, as one fingerprint: each record's day, logs,
// status, and HR's decisions on offline punches. Any change to these changes the fingerprint.
export const dtrContentHash = (records = [], month) => {
  const rows = records
    .filter(record => String(record?.date || '').startsWith(`${month}-`))
    .map(record => [
      record.date, record.timeIn || '', record.lunchOut || '', record.lunchIn || '', record.timeOut || '',
      record.status || '', Boolean(record.late), record.dutyType || '',
      record.offlineTimeIn?.decision || '', record.offlineTimeOut?.decision || ''
    ].join('|'))
    .sort();
  return crypto.createHash('sha256').update(rows.join('\n'), 'utf8').digest('base64url');
};

export const DtrSubmission = {
  // An employee's submissions, newest month first.
  findForEmployee: async employeeId => {
    ensureConnected();
    return (await MongoDtrSubmission.find({ employeeId }).sort({ month: -1 }).lean()).map(toClient);
  },

  // Everyone's submissions from `since` (YYYY-MM) on, newest month first.
  findAll: async ({ since = '' } = {}) => {
    ensureConnected();
    const filter = since ? { month: { $gte: since } } : {};
    return (await MongoDtrSubmission.find(filter).sort({ month: -1, employeeName: 1 }).lean()).map(toClient);
  },

  findById: async id => {
    ensureConnected();
    const found = await MongoDtrSubmission.findOne({ customId: id }).lean();
    return found ? toClient(found) : null;
  },

  findOne: async (employeeId, month) => {
    ensureConnected();
    const found = await MongoDtrSubmission.findOne({ employeeId, month }).lean();
    return found ? toClient(found) : null;
  },

  // Saves the employee's signed DTR for `month` as Submitted: a new one, or one that was
  // returned. Returns the saved submission, or null when one is already waiting or verified.
  submit: async ({ employee, month, signature, contentHash }) => {
    ensureConnected();
    const entry = { action: 'submitted', by: signature.name, at: signature.signedAt };
    const fields = {
      employeeEmail: employee.email || '',
      employeeName: employee.name || '',
      status: 'Submitted',
      employeeSignature: signature,
      verification: null,
      remarks: '',
      contentHash,
      signedForm: null
    };
    const existing = await MongoDtrSubmission.findOne({ employeeId: employee.employeeId, month });
    if (existing) {
      if (existing.status !== 'Returned') return null;
      const updated = await MongoDtrSubmission.findOneAndUpdate(
        { _id: existing._id, status: 'Returned' },
        { $set: fields, $push: { history: entry } },
        { new: true }
      );
      return updated ? toClient(updated) : null;
    }
    try {
      const created = await MongoDtrSubmission.create({
        customId: `dtr-${crypto.randomUUID()}`,
        employeeId: employee.employeeId,
        month,
        ...fields,
        history: [entry]
      });
      return toClient(created);
    } catch (error) {
      // Submitted twice at once: the other one was saved.
      if (error?.code === 11000) return null;
      throw error;
    }
  },

  // The Supervisor's verification of a Submitted DTR, with the note of the DTR they signed in
  // Adobe (`signedForm`). Null when it is no longer waiting.
  verify: async (id, signature, signedForm = null) => {
    ensureConnected();
    const updated = await MongoDtrSubmission.findOneAndUpdate(
      { customId: id, status: 'Submitted' },
      { $set: { status: 'Verified', verification: signature, remarks: '', signedForm }, $push: { history: { action: 'verified', by: signature.name, at: signature.signedAt } } },
      { new: true }
    );
    return updated ? toClient(updated) : null;
  },

  // Sends a Submitted DTR back to the employee with remarks. Null when it is no longer waiting.
  returnToEmployee: async (id, { by, remarks }) => {
    ensureConnected();
    const updated = await MongoDtrSubmission.findOneAndUpdate(
      { customId: id, status: 'Submitted' },
      { $set: { status: 'Returned', remarks }, $push: { history: { action: 'returned', by, at: new Date(), remarks } } },
      { new: true }
    );
    return updated ? toClient(updated) : null;
  }
};
