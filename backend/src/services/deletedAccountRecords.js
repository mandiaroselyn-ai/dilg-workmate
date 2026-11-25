import mongoose from 'mongoose';
import { User } from '../models/User.js';
import '../models/dtrLogModel.js';
import '../models/leaveModel.js';
import '../models/dtrSubmissionModel.js';
import '../models/signedDocumentModel.js';
import '../models/travelDocumentModel.js';

// A one-time clean-up while WorkMate is being tested (the user asked on 2026-11-25): the records
// that accounts deleted during testing left behind (attendance, requests, submitted DTRs, their
// signed forms, and travel reports) are removed from the database. Once WorkMate holds DILG's
// real records they are kept (RA 9470: public records are disposed of only with the National
// Archives' authority), and this is taken out.

// Records whose owner is no current account: an Employee ID no account has (such as a deleted
// account's "deleted:…"), or, for a record with no Employee ID, an email no account has.
export const ownerlessFilter = ({ ids, emails }, { idField = 'employeeId', emailField = 'employeeEmail' } = {}) => ({
  $or: [
    { [idField]: { $nin: ['', null, ...ids] } },
    { [idField]: { $in: ['', null] }, [emailField]: { $nin: emails } }
  ]
});

const model = name => mongoose.model(name);

// The records to remove, as { keys, requests, submissions, filters } (request and submission
// IDs, for their signed forms and travel reports). Refuses when no account can be read, so a
// failed read never removes everyone's records.
const plan = async () => {
  const keys = await User.accountKeys();
  if (!keys.ids.length && !keys.emails.length) throw new Error('No accounts were found, so nothing is removed.');
  const requests = (await model('Request').find(ownerlessFilter(keys)).select('customId').lean()).map(item => item.customId).filter(Boolean);
  const submissions = (await model('DtrSubmission').find(ownerlessFilter(keys)).select('customId').lean()).map(item => item.customId).filter(Boolean);
  const refs = [...requests, ...submissions];
  return {
    attendance: ownerlessFilter(keys),
    requests: { customId: { $in: requests } },
    submissions: { customId: { $in: submissions } },
    signedForms: { ref: { $in: refs } },
    travelReports: { $or: [{ ref: { $in: requests } }, ownerlessFilter(keys, { idField: 'uploadedBy.employeeId', emailField: 'uploadedBy.email' })] }
  };
};

const COLLECTIONS = [
  ['attendance', 'DtrLog'],
  ['requests', 'Request'],
  ['submissions', 'DtrSubmission'],
  ['signedForms', 'SignedDocument'],
  ['travelReports', 'TravelDocument']
];

// How many records of deleted accounts there are, by kind.
export const countDeletedAccountRecords = async () => {
  const filters = await plan();
  const counts = await Promise.all(COLLECTIONS.map(([kind, name]) => model(name).countDocuments(filters[kind])));
  return Object.fromEntries(COLLECTIONS.map(([kind], index) => [kind, counts[index]]));
};

// Removes them; returns how many of each kind were removed. The signed forms and travel reports
// go first, while the requests and DTR submissions they belong to are still known.
export const removeDeletedAccountRecords = async () => {
  const filters = await plan();
  const removed = {};
  for (const [kind, name] of [...COLLECTIONS].reverse()) {
    removed[kind] = (await model(name).deleteMany(filters[kind])).deletedCount || 0;
  }
  return removed;
};
