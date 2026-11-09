import { countLeaveDays } from './leaveCalc.js';

// Leave that a calendar year allows a set number of days of, apart from vacation and sick leave,
// which accumulate (1.25 days of each a month): special privilege leave, 3 days a year (CSC MC
// No. 6, s. 1996; Omnibus Rules on Leave, Sec. 21), and wellness leave, 5 days a year, at most 3
// days in a row (CSC Resolution No. 2501292; CSC MC No. 1, s. 2026). Neither accumulates nor is
// paid out: days not used in the year are forfeited, and each January starts again. Neither is
// charged to vacation or sick leave.
export const WELLNESS_LEAVE = 'Wellness Leave';
export const SPECIAL_PRIVILEGE_LEAVE = 'Special Privilege Leave';
export const YEARLY_LEAVES = {
  [SPECIAL_PRIVILEGE_LEAVE]: { days: 3, name: 'Special privilege leave' },
  [WELLNESS_LEAVE]: { days: 5, consecutive: 3, name: 'Wellness leave' }
};

// A filed leave counts against its year until it is withdrawn, disapproved, returned, or discarded.
const COUNTED_STATUSES = ['Pending', 'Pending Review', 'For Pre-approval', 'For Supervisor', 'Approved'];

const dayOf = value => (typeof value === 'string' ? value.slice(0, 10) : '');

// The working days of `request` that fall in `year`.
const daysInYear = (request, year, holidays) => {
  const start = dayOf(request?.startDate);
  const end = dayOf(request?.endDate) || start;
  const from = start > `${year}-01-01` ? start : `${year}-01-01`;
  const to = end < `${year}-12-31` ? end : `${year}-12-31`;
  return start && from <= to ? countLeaveDays(from, to, holidays) : 0;
};

const requestId = request => request?.id || request?.customId || '';

// The days of `leaveType` filed or taken in `year` among `requests` (one employee's), leaving out
// the request `exceptId` (one being submitted again).
export const yearlyLeaveUsed = (requests = [], leaveType, year, holidays = [], exceptId = '') => requests
  .filter(request => request?.type === 'Leave Request' && request.leaveType === leaveType
    && COUNTED_STATUSES.includes(request.status) && !(exceptId && requestId(request) === exceptId))
  .reduce((total, request) => total + daysInYear(request, year, holidays), 0);

// The days of `leaveType` left in `year`, or null for leave without a yearly number of days.
export const yearlyLeaveLeft = (requests, leaveType, year, holidays = []) => {
  const rule = YEARLY_LEAVES[leaveType];
  return rule ? Math.max(0, rule.days - yearlyLeaveUsed(requests, leaveType, year, holidays)) : null;
};

// Why `request` (a leave being submitted) asks for more of its leave than its year has left, or,
// for wellness leave, more than 3 days in a row; null when it does not. `requests` are the
// employee's others.
export const yearlyLeaveProblem = (request, requests = [], holidays = []) => {
  const rule = YEARLY_LEAVES[request?.leaveType];
  if (!rule || request.type !== 'Leave Request') return null;
  const asked = countLeaveDays(request.startDate, request.endDate, holidays);
  if (rule.consecutive && asked > rule.consecutive) {
    return `${rule.name} is taken at most ${rule.consecutive} days at a time. File the other days as a separate request.`;
  }
  const startYear = Number(dayOf(request.startDate).slice(0, 4));
  const endYear = Number((dayOf(request.endDate) || dayOf(request.startDate)).slice(0, 4));
  for (let year = startYear; year <= endYear; year += 1) {
    const inYear = daysInYear(request, year, holidays);
    const left = Math.max(0, rule.days - yearlyLeaveUsed(requests, request.leaveType, year, holidays, requestId(request)));
    if (inYear > left) {
      return `${rule.name} is ${rule.days} days a year and does not carry over. You have ${left} day${left === 1 ? '' : 's'} left in ${year}, and this asks for ${inYear}.`;
    }
  }
  return null;
};
