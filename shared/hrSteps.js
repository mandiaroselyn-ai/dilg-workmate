import { leaveCharge, leaveCreditField } from './leaveCalc.js';

// The HR step a leave takes before the Head decides it, as DILG Marinduque's CSC Form No. 6 has
// it: HR 2 certifies the employee's leave credits (7.A) and recommends approval or disapproval
// (7.B), both signed by HR 2 on the form, and sends it to the Head, who decides (7.C and 7.D). A
// Travel Order takes no HR step: it goes straight to the Head (the Provincial Director), who alone
// signs it (the office, 2026-11-12). HR 1 takes no step on requests: HR 1 reviews and updates the
// employees' leave credits on their own (Employee Management and DTR Records). Each HR/Admin
// account is one of the two (`hrTask`).

export const HR_TASKS = ['leave-credits', 'pre-approval'];
// As Staff Accounts and the Requests page show an account's step.
export const HR_TASK_LABELS = {
  'leave-credits': 'HR 1',
  'pre-approval': 'HR 2'
};
// An HR/Admin account whose step HR has not set yet (such as one made before the steps were split).
export const NO_HR_TASK_LABEL = 'No HR step set';
export const HR_STEP_NAMES = { 'leave-credits': 'HR 1 (leave credits)', 'pre-approval': 'HR 2 (certification and pre-approval)' };

// A leave whose credits HR 1 certified when HR 1 still did that step, waiting for HR 2.
export const FOR_PRE_APPROVAL = 'For Pre-approval';
const WAITING_FOR_HR = ['Pending', 'Pending Review', FOR_PRE_APPROVAL];

// The HR step `request` is waiting for: 'pre-approval' (HR 2's) for a leave waiting for HR, or null
// when it is not waiting for HR. A Travel Order never waits for HR.
export const hrStepOf = request => (request?.type !== 'Travel Order' && WAITING_FOR_HR.includes(request?.status) ? 'pre-approval' : null);

// A Travel Order goes straight to the Head (the Provincial Director), who alone signs it: once the
// employee submits it, it is 'For Supervisor'. One filed before that waits as 'Pending'.
export const TRAVEL_ORDER_TO_HEAD = 'A Travel Order goes straight to the Provincial Director, who signs it. HR takes no step on it.';
export const TRAVEL_ORDER_SENT_REMARKS = 'Sent to the Provincial Director for approval.';
// True when the Head decides `request` now: a leave HR 2 sent, or a Travel Order submitted.
export const awaitsHead = request => request?.status === 'For Supervisor'
  || (request?.type === 'Travel Order' && ['Pending', 'Pending Review'].includes(request?.status));

// A leave goes to the Head (Sir Ivan at DILG Marinduque) for the final approval only after HR 2
// confirmed its leave credits (7.A) and pre-approved it (7.B), as the user set on 2026-11-12.
// While it is with HR, the Head neither sees it nor acts on it.
export const isLeaveWithHr = request => request?.type === 'Leave Request' && hrStepOf(request) !== null;
export const LEAVE_WITH_HR = 'This leave is still with HR 2 for the confirmation of leave credits and pre-approval. It comes to you for the final approval once HR 2 sends it.';

// True when HR 2 also certifies `request`'s leave credits (7.A) as it pre-approves it: a leave
// not certified yet.
export const needsCreditCertification = request => request?.type === 'Leave Request' && !request?.creditCertification;

// Whether an HR/Admin account with `hrTask` does `step`. An account without one does neither
// until HR sets it in Staff Accounts.
export const doesHrStep = (hrTask, step) => Boolean(step) && HR_TASKS.includes(hrTask) && hrTask === step;

// Leave credits are HR 1's and HR 2's to review and update, everywhere they change by hand:
// adjusting a balance, an opening balance from the leave card, charging a month's tardiness, and
// crediting a month's earned leave. HR 2 (Sir Erick at DILG Marinduque) also enters the balances
// he certifies on a leave. An HR/Admin account without an HR step changes none. (An approved
// leave is charged by the system.)
export const canChangeLeaveCredits = user => user?.accessLevel === 'hr_admin' && HR_TASKS.includes(user.hrTask);
export const LEAVE_CREDITS_HR_ONLY = 'Only HR 1 and HR 2 change leave credits. Ask HR to set your HR step in Staff Accounts.';

