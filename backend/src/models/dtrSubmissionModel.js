import mongoose from 'mongoose';
import crypto from 'crypto';
import { isConnected } from '../config/db.js';
import { ownerChanges, ownRecordsFilter } from '../utils/recordOwner.js';

// An employee's DTR (CSC Form No. 48) for one month, signed through WorkMate: the employee
// certifies it ("I CERTIFY on my honor..."), HR checks it, and the Supervisor (the PD), as the
// In-charge, verifies it ("VERIFIED as to the prescribed office hours") when signing the month's
// report (see shared/dtrReport.js). `status` is 'Submitted' (signed by the employee, with HR),
// 'Checked' (checked by HR, for the month's report), 'Verified', or 'Returned' (sent back to the
// employee with remarks, to fix and sign again). `contentHash` is the month's attendance as the
// employee signed it (see dtrContentHash), so a DTR that changed since cannot be checked or verified.
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
  // HR's check: who checked it and when.
  checked: {
    type: new mongoose.Schema({ name: { type: String, default: '' }, at: { type: Date, default: null } }, { _id: false }),
    default: null
  },
  verification: { type: SignatureSchema, default: null },
  remarks: { type: String, default: '' },
  contentHash: { type: String, default: '' },
  // The DTR the Supervisor signed in Adobe and uploaded, as a short note (see signedDocumentModel).
  signedForm: { type: mongoose.Schema.Types.Mixed, default: null },
  history: {
    type: [{
      action: String, // submitted, checked, verified, returned
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
  // Moves one account's signed DTRs (see utils/recordOwner.js) to its new Employee ID or name.
  reassignOwner: async (owner, changes) => {
    ensureConnected();
    const filter = ownRecordsFilter(owner);
    const set = ownerChanges(changes);
    if (!filter || !Object.keys(set).length) return 0;
    return (await MongoDtrSubmission.updateMany(filter, { $set: set })).modifiedCount || 0;
  },

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

  // Everyone's submissions for `month` (YYYY-MM).
  findMonth: async month => {
    ensureConnected();
    return (await MongoDtrSubmission.find({ month }).sort({ employeeName: 1 }).lean()).map(toClient);
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
      checked: null,
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

  // HR's check of a Submitted DTR: it waits for the month's report. Null when it is no longer
  // waiting for HR.
  check: async (id, by) => {
    ensureConnected();
    const at = new Date();
    const updated = await MongoDtrSubmission.findOneAndUpdate(
      { customId: id, status: 'Submitted' },
      { $set: { status: 'Checked', checked: { name: by, at }, remarks: '' }, $push: { history: { action: 'checked', by, at } } },
      { new: true }
    );
    return updated ? toClient(updated) : null;
  },

  // The Supervisor's verification of a DTR HR checked, with the note of the DTR they signed
  // (`signedForm`). Null when it is no longer waiting.
  verify: async (id, signature, signedForm = null) => {
    ensureConnected();
    const updated = await MongoDtrSubmission.findOneAndUpdate(
      { customId: id, status: 'Checked' },
      { $set: { status: 'Verified', verification: signature, remarks: '', signedForm }, $push: { history: { action: 'verified', by: signature.name, at: signature.signedAt } } },
      { new: true }
    );
    return updated ? toClient(updated) : null;
  },

  // HR sends a Submitted or Checked DTR back to the employee with remarks. Null when it is no
  // longer with HR.
  returnToEmployee: async (id, { by, remarks }) => {
    ensureConnected();
    const updated = await MongoDtrSubmission.findOneAndUpdate(
      { customId: id, status: { $in: ['Submitted', 'Checked'] } },
      { $set: { status: 'Returned', remarks }, $push: { history: { action: 'returned', by, at: new Date(), remarks } } },
      { new: true }
    );
    return updated ? toClient(updated) : null;
  }
};
