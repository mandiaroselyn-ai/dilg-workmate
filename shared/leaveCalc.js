// Leave credits by the CSC leave rules, shared by the server (which charges and credits them)
// and the app (which shows them before they are saved).

const round3 = number => Math.round(number * 1000) / 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const dayOf = value => (typeof value === 'string' ? value.slice(0, 10) : '');
const utcDay = day => Date.parse(`${day}T00:00:00Z`);

// The working days of a leave: Monday to Friday from `startDate` to `endDate` (YYYY-MM-DD,
// both included), without the holidays in `holidays` (YYYY-MM-DD dates, or { date }).
export const countLeaveDays = (startDate, endDate, holidays = []) => {
  const start = utcDay(dayOf(startDate));
  const end = utcDay(dayOf(endDate) || dayOf(startDate));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  const off = new Set(holidays.map(holiday => dayOf(typeof holiday === 'string' ? holiday : holiday?.date)));
  let days = 0;
  for (let time = start; time <= end; time += DAY_MS) {
    const weekday = new Date(time).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !off.has(new Date(time).toISOString().slice(0, 10))) days += 1;
  }
  return days;
};

// Leave credits earned for one month of service: 1.25 days of vacation leave and 1.25 of sick
// leave, less 1.25/30 day for each day of leave without pay that month, as the CSC table of
// credits earned (based on a 30-day month) has them: 1 day without pay earns 1.208, 2 days
// 1.167, and 30 days nothing.
export const monthlyEarnedCredits = (withoutPayDays = 0) => {
  const days = Math.min(30, Math.max(0, Number(withoutPayDays) || 0));
  return round3(1.25 * (30 - days) / 30);
};

// One employee's days of leave without pay in a month (YYYY-MM), which lower that month's
// earned credits: the part of their approved leave that their credits could not cover (counted
// in the month the leave starts), and the tardiness and undertime charged without pay for
// that month. `requests` are the employee's own; `tardinessDeductions` are on their account.
export const monthWithoutPayDays = (month, { requests = [], tardinessDeductions = [] } = {}) => round3(
  requests
    .filter(request => request?.type === 'Leave Request' && request.status === 'Approved' && dayOf(request.startDate).startsWith(month))
    .reduce((total, request) => total + (Number(request.creditCharge?.withoutPayDays) || 0), 0)
  + (Number(tardinessDeductions.find(item => item?.month === month)?.withoutPayDays) || 0)
);

// Which balance an approved leave type is charged to first: Vacation and Mandatory/Forced
// leave to vacation leave, Sick leave to sick leave. Others (maternity, special privilege, and
// so on) have their own entitlements and are not charged here (null).
export const leaveCreditField = leaveType => {
  const type = String(leaveType || '').toLowerCase();
  if (type.includes('sick')) return 'sickLeaveCredits';
  if (type.includes('vacation') || type.includes('mandatory') || type.includes('forced')) return 'vacationLeaveCredits';
  return null;
};

// How `days` of approved leave charged to `field` come out of the balances (`vacation` and
// `sick`): sick leave from sick leave and, once that runs out, from vacation leave; vacation
// leave from vacation leave. What the balances cannot cover is leave without pay. Returns the
// days taken from each and the new balances, to three places.
export const leaveCharge = ({ field, days, vacation, sick }) => {
  let rest = Math.max(0, Number(days) || 0);
  let vacationLeft = Math.max(0, Number(vacation) || 0);
  let sickLeft = Math.max(0, Number(sick) || 0);
  let sickLeaveDays = 0;
  if (field === 'sickLeaveCredits') {
    sickLeaveDays = Math.min(rest, sickLeft);
    sickLeft -= sickLeaveDays;
    rest -= sickLeaveDays;
  }
  const vacationLeaveDays = Math.min(rest, vacationLeft);
  vacationLeft -= vacationLeaveDays;
  rest -= vacationLeaveDays;
  return {
    sickLeaveDays: round3(sickLeaveDays),
    vacationLeaveDays: round3(vacationLeaveDays),
    withoutPayDays: round3(rest),
    vacationLeaveCredits: round3(vacationLeft),
    sickLeaveCredits: round3(sickLeft)
  };
};

// The holidays with fixed dates in a year, for HR to add at once: the regular and special
// non-working days whose dates do not move (National Heroes Day is the last Monday of August).
// Holy Week, the Eid holidays, Chinese New Year, and local holidays change each year and are
// added by HR from the year's proclamation.
export const fixedHolidays = year => {
  const lastMondayOfAugust = (() => {
    const date = new Date(Date.UTC(year, 7, 31));
    date.setUTCDate(31 - ((date.getUTCDay() + 6) % 7));
    return date.toISOString().slice(0, 10);
  })();
  return [
    [`${year}-01-01`, "New Year's Day"],
    [`${year}-04-09`, 'Araw ng Kagitingan'],
    [`${year}-05-01`, 'Labor Day'],
    [`${year}-06-12`, 'Independence Day'],
    [`${year}-08-21`, 'Ninoy Aquino Day'],
    [lastMondayOfAugust, 'National Heroes Day'],
    [`${year}-11-01`, "All Saints' Day"],
    [`${year}-11-30`, 'Bonifacio Day'],
    [`${year}-12-08`, 'Feast of the Immaculate Conception of Mary'],
    [`${year}-12-25`, 'Christmas Day'],
    [`${year}-12-30`, 'Rizal Day'],
    [`${year}-12-31`, 'Last Day of the Year']
  ].map(([date, name]) => ({ date, name }));
};
