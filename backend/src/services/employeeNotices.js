import { Announcement } from '../models/announcementModel.js';
import { User } from '../models/User.js';
import { isSmsConfigured, sendSms, toPhilippineMobile } from './smsService.js';

const manilaNow = () => new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' });

// Tells a person about something done to their account or records: a bell notification
// and, when `sms` is given, a text to the mobile number on their profile. `view` is the
// page the notification opens. A notice that cannot be sent never fails the action.
export const noticeEmployee = async (person, { title, message, type = 'system', view = '', sms = '', smsKind = 'account', phoneNumber = '' }) => {
  if (!person?.employeeId && !person?.email && !person?.employeeEmail) return;
  try {
    await Announcement.createNotification({
      title,
      message,
      type,
      view,
      employeeId: person.employeeId || '',
      employeeEmail: person.email || person.employeeEmail || ''
    });
  } catch (error) {
    console.error(`Unable to notify ${person.employeeId || person.email} (${title}):`, error.message);
  }
  const mobile = toPhilippineMobile(phoneNumber || person.phoneNumber);
  if (!sms || !mobile || !isSmsConfigured()) return;
  try {
    await sendSms({
      recipient: mobile,
      message: sms,
      employeeId: person.employeeId || '',
      employeeEmail: person.email || person.employeeEmail || '',
      timestamp: manilaNow(),
      kind: smsKind
    });
  } catch (error) {
    console.error(`Unable to text ${person.employeeId || person.email} (${title}):`, error.message);
  }
};

// "Oct 5, 2026" or "Oct 5 to Oct 7, 2026" from YYYY-MM-DD dates.
export const requestDates = ({ startDate, endDate } = {}) => {
  const parse = value => (/^\d{4}-\d{2}-\d{2}/.test(value || '') ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : null);
  const start = parse(startDate);
  const end = parse(endDate);
  if (!start) return '';
  const day = date => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const year = (end || start).getUTCFullYear();
  return end && end.getTime() !== start.getTime() ? `${day(start)} to ${day(end)}, ${year}` : `${day(start)}, ${year}`;
};

// Status changes an employee hears about, with how each is worded.
const DECISIONS = {
  'For Supervisor': { title: 'Sent to Supervisor', wording: () => 'was checked by HR and sent to your supervisor for approval' },
  Approved: { title: 'Approved', wording: reviewer => `was approved by ${reviewer}` },
  Rejected: { title: 'Disapproved', wording: reviewer => `was disapproved by ${reviewer}` }
};

// The employee's notice when HR or the supervisor moves their request to `request.status`,
// or null when that status is not one they hear about.
export const requestDecisionNotice = (request, { reviewer = 'the reviewer', remarks = '' } = {}) => {
  const decision = DECISIONS[request?.status];
  if (!decision) return null;
  const details = [
    request.type === 'Leave Request' && request.leaveType && request.leaveType !== 'N/A' ? request.leaveType : '',
    request.type === 'Travel Order' ? request.travelVenue : '',
    requestDates(request)
  ].filter(Boolean).join(', ');
  const subject = `Your ${request.type || 'request'} ${request.id}${details ? ` (${details})` : ''}`;
  const note = typeof remarks === 'string' && remarks.trim() ? ` Remarks: ${remarks.trim().slice(0, 160)}` : '';
  const sentence = `${subject} ${decision.wording(reviewer)}.${note}`;
  return {
    title: `${request.type || 'Request'} ${decision.title}`,
    message: sentence,
    sms: `DILG WorkMate: ${sentence}`
  };
};

// Tells the employee that HR or the supervisor moved their request on, by notification
// and SMS, from the server so it does not depend on the reviewer's browser. The text goes
// to the number on the employee's profile now, or the one on the request if the account
// is gone.
export const noticeRequestDecision = async (previous, request, { reviewer, remarks } = {}) => {
  if (!request || previous?.status === request.status) return;
  const notice = requestDecisionNotice(request, { reviewer, remarks });
  if (!notice) return;
  const account = (request.employeeId && await User.findByEmployeeId(request.employeeId))
    || (request.employeeEmail && await User.findByEmail(request.employeeEmail))
    || null;
  await noticeEmployee(account || { employeeId: request.employeeId, employeeEmail: request.employeeEmail }, {
    ...notice,
    type: 'request',
    view: 'requests',
    smsKind: 'request',
    phoneNumber: account?.phoneNumber || request.employeePhoneNumber
  });
};

