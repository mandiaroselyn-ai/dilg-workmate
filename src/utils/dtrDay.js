// One day of a Daily Time Record (CSC Form No. 48): its four logs (A.M. arrival and
// departure, P.M. arrival and departure) and the minutes of tardiness and undertime they
// show against government office hours, 8:00 AM to 12:00 NN and 1:00 PM to 5:00 PM.

export const OFFICE_HOURS = { amStart: 8 * 60, noon: 12 * 60, pmStart: 13 * 60, pmEnd: 17 * 60 };

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

// Minutes of tardiness and undertime the four logs show: arriving after 8:00 AM or 1:00 PM,
// and leaving before 12:00 NN or 5:00 PM. A half day counts only the half that was worked;
// the other half is a leave or an absence, not undertime.
export const dtrUndertimeMinutes = logs => {
  const late = (value, start) => (clockMinutes(value) === null ? 0 : Math.max(0, clockMinutes(value) - start));
  const early = (value, end) => (clockMinutes(value) === null ? 0 : Math.max(0, end - clockMinutes(value)));
  return late(logs.amArrival, OFFICE_HOURS.amStart)
    + early(logs.amDeparture, OFFICE_HOURS.noon)
    + late(logs.pmArrival, OFFICE_HOURS.pmStart)
    + early(logs.pmDeparture, OFFICE_HOURS.pmEnd);
};

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
