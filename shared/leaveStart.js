import { earnsLeaveCredits } from './profileFields.js';

// The month WorkMate starts keeping leave credits (YYYY-MM), set by HR 1. Vacation and sick
// leave are cumulative and carry over to later years without limit (CSC MC No. 41, s. 1998,
// Omnibus Rules on Leave), so an employee's earlier leave is not started over: HR 1 copies each
// active employee's balance on their leave card as of the day before the start, and WorkMate
// counts from the start month on (1.25 days a month, approved leave, tardiness). The months
// before it stay on the leave card.

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const isMonthText = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));

// "2026-11" as "November 2026".
export const startMonthLabel = month => `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

const shiftMonth = (month, by) => {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1 + by, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

// The leave card date a starting balance is as of: the last day of the month before `start`,
// such as "2026-10-31" for a start in November 2026.
export const startingBalanceAsOf = start => {
  const [year, number] = start.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1, 0)).toISOString().slice(0, 10);
};

// "2026-10-31" as "October 31, 2026".
export const asOfLabel = date => `${MONTH_NAMES[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}, ${date.slice(0, 4)}`;

const isActive = employee => (employee?.accountStatus || 'Active').toString().toLowerCase() === 'active';

// True when HR 1 still has to enter `employee`'s starting balance for `start`: an active employee
// account that earns leave credits, hired before the start month (or with no date hired), with no
// starting balance for this start yet. Someone hired from the start month on begins with none, as
// any new employee does.
export const needsStartingBalance = (employee, start) => Boolean(start)
  && isActive(employee)
  && earnsLeaveCredits(employee)
  && (!employee?.dateHired || String(employee.dateHired) < `${start}-01`)
  && employee?.startingLeaveBalance?.start !== start;

// Why `month` cannot be WorkMate's start, or '' when it can. `currentMonth` is this month
// (YYYY-MM), `current` the start already set, and `employees` every employee account. The start
// is at most a year ahead. It cannot be on or before a month already credited or charged in
// WorkMate, which a starting balance would overwrite, and it is fixed once a starting balance
// has been entered for it, since that balance is as of the day before it.
export const startMonthProblem = (month, { currentMonth, current = '', employees = [] }) => {
  if (!isMonthText(month)) return 'Choose the month WorkMate starts counting leave credits, like 2026-11.';
  if (month > shiftMonth(currentMonth, 12)) return 'Choose a start month within the next year.';
  if (current && month !== current && employees.some(employee => employee?.startingLeaveBalance?.start === current)) {
    return `Starting balances as of ${asOfLabel(startingBalanceAsOf(current))} are already entered, so the start stays ${startMonthLabel(current)}.`;
  }
  const latest = employees
    .flatMap(employee => [...(employee?.leaveEarnings || []), ...(employee?.tardinessDeductions || [])])
    .map(entry => entry?.month || '')
    .filter(isMonthText)
    .sort()
    .at(-1);
  if (latest && month <= latest) {
    return `${startMonthLabel(latest)} is already credited or charged in WorkMate, so start from ${startMonthLabel(shiftMonth(latest, 1))} or later.`;
  }
  return '';
};

// Why `month` cannot be credited or charged in WorkMate when it starts in `start`, or ''.
export const beforeStartProblem = (month, start) => (start && month < start
  ? `WorkMate starts counting leave credits in ${startMonthLabel(start)}. ${startMonthLabel(month)} is on the leave card, in the starting balance.`
  : '');

// The starting balance HR 1 enters for one employee: { vacationLeaveCredits, sickLeaveCredits },
// each a number of days from 0 to 1000 (blank is 0). Returns { value } or { error }.
export const readStartingBalance = item => {
  const value = {};
  for (const [field, label] of [['vacationLeaveCredits', 'vacation leave'], ['sickLeaveCredits', 'sick leave']]) {
    const raw = item?.[field];
    const number = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '') ? 0
      : typeof raw === 'string' ? Number(raw) : raw;
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > 1000) {
      return { error: `The starting ${label} balance must be a number from 0 to 1000.` };
    }
    value[field] = Math.round(number * 1000) / 1000;
  }
  return { value };
};
