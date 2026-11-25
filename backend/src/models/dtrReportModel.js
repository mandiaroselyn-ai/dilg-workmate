import mongoose from 'mongoose';
import crypto from 'crypto';
import { isConnected } from '../config/db.js';

// A month's DTR report (see shared/dtrReport.js): HR signs its cover list as "Prepared by" and
// sends it with the checked DTRs (`submissionIds`) to the PD, who signs it as "Approved by" (and
// each DTR as the In-charge) or returns it to HR, then forwards it to the Regional Office. One per
// month. The signed covers are SignedDocuments ('dtr-report-hr', 'dtr-report-pd') under the month;
// here are only short notes of them.
const PersonSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  position: { type: String, default: '' },
  at: { type: Date, default: null }
}, { _id: false });

const DtrReportSchema = new mongoose.Schema({
  customId: { type: String, required: true, unique: true },
  month: { type: String, required: true, unique: true }, // YYYY-MM
  status: { type: String, required: true },
  submissionIds: { type: [String], default: [] },
  preparedBy: { type: PersonSchema, default: null },
  approvedBy: { type: PersonSchema, default: null },
  signedForms: { type: mongoose.Schema.Types.Mixed, default: {} },
  remarks: { type: String, default: '' },
  forwarded: {
    type: new mongoose.Schema({
      at: { type: Date, default: null },
      by: { type: String, default: '' },
      reference: { type: String, default: '' }
    }, { _id: false }),
    default: null
  },
  history: {
    type: [{
      action: String, // sent, returned, approved, forwarded
      by: String,
      at: { type: Date, default: Date.now },
      remarks: { type: String, default: '' }
    }],
    default: []
  }
}, { timestamps: true });

const MongoDtrReport = mongoose.models.DtrReport || mongoose.model('DtrReport', DtrReportSchema);

function ensureConnected() {
  if (!isConnected()) throw new Error('MongoDB is not connected.');
}

const toClient = item => {
  const obj = typeof item.toObject === 'function' ? item.toObject() : { ...item };
  delete obj._id;
  delete obj.__v;
  return { ...obj, id: obj.customId };
};

export const DtrReport = {
  // The reports from `since` (YYYY-MM) on, newest month first.
  findAll: async ({ since = '' } = {}) => {
    ensureConnected();
    const filter = since ? { month: { $gte: since } } : {};
    return (await MongoDtrReport.find(filter).sort({ month: -1 }).lean()).map(toClient);
  },

  findByMonth: async month => {
    ensureConnected();
    const found = await MongoDtrReport.findOne({ month }).lean();
    return found ? toClient(found) : null;
  },

  findById: async id => {
    ensureConnected();
    const found = await MongoDtrReport.findOne({ customId: id }).lean();
    return found ? toClient(found) : null;
  },

  // HR sends the month's report to the PD: a new one, or one the PD returned. Returns it, or
  // null when one is already with the PD or past it.
  send: async ({ month, submissionIds, preparedBy, signedForm }) => {
    ensureConnected();
    const entry = { action: 'sent', by: preparedBy.name, at: preparedBy.at };
    const fields = { status: 'For PD', submissionIds, preparedBy, approvedBy: null, signedForms: { hr: signedForm }, remarks: '', forwarded: null };
    const existing = await MongoDtrReport.findOne({ month });
    if (existing) {
      if (existing.status !== 'Returned to HR') return null;
      const updated = await MongoDtrReport.findOneAndUpdate(
        { _id: existing._id, status: 'Returned to HR' },
        { $set: fields, $push: { history: entry } },
        { new: true }
      );
      return updated ? toClient(updated) : null;
    }
    try {
      return toClient(await MongoDtrReport.create({ customId: `dtrrep-${crypto.randomUUID()}`, month, ...fields, history: [entry] }));
    } catch (error) {
      if (error?.code === 11000) return null;
      throw error;
    }
  },

  // The PD returns the report to HR with remarks. Null when it is no longer with the PD.
  returnToHr: async (id, { by, remarks }) => {
    ensureConnected();
    const updated = await MongoDtrReport.findOneAndUpdate(
      { customId: id, status: 'For PD' },
      { $set: { status: 'Returned to HR', remarks }, $push: { history: { action: 'returned', by, at: new Date(), remarks } } },
      { new: true }
    );
    return updated ? toClient(updated) : null;
  },

  // The PD's signature on the report. Null when it is no longer with the PD.
  approve: async (id, { approvedBy, signedForm }) => {
    ensureConnected();
    const updated = await MongoDtrReport.findOneAndUpdate(
      { customId: id, status: 'For PD' },
      { $set: { status: 'Signed by PD', approvedBy, 'signedForms.pd': signedForm, remarks: '' }, $push: { history: { action: 'approved', by: approvedBy.name, at: approvedBy.at } } },
      { new: true }
    );
    return updated ? toClient(updated) : null;
  },

  // The PD marks the signed report as sent to the Regional Office. Null when it is not signed yet
  // or already forwarded.
  forward: async (id, { by, reference }) => {
    ensureConnected();
    const at = new Date();
    const updated = await MongoDtrReport.findOneAndUpdate(
      { customId: id, status: 'Signed by PD' },
      { $set: { status: 'Forwarded to Regional Office', forwarded: { at, by, reference } }, $push: { history: { action: 'forwarded', by, at, remarks: reference } } },
      { new: true }
    );
    return updated ? toClient(updated) : null;
  }
};
