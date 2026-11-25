import mongoose from 'mongoose';
import crypto from 'crypto';
import { isConnected } from '../config/db.js';

// A month's DTR report (see shared/dtrReport.js): HR sends its cover list (`rows`, one per employee
// in service that month) with the checked DTRs (`submissionIds`) to the PD, who signs it as
// "Approved by" (and each DTR as the In-charge) or returns it to HR, then forwards it to the
// Regional Office. HR signs nothing. One per month. The signed cover is a SignedDocument
// ('dtr-report-pd') under the month; here is only a short note of it. The month's Consolidated
// Report of Attendance goes with it (`consolidated`: what HR's page made of it, the PD's name, and
// the number of vacant positions HR typed), which the PD certifies and signs too
// ('dtr-consolidated-pd', noted as `signedForms.consolidated`).
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
  rows: {
    type: [new mongoose.Schema({
      employeeId: { type: String, default: '' },
      name: { type: String, default: '' },
      position: { type: String, default: '' },
      office: { type: String, default: '' },
      dtr: { type: String, default: '' }
    }, { _id: false })],
    default: []
  },
  // { director, vacant, counts: { personnel, male, female }, rows: [{ no, name, position, station,
  // vl, sl, tardy, undertime, halfDay, remarks }] }, or null for a report sent without one.
  consolidated: { type: mongoose.Schema.Types.Mixed, default: null },
  sentBy: { type: PersonSchema, default: null },
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
  send: async ({ month, submissionIds, rows, consolidated = null, sentBy }) => {
    ensureConnected();
    const entry = { action: 'sent', by: sentBy.name, at: sentBy.at };
    const fields = { status: 'For PD', submissionIds, rows, consolidated, sentBy, approvedBy: null, signedForms: {}, remarks: '', forwarded: null };
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

  // The PD's signature on the Consolidated Report of Attendance sent with the report. Null when
  // the report is no longer with the PD.
  signConsolidated: async (id, signedForm) => {
    ensureConnected();
    const updated = await MongoDtrReport.findOneAndUpdate(
      { customId: id, status: 'For PD' },
      { $set: { 'signedForms.consolidated': signedForm } },
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
