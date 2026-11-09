import { getManilaDateString } from '../../../shared/localDate.js';
import { FOR_PRE_APPROVAL, HR_STEP_NAMES, HR_TASKS, doesHrStep, hrStepOf } from '../../../shared/hrSteps.js';

// Fields only a reviewer (supervisor or HR) may set on a leave, travel, or certified copy request.
const REVIEW_FIELDS = [
  'status',
  'approver',
  'remarks',
  'stage',
  'statusHistory',
  'signatureData',
  'supervisorSignature',
  'supervisorRemarks',
  'supervisorApprovedAt',
  'supervisorName',
  'directorSignature',
  'directorRemarks',
  'directorApprovedAt',
  'directorName'
];

const EMPLOYEE_STATUSES = ['Draft', 'Pending'];

// Builds a new request from an employee's submission. The owner comes from the session,
// and the request always starts as Draft or Pending with no reviewer decisions attached.
export const buildEmployeeRequest = (body, user, today = getManilaDateString()) => {
  const request = { ...(body || {}) };
  for (const field of [...REVIEW_FIELDS, 'id', 'customId']) delete request[field];

  const status = EMPLOYEE_STATUSES.includes(body?.status) ? body.status : 'Pending';
  return {
    ...request,
    status,
    remarks: status === 'Draft'
      ? 'Draft request saved. Not yet submitted for reviews.'
      : 'Awaiting initial HR administrative processing and review.',
    employeeId: user.employeeId,
    employeeEmail: user.email,
    employeeName: user.name,
    employeePhoneNumber: user.phoneNumber,
    statusHistory: [{ status, date: today, actor: user.name || 'Employee' }]
  };
};

// Keeps only the review fields from a supervisor or HR status update, so a review cannot
// change who owns the request or what was requested.
export const pickReviewUpdate = body => REVIEW_FIELDS.reduce((update, field) => {
  if (body?.[field] !== undefined) update[field] = body[field];
  return update;
}, {});

const AWAITING_HR_STATUSES = ['Pending', 'Pending Review', FOR_PRE_APPROVAL];
// What the supervisor may still decide: a request HR forwarded, or one still with HR.
export const AWAITING_SUPERVISOR_STATUSES = [...AWAITING_HR_STATUSES, 'For Supervisor'];
const SUPERVISOR_DECISIONS = ['Approved', 'Rejected', 'Returned'];

// Why a reviewer may not apply `update` to a request whose status is `currentStatus`, or
// null when they may. A draft the employee has not submitted and a request the employee
// withdrew are theirs alone. HR/Admin takes a request waiting for HR through its HR steps
// (shared/hrSteps.js): HR 1 certifies a leave's credits and sends it for pre-approval, and
// HR 2 pre-approves a leave or a Travel Order and sends it to the supervisor (the Head). Each
// HR step may instead return the request to the employee, and only an HR account that does
// that step (`hrTask`) may take it. The supervisor approves, rejects, or returns it. A request
// is returned with remarks saying what the employee needs to do. `type` is the request's.
export const reviewUpdateProblem = (currentStatus, update, role, { type, hrTask } = {}) => {
  if (currentStatus === 'Draft') return 'This request is still a draft. The employee has not submitted it.';
  if (currentStatus === 'Withdrawn') return 'The employee withdrew this request.';
  const nextStatus = update?.status;
  if (nextStatus === undefined) return null;
  if (nextStatus === 'Returned' && !String(update.supervisorRemarks || update.remarks || '').trim()) {
    return 'Write in the remarks what the employee needs to fix before returning the request.';
  }
  if (role === 'hr_admin') {
    const step = hrStepOf({ status: currentStatus, type });
    const forwardTo = step === 'leave-credits' ? FOR_PRE_APPROVAL : 'For Supervisor';
    if (![FOR_PRE_APPROVAL, 'For Supervisor', 'Returned'].includes(nextStatus)) {
      return 'HR/Admin can only forward requests (a leave to HR 2 for pre-approval, then to the supervisor) or return them to the employee. The supervisor approves or rejects them.';
    }
    if (currentStatus === 'For Supervisor') return 'This request was already forwarded to the supervisor.';
    if (!step) {
      return `This request is already ${currentStatus || 'decided'}, so it cannot be ${nextStatus === 'Returned' ? 'returned' : 'forwarded'}.`;
    }
    if (nextStatus !== 'Returned' && nextStatus !== forwardTo) {
      return step === 'leave-credits'
        ? 'HR 1 certifies the leave credits first. Send the leave to HR 2 for pre-approval before the supervisor.'
        : 'This request needs only HR 2\'s pre-approval now. HR 2 sends it to the supervisor.';
    }
    if (!doesHrStep(hrTask, step)) {
      return HR_TASKS.includes(hrTask)
        ? `This step is ${HR_STEP_NAMES[step]}'s. Your HR account does ${HR_STEP_NAMES[hrTask]} only.`
        : `This step is ${HR_STEP_NAMES[step]}'s. Your HR account has no HR step yet: ask HR to set it to HR 1 or HR 2 in Staff Accounts.`;
    }
    return null;
  }
  if (role === 'supervisor' && !SUPERVISOR_DECISIONS.includes(nextStatus)) {
    return 'The supervisor can only approve, reject, or return requests.';
  }
  // A decision is made once: an approved leave has already used leave credits, and a
  // returned request is the employee's to fix and submit again.
  if (role === 'supervisor' && !AWAITING_SUPERVISOR_STATUSES.includes(currentStatus)) {
    const verb = { Approved: 'approved', Rejected: 'disapproved', Returned: 'returned' }[nextStatus];
    return `This request is already ${currentStatus || 'decided'}, so it cannot be ${verb}.`;
  }
  // Only an undecided request goes back to the employee (an approved one may already have
  // used leave credits).
  if (nextStatus === 'Returned' && ['Approved', 'Rejected', 'Returned'].includes(currentStatus)) {
    return `This request is already ${currentStatus}, so it cannot be returned.`;
  }
  return null;
};