// HR 1 and HR 2 have different desks. HR 1 (Ma'am Joane at DILG Marinduque, the Admin Chief)
// keeps the whole HR/Admin desk and monitors everything. HR 2's desk (Sir Erick's) is only the
// requests to pre-approve and the leave credits, with his profile and the notices about requests.
// An HR/Admin account without an HR step keeps the whole desk.
export const usesHr2Desk = user => user?.accessLevel === 'hr_admin' && user?.hrTask === 'pre-approval';
// The pages on HR 2's desk; the first is where HR 2 lands after signing in.
export const HR2_DESK_VIEWS = ['hr_leave_records', 'hr_leave_credits', 'hr_profile', 'notifications'];
// The HR notices HR 2 gets: those about requests.
export const isHr2Notice = notification => notification?.type === 'request';

// HR 2 signs a leave's 7.A (certification of leave credits) and 7.B (recommendation) on CSC Form
// No. 6 in Adobe, with a digital ID, and uploads the signed PDF (see shared/signedForms.js). In
// WorkMate HR 2 first certifies and recommends, which makes the form ('For Pre-approval'); the
// signed upload sends the leave to the Head. A Travel Order has no signature at this step.
export const HR_SIGN_AND_UPLOAD = 'Download the form, sign 7.A and 7.B in Adobe, and upload the signed PDF. That sends the leave to the Head.';
// The Head approves a request, or disapproves a leave, by signing the form in Adobe and uploading it.
export const HEAD_SIGN_AND_UPLOAD = 'Download the form, sign it in Adobe, and upload the signed PDF. That records your decision.';
// True when HR 2 sends the request to the Head by uploading a signed form: a leave. A Travel
// Order is pre-approved without one.
export const needsHrSignedUpload = request => request?.type === 'Leave Request';

const round3 = number => Math.round(number * 1000) / 1000;

// HR 2's certification of the employee's leave credits for a leave of `days` working days
// (CSC Form No. 6, 7.A), as of `asOf` (YYYY-MM-DD): each balance now (Total Earned), the days
// this leave takes from it (Less this application), and what is left (Balance), as approving it
// will charge them (leaveCharge). A leave type with its own entitlement, such as maternity
// leave, takes nothing from either. `withoutPayDays` are the days the balances cannot cover.
export const leaveCreditCertification = ({ leaveType, days, employee, asOf }) => {
  const vacation = round3(Math.max(0, Number(employee?.vacationLeaveCredits) || 0));
  const sick = round3(Math.max(0, Number(employee?.sickLeaveCredits) || 0));
  const field = leaveCreditField(leaveType);
  const charge = field && days > 0
    ? leaveCharge({ field, days, vacation, sick })
    : { vacationLeaveDays: 0, sickLeaveDays: 0, withoutPayDays: 0, vacationLeaveCredits: vacation, sickLeaveCredits: sick };
  return {
    asOf,
    vacationLeave: { earned: vacation, less: charge.vacationLeaveDays, balance: charge.vacationLeaveCredits },
    sickLeave: { earned: sick, less: charge.sickLeaveDays, balance: charge.sickLeaveCredits },
    withoutPayDays: charge.withoutPayDays
  };
};

// HR 2's recommendation (CSC Form No. 6, 7.B): { decision: 'approval' | 'disapproval', reason },
// with a reason for a disapproval. Returns { value } or { error }.
export const readRecommendation = body => {
  const decision = body?.decision;
  if (!['approval', 'disapproval'].includes(decision)) return { error: 'Choose the recommendation: for approval or for disapproval.' };
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (decision === 'disapproval' && !reason) return { error: 'Write why the leave is recommended for disapproval.' };
  if (reason.length > 300) return { error: 'The reason must be 300 characters or fewer.' };
  return { value: { decision, reason: decision === 'disapproval' ? reason : '' } };
};