const shortDate = value => requestDates({ startDate: value }).replace(/, \d{4}$/, '') || value;
const listDates = dates => {
  const unique = [...new Set(dates)].sort();
  const shown = unique.slice(0, 5).map(shortDate);
  return unique.length > 5 ? `${shown.join(', ')}, and ${unique.length - 5} more` : shown.join(', ');
};

// One notice per employee for HR's attendance updates (`updates` as sent, `records` as
// saved): corrections, offline Time In and Time Out decisions, and verifications.
export const attendanceReviewNotices = (updates = [], records = []) => {
  const byId = new Map(records.map(record => [record.id || record.customId, record]));
  const people = new Map();
  for (const update of updates) {
    const record = byId.get(update?.id);
    const key = record && (record.employeeId || record.employeeEmail);
    if (!key) continue;
    if (!people.has(key)) {
      people.set(key, { employeeId: record.employeeId || '', employeeEmail: record.employeeEmail || '', corrected: [], approved: [], rejected: [], timeOutApproved: [], verified: [] });
    }
    const person = people.get(key);
    const date = record.date || '';
    if (['timeIn', 'timeOut', 'status', 'location'].some(field => update[field] !== undefined)) person.corrected.push(date);
    else if (update.verificationAudit !== undefined) person.verified.push(date);
    if (update.offlineDecision === 'approved') person.approved.push(date);
    if (update.offlineDecision === 'rejected') person.rejected.push(date);
    if (update.offlineTimeOutDecision === 'approved') person.timeOutApproved.push(date);
  }
  return [...people.values()].map(person => {
    const lines = [
      person.corrected.length && `HR corrected your attendance for ${listDates(person.corrected)}.`,
      person.approved.length && `Your offline Time In for ${listDates(person.approved)} was approved and now counts in your DTR.`,
      person.rejected.length && `Your offline Time In for ${listDates(person.rejected)} was not accepted. Please contact HR.`,
      person.timeOutApproved.length && `Your offline Time Out for ${listDates(person.timeOutApproved)} was approved.`,
      person.verified.length && `HR verified your attendance for ${listDates(person.verified)}.`
    ].filter(Boolean);
    if (!lines.length) return null;
    return {
      person: { employeeId: person.employeeId, employeeEmail: person.employeeEmail },
      title: person.rejected.length ? 'Offline Time In Not Accepted' : person.corrected.length ? 'Attendance Corrected by HR' : 'Attendance Reviewed by HR',
      message: lines.join(' ')
    };
  }).filter(Boolean);
};

// The HR-kept details whose change the employee is told about, with how they are named.
const HR_FIELD_LABELS = {
  name: 'Full name',
  email: 'Email',
  employeeId: 'Employee ID',
  role: 'Position',
  office: 'Office',
  region: 'Region',
  employmentStatus: 'Employment status',
  dateHired: 'Date hired',
  assignedStation: 'Assigned station',
  assignedLGU: 'Assigned LGU',
  division: 'Division / Unit',
  plantillaItemNumber: 'Plantilla item no.',
  salaryGrade: 'Salary grade',
  salary: 'Monthly salary',
  immediateSupervisor: 'Immediate supervisor'
};
const wfhText = location => ['municipality', 'barangay', 'street', 'landmark'].map(field => location?.[field] || '').join('|');

// The names of what HR changed in an employee's record, from before and after a save.
export const changedRecordFields = (before = {}, after = {}) => [
  ...Object.entries(HR_FIELD_LABELS)
    .filter(([field]) => (before?.[field] || '').toString().trim() !== (after?.[field] || '').toString().trim())
    .map(([, label]) => label),
  ...(wfhText(before?.approvedWfhLocation) !== wfhText(after?.approvedWfhLocation) ? ['Approved WFH location'] : [])
];
