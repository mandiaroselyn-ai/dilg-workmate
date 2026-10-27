import { countsInDtr, dtrTimeOut } from './hrAttendance.js';
import { dtrDayLogs, dtrUndertimeMinutes, usesLunchLogs } from './dtrDay.js';

// One month of a Daily Time Record (CSC Form No. 48), as dtrForm.js prints it: each day's four
// cells and minutes of tardiness and undertime, and the month's total, which is what is
// charged to vacation leave.

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

// One day's four DTR cells and its undertime in minutes. A record with Lunch Out and Lunch
// In shows its own four logs, with tardiness and undertime against the office hours.
export function dayEntry(rec) {
  if (!usesLunchLogs(rec)) return { ...dtrTimes(rec.timeIn, rec.timeOut), undertime: undertimeMins(rec.timeIn, rec.timeOut) };
  const logs = dtrDayLogs(rec);
  const cell = value => fmt(parseTime(value));
  return {
    amArr: cell(logs.amArrival),
    amDep: cell(logs.amDeparture),
    pmArr: cell(logs.pmArrival),
    pmDep: cell(logs.pmDeparture),
    undertime: dtrUndertimeMinutes(logs)
  };
}

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
