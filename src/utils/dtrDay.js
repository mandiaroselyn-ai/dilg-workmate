import { OFFICE_HOURS } from '../../shared/officeHours.js';

// One day of a Daily Time Record (CSC Form No. 48): its four logs (A.M. arrival and
// departure, P.M. arrival and departure) and the minutes of tardiness and undertime they
// show against the office hours (shared/officeHours.js).

export { OFFICE_HOURS };

// Lunch Out and Lunch In are recorded from this day on. Earlier records have only a Time In
// and a Time Out, and their DTR keeps showing the usual noon break, as it did before.
export const LUNCH_LOGS_FROM = '2026-10-27';

// "08:05 AM" (how attendance times are saved) as minutes after midnight, or null.
export const clockMinutes = value => {
  const match = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(String(value || '').trim());
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 12 || Number(match[2]) > 59) return null;
  const hour = (Number(match[1]) % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return hour * 60 + Number(match[2]);
};

const hasLunchLogs = record => Boolean(record?.lunchOut || record?.lunchIn);

// Saturdays, Sundays, and the holidays HR set have no office hours (CSC MC No. 6, s. 2022, item
// V.A.1), so nothing is late, undertime, or absent on them. `record.holiday` comes from
// markDtrDay; isRestDate reads a date against HR's holidays.
export const isRestDay = record => Boolean(record?.holiday) || [0, 6].includes(new Date(`${record?.date}T00:00:00Z`).getUTCDay());
export const isRestDate = (date, holidays = []) => isRestDay({ date, holiday: holidays.some(holiday => holiday.date === date) });

// Whether the record's DTR is read from its own four logs, rather than from a Time In and
// Time Out with the noon break filled in.
export const usesLunchLogs = record => hasLunchLogs(record) || (record?.date || '') >= LUNCH_LOGS_FROM;

// The day's four logs as saved times ('' when there is none). A Time In before noon is the
// A.M. arrival; one from noon on is the P.M. arrival of an afternoon-only day. Without a
// Lunch In, a Time Out by 1:00 PM ends a morning-only day: it is the A.M. departure unless a
// Lunch Out already is. `timeOut` defaults to the record's.
export const dtrDayLogs = (record, timeOut = record?.timeOut) => {
  const logs = { amArrival: '', amDeparture: '', pmArrival: '', pmDeparture: '' };
  const timeIn = clockMinutes(record?.timeIn);
  if (timeIn === null) return logs;
  const out = clockMinutes(timeOut);
  if (timeIn >= OFFICE_HOURS.noon) {
    return { ...logs, pmArrival: record.timeIn, pmDeparture: out === null ? '' : timeOut };
  }
  const morningOnly = !record.lunchIn && out !== null && out <= OFFICE_HOURS.pmStart;
  return {
    amArrival: record.timeIn,
    amDeparture: record.lunchOut || (morningOnly ? timeOut : ''),
    pmArrival: record.lunchIn || '',
    pmDeparture: out === null || morningOnly ? '' : timeOut
  };
};

// Minutes an arrival was after `start`, or a departure before `end` (0 when on time or none).
export const minutesLate = (value, start) => (clockMinutes(value) === null ? 0 : Math.max(0, clockMinutes(value) - start));
export const minutesEarly = (value, end) => (clockMinutes(value) === null ? 0 : Math.max(0, end - clockMinutes(value)));

// Minutes of tardiness the four logs show (arriving after the morning or afternoon start), of
// undertime (leaving before noon or the end of the day), and of both, which is the DTR's
// UNDERTIME column. A half day counts only the half that was worked; the other half is a leave
// or an absence, not undertime.
export const dtrLateMinutes = logs => minutesLate(logs.amArrival, OFFICE_HOURS.amStart)
  + minutesLate(logs.pmArrival, OFFICE_HOURS.pmStart);
export const dtrEarlyMinutes = logs => minutesEarly(logs.amDeparture, OFFICE_HOURS.noon)
  + minutesEarly(logs.pmDeparture, OFFICE_HOURS.pmEnd);
export const dtrUndertimeMinutes = logs => dtrLateMinutes(logs) + dtrEarlyMinutes(logs);

// The spans of a day's work in minutes, without its break: the employee's own Lunch Out to Lunch
// In, or the noon hour when there are no lunch logs (overtime leaves out lunch, Joint CSC-DBM
// Circular No. 01-15, Sec. 8.2.1). None until the day has a departure.
const workedPeriods = logs => {
  const first = clockMinutes(logs.amArrival || logs.pmArrival);
  const last = clockMinutes(logs.pmDeparture || logs.amDeparture);
  if (first === null || last === null) return [];
  const breakStart = clockMinutes(logs.amDeparture) ?? OFFICE_HOURS.noon;
  const breakEnd = clockMinutes(logs.pmArrival) ?? OFFICE_HOURS.pmStart;
  return [[first, Math.min(last, breakStart)], [Math.max(first, breakEnd), last]];
};

