import { getManilaDateString } from '../../../shared/localDate.js';

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
// (Cancelled) one of their own drafts. Returns null when the request is not a draft
// that belongs to the employee.
export const buildEmployeeDraftUpdate = (existing, body, user, today = getManilaDateString()) => {
  if (!isRequestOwner(existing, user) || existing.status !== 'Draft') return null;
  const status = DRAFT_STATUSES.includes(body?.status) ? body.status : 'Draft';
  const update = { status, remarks: DRAFT_REMARKS[status] };
  if (status !== 'Cancelled') {
    for (const field of DRAFT_CONTENT_FIELDS) {
      if (body?.[field] !== undefined) update[field] = body[field];
    }
  }
  if (status === 'Pending') update.submissionDate = today;
  if (status !== 'Draft') {
    update.statusHistory = [
      ...(Array.isArray(existing.statusHistory) ? existing.statusHistory : []),
      { status, date: today, actor: user.name || 'Employee' }
    ];
  }
  return update;
};
