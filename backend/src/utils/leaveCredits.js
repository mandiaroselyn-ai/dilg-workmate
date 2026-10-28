import { countLeaveDays, leaveCreditField } from '../../../shared/leaveCalc.js';

export { leaveCreditField };

// A new account's vacation and sick leave. Under the CSC rules leave is earned month by month
// (1.25 days each), so a new employee starts with none; HR enters a transferee's or an existing
// employee's balance from their leave card.
export const DEFAULT_LEAVE_CREDITS = 0;

// Returns the deduction for a request that has just become Approved, or null when no
// credits should be deducted (not a leave request, already approved, a leave type with its own
// entitlement, or no working days). The days are counted from the leave's dates (Monday to
// Friday, without `holidays`), never taken from what the request says, so they cannot be
// changed by whoever sent it.
export const leaveCreditDeduction = (previous, updated, holidays = []) => {
  if (updated?.type !== 'Leave Request' || updated.status !== 'Approved' || previous?.status === 'Approved') return null;
  const field = leaveCreditField(updated.leaveType);
  const days = countLeaveDays(updated.startDate, updated.endDate, holidays);
  if (!field || days <= 0) return null;
  return { field, days };
};

// Validates HR's holidays: { holidays: [{ date: 'YYYY-MM-DD', name }] }.
export const normalizeHolidays = body => {
  const list = Array.isArray(body?.holidays) ? body.holidays : null;
  if (!list?.length) return { error: 'Add at least one holiday.' };
  if (list.length > 100) return { error: 'Add at most 100 holidays at a time.' };
  const holidays = [];
  for (const item of list) {
    const date = typeof item?.date === 'string' ? item.date.trim() : '';
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    const valid = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)
      && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
    if (!valid) return { error: 'Each holiday needs a real date, like 2026-12-25.' };
    if (!name || name.length > 100) return { error: 'Each holiday needs a name of 100 characters or fewer.' };
    holidays.push({ date, name });
  }
  return { holidays };
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "2026-10" as "October 2026".
export const monthLabel = month => `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

// Minutes as "2h 15m" or "45 min".
export const minutesText = minutes => (minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`);

// How one month's tardiness and undertime (`days`) is charged to an employee's vacation leave
// (`vacationLeaveCredits`): as much as vacation leave covers, and the rest without pay, as the
// CSC leave rules charge it. Values to three places.
export const tardinessCharge = (vacationLeaveCredits, days) => {
  const round = number => Math.round(number * 1000) / 1000;
  const available = Math.max(0, Number(vacationLeaveCredits) || 0);
  const deductedDays = Math.min(days, available);
  return {
    deductedDays: round(deductedDays),
    withoutPayDays: round(days - deductedDays),
    vacationLeaveCredits: round(available - deductedDays)
  };
};

// Validates HR's crediting of one month's earned leave: { month: 'YYYY-MM', identifiers: [...] }
// (each an employee ID or email). Only a month that has ended can be credited. `currentMonth`
// is this month, as YYYY-MM.
export const normalizeLeaveEarnings = (body, currentMonth) => {
  const month = typeof body?.month === 'string' ? body.month.trim() : '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { error: 'The month must be written like 2026-10.' };
  if (month >= currentMonth) return { error: 'Only a month that has ended can be credited. Credit this month once it is over.' };
  const identifiers = Array.isArray(body?.identifiers) ? body.identifiers.map(value => (typeof value === 'string' ? value.trim() : '')) : [];
  if (!identifiers.length) return { error: 'Choose at least one employee to credit.' };
  if (identifiers.length > 1000) return { error: 'Credit at most 1000 employees at a time.' };
  if (identifiers.some(value => !value)) return { error: 'Each employee to credit needs an employee ID or email.' };
  return { month, identifiers };
};

// Validates HR's charging of one month's tardiness and undertime to vacation leave:
// { month: 'YYYY-MM', deductions: [{ identifier, minutes }] }, where the minutes are each
// employee's DTR total for that month. Only a month that has ended can be charged, so a DTR
// still being filled in is never charged. `currentMonth` is this month, as YYYY-MM.
export const normalizeTardinessDeductions = (body, currentMonth) => {
  const month = typeof body?.month === 'string' ? body.month.trim() : '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { error: 'The month must be written like 2026-10.' };
  if (month >= currentMonth) return { error: 'Only a month that has ended can be charged. Charge this month once it is over.' };
  const list = Array.isArray(body?.deductions) ? body.deductions : null;
  if (!list?.length) return { error: 'Choose at least one employee to charge.' };
  if (list.length > 1000) return { error: 'Charge at most 1000 employees at a time.' };
  const deductions = [];
  for (const item of list) {
    const identifier = typeof item?.identifier === 'string' ? item.identifier.trim() : '';
    const minutes = Number(item?.minutes);
    if (!identifier) return { error: 'Each employee to charge needs an employee ID or email.' };
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 100000) {
      return { error: 'Tardiness and undertime must be a whole number of minutes from 0 to 100000.' };
    }
    deductions.push({ identifier, minutes });
  }
  return { month, deductions };
};

// Validates the balances HR may enter from the leave card when creating an account (for a
// transferee, or an employee who already has earned leave): { openingVacationLeaveCredits,
// openingSickLeaveCredits }, each blank or a number from 0 to 1000. Returns { value: null }
// when both are blank or 0 (a new employee starts with none), { value } with the balances, or
// { error }.
export const normalizeOpeningLeaveCredits = body => {
  const value = {};
  for (const [field, key, label] of [
    ['vacationLeaveCredits', 'openingVacationLeaveCredits', 'vacation leave'],
    ['sickLeaveCredits', 'openingSickLeaveCredits', 'sick leave']
  ]) {
    const raw = body?.[key];
    if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      value[field] = 0;
      continue;
    }
    const number = typeof raw === 'string' ? Number(raw) : raw;
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > 1000) {
      return { error: `The opening ${label} balance must be a number from 0 to 1000.` };
    }
    value[field] = Math.round(number * 1000) / 1000;
  }
  return { value: value.vacationLeaveCredits || value.sickLeaveCredits ? value : null };
};

// Validates HR's manual adjustment of an employee's balances. Credits may be fractional
// (monthly accrual is 1.25 days) and can accumulate past one year's entitlement.
export const normalizeLeaveCreditInput = body => {
  const value = {};
  for (const [field, label] of [['vacationLeaveCredits', 'Vacation leave'], ['sickLeaveCredits', 'Sick leave']]) {
    const raw = body?.[field];
    const number = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > 1000) {
      return { error: `${label} credits must be a number from 0 to 1000.` };
    }
    value[field] = Math.round(number * 1000) / 1000;
  }
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!reason) return { error: 'Give a reason for the adjustment, for example "Balance from the leave card".' };
  if (reason.length > 300) return { error: 'The reason must be 300 characters or fewer.' };
  return { value, reason };
};
