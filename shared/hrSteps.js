import { leaveCharge, leaveCreditField } from './leaveCalc.js';

// The HR step a request takes before the Head decides it, as DILG Marinduque's CSC Form No. 6 has
// it: HR 2 certifies the employee's leave credits (7.A) and recommends approval or disapproval
// (7.B), both signed by HR 2 on the form, and sends it to the Head, who decides (7.C and 7.D). A
// Travel Order has no leave credits, so HR 2 only pre-approves it. HR 1 takes no step on
// requests: HR 1 reviews and updates the employees' leave credits on their own (Employee
// Management and DTR Records). Each HR/Admin account is one of the two (`hrTask`).

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

// The HR step `request` is waiting for: 'pre-approval' (HR 2's) for any request waiting for HR,
// or null when it is not waiting for HR.
export const hrStepOf = request => (WAITING_FOR_HR.includes(request?.status) ? 'pre-approval' : null);

// True when HR 2 also certifies `request`'s leave credits (7.A) as it pre-approves it: a leave
// not certified yet.
export const needsCreditCertification = request => request?.type === 'Leave Request' && !request?.creditCertification;

// Whether an HR/Admin account with `hrTask` does `step`. An account without one does neither
// until HR sets it in Staff Accounts.
export const doesHrStep = (hrTask, step) => Boolean(step) && HR_TASKS.includes(hrTask) && hrTask === step;

// Leave credits are HR 1's to review and update, everywhere they change by hand: adjusting a
// balance, an opening balance from the leave card, charging a month's tardiness, and crediting a
// month's earned leave. HR 2 certifies them on a leave but does not change them. (An approved
// leave is charged by the system.)
export const canChangeLeaveCredits = user => user?.accessLevel === 'hr_admin' && doesHrStep(user.hrTask, 'leave-credits');
export const LEAVE_CREDITS_HR_ONLY = 'Only HR 1 (leave credits) changes leave credits. Ask HR 1 to do it.';

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
