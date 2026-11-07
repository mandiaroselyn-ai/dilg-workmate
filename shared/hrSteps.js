import { leaveCharge, leaveCreditField } from './leaveCalc.js';

// The HR steps a request takes before the Head decides it, as CSC Form No. 6, section 7, has them:
// HR 1 reviews the employee's leave credits and certifies them (7.A), then HR 2 recommends
// approval or disapproval (7.B) and sends it to the Head, who decides (7.C and 7.D). A Travel
// Order has no leave credits, so it goes straight to HR 2. Each HR/Admin account does one of
// the two (`hrTask`): HR 1's or HR 2's, and nothing else of the review.

export const HR_TASKS = ['leave-credits', 'pre-approval'];
export const HR_TASK_LABELS = {
  'leave-credits': 'HR 1: leave credits (7.A)',
  'pre-approval': 'HR 2: pre-approval (7.B)'
};
// An HR/Admin account whose step HR has not set yet (such as one made before the steps were split).
export const NO_HR_TASK_LABEL = 'No HR step set';
export const HR_STEP_NAMES = { 'leave-credits': 'HR 1 (leave credits)', 'pre-approval': 'HR 2 (pre-approval)' };

// A leave whose credits HR 1 certified, waiting for HR 2.
export const FOR_PRE_APPROVAL = 'For Pre-approval';
const WAITING_FOR_HR = ['Pending', 'Pending Review'];

// The HR step `request` is waiting for: 'leave-credits' for a leave HR 1 has not certified yet,
// 'pre-approval' for one HR 1 has, or for a Travel Order waiting for HR, or null when it is not
// waiting for HR.
export const hrStepOf = request => {
  if (request?.status === FOR_PRE_APPROVAL) return 'pre-approval';
  if (!WAITING_FOR_HR.includes(request?.status)) return null;
  return request.type === 'Leave Request' ? 'leave-credits' : 'pre-approval';
};

// Whether an HR/Admin account with `hrTask` does `step`. An account without one does neither
// until HR sets it in Staff Accounts.
export const doesHrStep = (hrTask, step) => Boolean(step) && HR_TASKS.includes(hrTask) && hrTask === step;

const round3 = number => Math.round(number * 1000) / 1000;

// HR 1's certification of the employee's leave credits for a leave of `days` working days
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
