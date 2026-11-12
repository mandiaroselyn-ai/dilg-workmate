// When a leave or travel order may be filed. A travel order authorizes the travel, so it is
// filed before the travel starts. A leave follows the CSC Omnibus Rules on Leave (CSC MC No. 41,
// s. 1998, as amended by CSC MC No. 05, s. 2021):
// - filed before the leave starts: vacation leave (five days in advance, whenever possible,
//   Sec. 51), mandatory/forced leave (scheduled, Sec. 25), study leave (on a contract signed
//   first, Sec. 68), and adoption leave (with the Pre-Adoptive Placement Authority, Sec. 20);
// - may be filed after the leave starts: sick leave (upon return, Sec. 53), special privilege
//   and solo parent leave (in advance, except in emergencies), maternity and paternity leave
//   (in advance whenever possible; not for miscarriage or abnormal deliveries), VAWC leave
//   (in advance or upon return), rehabilitation (within one week of the accident), special
//   leave benefits for women (upon return after an emergency surgery), and special emergency
//   (calamity) leave (within 30 days of the calamity).
// A request filed in time stays filed in time when it is returned to be fixed, so its filing
// date is the day it was first submitted.
export const FILED_BEFORE_LEAVES = ['Vacation Leave', 'Mandatory / Forced Leave', 'Study Leave', 'Adoption Leave'];

const dayOf = value => (typeof value === 'string' ? value.slice(0, 10) : '');
const dateText = day => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// True when `request` (a leave of `leaveType`, or a travel order) must start on or after the
// day it is filed.
export const filedBeforeStart = request => request?.type === 'Travel Order'
  || (request?.type === 'Leave Request' && FILED_BEFORE_LEAVES.includes(request.leaveType));

// Whether a step of `request`'s history is the employee submitting it: Pending, or, for a travel
// order, For Supervisor, since it goes straight to the Provincial Director when submitted.
const isSubmission = (request, entry) => entry?.status === 'Pending'
  || (request?.type === 'Travel Order' && entry?.status === 'For Supervisor');

// The day `existing` was first submitted, or `today` for a request being submitted now.
export const filingDate = (existing, today) => {
  if (existing?.status !== 'Returned') return today;
  const history = Array.isArray(existing.statusHistory) ? existing.statusHistory : [];
  const submitted = history.filter(entry => isSubmission(existing, entry)).map(entry => dayOf(entry.date)).filter(Boolean).sort();
  return submitted[0] || dayOf(existing.submissionDate) || today;
};

// Why `request` cannot be filed on `filedOn` because its dates have already started, or null.
export const lateFilingProblem = (request, filedOn) => {
  const start = dayOf(request?.startDate);
  if (!start || !filedOn || start >= filedOn || !filedBeforeStart(request)) return null;
  if (request.type === 'Travel Order') {
    return `A travel order is filed before the travel. ${dateText(start)} has already passed, so choose a date from today on.`;
  }
  const hint = request.leaveType === 'Vacation Leave' ? ' If you were sick, file Sick Leave instead.' : '';
  return `${request.leaveType} is filed before the leave starts. ${dateText(start)} has already passed, so choose a date from today on.${hint}`;
};

// A travel order is made because of an invitation to an activity or an office memo, so it is
// submitted with that memo or invitation attached (DILG Marinduque, 2026-11-12). A draft may wait.
export const TRAVEL_ORDER_MEMO_REQUIRED = 'Attach the official memo or invitation for this Travel Order.';
const hasAttachedFile = request => Array.isArray(request?.attachments)
  && request.attachments.some(file => typeof file?.dataUrl === 'string' && file.dataUrl.startsWith('data:'));
// Why the travel order `request` cannot be submitted without its memo or invitation, or null.
export const travelOrderMemoProblem = request => (request?.type === 'Travel Order' && !hasAttachedFile(request) ? TRAVEL_ORDER_MEMO_REQUIRED : null);