// The day's `overtime` in minutes: work outside office hours, or at any time on a rest day,
// within the hours of an office order (`record.overtimeWindows`, from markDtrDay). Overtime
// needs that order (CSC-DBM Joint Circular No. 2, s. 2004, Sec. 5.2), is never deducted, and
// cannot offset tardiness or undertime (Joint CSC-DBM Circular No. 01-15, Sec. 10.4).
// `noOrder` is the work after office hours or on a rest day that no order covers, for HR to see.
// A day that cannot earn overtime (`record.noOvertime`) has neither.
export const dtrOvertime = (logs, record) => {
  if (record?.noOvertime) return { overtime: 0, noOrder: 0 };
  const { amStart, pmEnd } = OFFICE_HOURS;
  const restDay = isRestDay(record);
  const windows = record?.overtimeWindows || [];
  let overtime = 0;
  let noOrder = 0;
  for (const [start, end] of workedPeriods(logs)) {
    for (let minute = start; minute < end; minute += 1) {
      if ((restDay || minute < amStart || minute >= pmEnd) && windows.some(({ from, to }) => minute >= from && minute < to)) overtime += 1;
      else if (restDay || minute >= pmEnd) noOrder += 1;
    }
  }
  return { overtime, noOrder };
};

// How each punch of a record stands against office hours, as the DTR reads it (see
// dtrDayLogs): minutes `late` for Time In and Lunch In, minutes `early` for Lunch Out and Time
// Out, or null for a punch not made. A Time In from noon on is an afternoon arrival, and a
// Time Out that ends a morning-only day is a noon departure. A rest day has no office hours to
// stand against, so every punch is null.
export const punchStanding = record => {
  if (isRestDay(record)) return { timeIn: null, lunchOut: null, lunchIn: null, timeOut: null };
  const logs = dtrDayLogs(record);
  const { amStart, noon, pmStart, pmEnd } = OFFICE_HOURS;
  const timeOutEnd = !record?.timeOut ? null
    : logs.pmDeparture === record.timeOut ? pmEnd
      : logs.amDeparture === record.timeOut ? noon : null;
  return {
    timeIn: record?.timeIn ? { late: logs.amArrival ? minutesLate(logs.amArrival, amStart) : minutesLate(logs.pmArrival, pmStart) } : null,
    lunchOut: record?.lunchOut ? { early: minutesEarly(record.lunchOut, noon) } : null,
    lunchIn: record?.lunchIn ? { late: minutesLate(record.lunchIn, pmStart) } : null,
    timeOut: timeOutEnd === null ? null : { early: minutesEarly(record.timeOut, timeOutEnd) }
  };
};

// Minutes late of the day's arrivals, as government DTRs count tardiness: `am` for a morning
// Time In after the office start, and `pm` for an afternoon-only Time In or a Lunch In after
// 1:00 PM.
export const tardiness = record => {
  const standing = punchStanding(record);
  const timeInLate = standing.timeIn?.late || 0;
  const morning = (clockMinutes(record?.timeIn) ?? 0) < OFFICE_HOURS.noon;
  return { am: morning ? timeInLate : 0, pm: (morning ? 0 : timeInLate) + (standing.lunchIn?.late || 0) };
};

// A day's tardiness as shown, such as "AM 7 min · PM 15 min", or '' when on time.
export const tardinessText = record => {
  const { am, pm } = tardiness(record);
  return [am && `AM ${durationText(am)}`, pm && `PM ${durationText(pm)}`].filter(Boolean).join(' · ');
};

// An office time as shown: "8:00 AM", "12:00 NN", "5:00 PM".
export const officeTimeText = minutes => {
  const hour = Math.floor(minutes / 60);
  const minute = String(minutes % 60).padStart(2, '0');
  return minutes === OFFICE_HOURS.noon ? `12:${minute} NN` : `${hour % 12 || 12}:${minute} ${hour < 12 ? 'AM' : 'PM'}`;
};

// The office hours as CSC Form 48 writes them: "8:00–12:00, 1:00–5:00".
export const officeHoursText = () => {
  const short = minutes => `${Math.floor(minutes / 60) % 12 || 12}:${String(minutes % 60).padStart(2, '0')}`;
  const { amStart, noon, pmStart, pmEnd } = OFFICE_HOURS;
  return `${short(amStart)}–${short(noon)}, ${short(pmStart)}–${short(pmEnd)}`;
};

// A number of minutes as "7 min" or "1h 05m".
export const durationText = minutes => (minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`);

// The lunch log a finished whole day lacks: 'Missing Lunch Out', 'Missing Lunch In', or null.
// A day is whole when it starts before noon and ends after 1:00 PM.
export const missingLunchLog = record => {
  if (!usesLunchLogs(record)) return null;
  const timeIn = clockMinutes(record?.timeIn);
  const timeOut = clockMinutes(record?.timeOut);
  if (timeIn === null || timeOut === null || timeIn >= OFFICE_HOURS.noon || timeOut <= OFFICE_HOURS.pmStart) return null;
  if (!record.lunchOut) return 'Missing Lunch Out';
  if (!record.lunchIn) return 'Missing Lunch In';
  return null;
};
