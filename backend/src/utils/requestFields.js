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
export const buildEmployeeRequest = (body, user, today = new Date().toISOString().split('T')[0]) => {
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