// Fields an employee may change while a request is still their own draft.
const DRAFT_CONTENT_FIELDS = [
  'type',
  'startDate',
  'endDate',
  'purpose',
  'leaveType',
  'detailsType',
  'detailsSpecify',
  'travelActivity',
  'travelTime',
  'travelVenue',
  'companions',
  'commutation',
  'workingDays',
  'attachments'
];
const DRAFT_STATUSES = ['Draft', 'Pending', 'Cancelled'];
const DRAFT_REMARKS = {
  Draft: 'Draft request saved. Not yet submitted for reviews.',
  Pending: 'Awaiting initial HR administrative processing and review.',
  Cancelled: 'Draft discarded by the employee.'
};

export const isRequestOwner = (request, user) => Boolean(
  (user?.employeeId && request?.employeeId === user.employeeId)
  || (user?.email && request?.employeeEmail === user.email.toLowerCase())
);

// Builds the update for an employee editing, submitting (Pending), or discarding
// (Cancelled) one of their own drafts, or fixing and submitting again (or saving as a
// draft) a request HR or the supervisor returned to them. Returns null when the request is
// not such a request of the employee's.
export const buildEmployeeDraftUpdate = (existing, body, user, today = getManilaDateString()) => {
  if (!isRequestOwner(existing, user) || !['Draft', 'Returned'].includes(existing.status)) return null;
  // A returned request is withdrawn rather than discarded.
  const allowed = existing.status === 'Returned' ? ['Draft', 'Pending'] : DRAFT_STATUSES;
  const status = allowed.includes(body?.status) ? body.status : 'Draft';
  const update = { status, remarks: DRAFT_REMARKS[status] };
  if (status !== 'Cancelled') {
    for (const field of DRAFT_CONTENT_FIELDS) {
      if (body?.[field] !== undefined) update[field] = body[field];
    }
  }
  if (status === 'Pending') {
    update.submissionDate = today;
    // Submitted again, the request goes through HR's steps again, with its dates as they are now.
    update.creditCertification = null;
    update.recommendation = null;
  }
  if (status !== existing.status) {
    update.statusHistory = [
      ...(Array.isArray(existing.statusHistory) ? existing.statusHistory : []),
      { status, date: today, actor: user.name || 'Employee' }
    ];
  }
  return update;
};

// Statuses in which a submitted request has not been decided yet, so the employee may
// still withdraw it. Approved requests need HR, since leave credits may be affected.
export const WITHDRAWABLE_STATUSES = ['Pending', 'Pending Review', FOR_PRE_APPROVAL, 'For Supervisor', 'Returned'];

// Builds the update for an employee withdrawing their own undecided request. Returns
// null when the request is not theirs or can no longer be withdrawn.
export const buildEmployeeWithdrawal = (existing, body, user, today = getManilaDateString()) => {
  if (body?.status !== 'Withdrawn' || !isRequestOwner(existing, user) || !WITHDRAWABLE_STATUSES.includes(existing.status)) {
    return null;
  }
  const reason = typeof body.withdrawalReason === 'string' ? body.withdrawalReason.trim().slice(0, 500) : '';
  return {
    status: 'Withdrawn',
    remarks: reason ? `Withdrawn by the employee: ${reason}` : 'Withdrawn by the employee.',
    statusHistory: [
      ...(Array.isArray(existing.statusHistory) ? existing.statusHistory : []),
      { status: 'Withdrawn', date: today, actor: user.name || 'Employee' }
    ]
  };
};
