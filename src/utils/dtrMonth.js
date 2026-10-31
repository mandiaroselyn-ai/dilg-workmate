import { minutesToLeaveDays } from '../../shared/leaveConversion.js';
import { earnsLeaveCredits } from '../../shared/profileFields.js';
import { countsInDtr, dtrTimeOut } from './hrAttendance.js';
import { dtrDayLogs, dtrEarlyMinutes, dtrLateMinutes, dtrOvertime, dtrUndertimeMinutes, isRestDay, usesLunchLogs } from './dtrDay.js';

// One month of a Daily Time Record (CSC Form No. 48), as dtrForm.js prints it: each day's four
// cells and minutes of tardiness, undertime, and overtime, and the month's totals. Tardiness
// and undertime are what is charged to vacation leave; overtime is not deducted.

// Parses "08:05 AM" → { h: 8, min: 5 } in 24-hour values, or null.
function parseTime(value) {
  const m = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(String(value || '').trim());
  if (!m) return null;
  const h = (Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0);
  return { h, min: Number(m[2]) };
}

// Formats as "8:05" (no AM/PM, no seconds), as used in Philippine DTR forms.
function fmt(t) {
  if (!t) return '';
  return `${t.h % 12 || 12}:${String(t.min).padStart(2, '0')}`;
}

// Breaks a day's timeIn/timeOut into the four DTR columns, for a record from before Lunch
// Out and Lunch In were recorded (see usesLunchLogs): a whole day shows the usual noon break.
function dtrTimes(timeIn, timeOut) {
  const tin = parseTime(timeIn);
  const tout = parseTime(timeOut);
  if (!tin) return { amArr: '', amDep: '', pmArr: '', pmDep: '' };

  if (tin.h < 12 && tout && tout.h >= 13) {
    // Full day: morning arrival, afternoon departure.
    return { amArr: fmt(tin), amDep: '12:00', pmArr: '1:00', pmDep: fmt(tout) };
  }
  if (tin.h < 12) {
    // Morning only, or incomplete (no time-out).
    return { amArr: fmt(tin), amDep: tout ? fmt(tout) : '', pmArr: '', pmDep: '' };
  }
  // Afternoon only.
  return { amArr: '', amDep: '', pmArr: fmt(tin), pmDep: tout ? fmt(tout) : '' };
}

// Undertime in minutes for one day (0 if none or if record is incomplete), for a record from
// before Lunch Out and Lunch In were recorded.
function undertimeMins(timeIn, timeOut) {
  const tin = parseTime(timeIn);
  const tout = parseTime(timeOut);
  if (!tin || !tout) return 0;
  const tinM = tin.h * 60 + tin.min;
  const toutM = tout.h * 60 + tout.min;
  const isFullDay = tin.h < 12 && tout.h >= 13;
  const worked = toutM - tinM - (isFullDay ? 60 : 0); // subtract lunch break
  const required = isFullDay ? 480 : 240;             // 8h or 4h
  return Math.max(0, required - worked);
}

// One day's four DTR cells and its minutes: `undertime` is the form's UNDERTIME column, which is
// `late` (tardiness) and `early` (undertime) together, and `overtime` and `noOrder` (see
// dtrOvertime) are apart from them. A record with Lunch Out and Lunch In shows its own four
// logs, with tardiness and undertime against the office hours. A rest day has neither.
export function dayEntry(rec) {
  const logs = dtrDayLogs(rec);
  const cell = value => fmt(parseTime(value));
  const cells = usesLunchLogs(rec)
    ? { amArr: cell(logs.amArrival), amDep: cell(logs.amDeparture), pmArr: cell(logs.pmArrival), pmDep: cell(logs.pmDeparture) }
    : dtrTimes(rec.timeIn, rec.timeOut);
  const day = { ...cells, ...dtrOvertime(logs, rec) };
  if (isRestDay(rec)) return { ...day, undertime: 0, late: 0, early: 0 };
  if (!usesLunchLogs(rec)) {
    // These count the hours worked, so the time late is at most the day's undertime.
    const undertime = undertimeMins(rec.timeIn, rec.timeOut);
    const late = Math.min(undertime, dtrLateMinutes(logs));
    return { ...day, undertime, late, early: undertime - late };
  }
  return { ...day, undertime: dtrUndertimeMinutes(logs), late: dtrLateMinutes(logs), early: dtrEarlyMinutes(logs) };
}

// A record's day as the DTR shows it, or null when the DTR leaves it out (see dtrRecordsByDay).
export const dtrEntry = rec => (rec?.timeIn && countsInDtr(rec) ? dayEntry({ ...rec, timeOut: dtrTimeOut(rec) }) : null);

// One month's records by day of the month (`month` is 1–12), as the DTR shows them. An offline
// Time In that HR has not approved (or rejected) is left out, and so is an offline Time Out
// waiting for HR.
export function dtrRecordsByDay(attendanceRecords, year, month) {
  const recordsByDay = {};
  for (const rec of attendanceRecords) {
    if (!rec.date || !countsInDtr(rec)) continue;
    const date = new Date(`${rec.date}T00:00:00`);
    if (date.getFullYear() === year && date.getMonth() + 1 === month) {
      recordsByDay[date.getDate()] = { ...rec, timeOut: dtrTimeOut(rec) };
    }
  }
  return recordsByDay;
}

// The total minutes of tardiness and undertime of records by day, as the DTR's TOTAL row shows.
export const totalUndertimeMinutes = recordsByDay => Object.values(recordsByDay)
  .reduce((total, rec) => total + (rec?.timeIn ? dayEntry(rec).undertime : 0), 0);

// One employee's total tardiness and undertime in minutes for a month (`month` is 1–12), from
// their attendance records: the TOTAL of their DTR for that month.
export const monthUndertimeMinutes = (attendanceRecords, year, month) => totalUndertimeMinutes(dtrRecordsByDay(attendanceRecords, year, month));

// The month's minutes of tardiness (`late`), undertime (`early`), and overtime, from records by day.
export const monthDtrTotals = recordsByDay => Object.values(recordsByDay).reduce((totals, rec) => {
  if (!rec?.timeIn) return totals;
  const { late, early, overtime } = dayEntry(rec);
  return { late: totals.late + late, early: totals.early + early, overtime: totals.overtime + overtime };
}, { late: 0, early: 0, overtime: 0 });

const dayText = days => `${Number(days).toFixed(3)} day`;

// What the month's tardiness and undertime (`minutes`, its DTR total) take from the employee:
// what HR charged for that month (`month` is 1–12) or, until then, what the CSC table will
// charge. Contract of service and job order workers have no leave to charge it to.
export const monthDeductionText = (employee, year, month, minutes) => {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const charged = (employee?.tardinessDeductions || []).find(item => item.month === key);
  const parts = charged
    ? [charged.deductedDays && `${dayText(charged.deductedDays)} charged to vacation leave`, charged.withoutPayDays && `${dayText(charged.withoutPayDays)} without pay`]
    : [minutes && `${dayText(minutesToLeaveDays(minutes))} ${earnsLeaveCredits(employee) ? 'to be charged to vacation leave' : 'without pay'}`];
  return parts.filter(Boolean).join(', ') || 'None';
};
