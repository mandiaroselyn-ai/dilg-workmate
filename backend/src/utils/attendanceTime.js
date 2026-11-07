import { getManilaDateString, getManilaMinutesOfDay } from '../../../shared/localDate.js';
import { OFFICE_HOURS, daySchedule } from '../../../shared/officeHours.js';

// Whether an arrival at `minutes` after midnight on `date` (YYYY-MM-DD) is late, as government
// DTRs count tardiness: after the day's latest on-time arrival in the morning (7:00 AM on Monday,
// 9:00 AM on the flexitime days, see shared/officeHours.js), or after 1:00 PM from noon on, when a
// Time In starts an afternoon-only half day. The app and the DTR use the same office hours.
const isLateArrival = (minutes, date) => minutes > daySchedule(date, minutes).lateAfter;

// A Time In is late when it is after the latest on-time arrival of its day in Manila.
export const isLateClockIn = (date = new Date()) => (
  isLateArrival(getManilaMinutesOfDay(date), getManilaDateString(date))
);

// "08:05 AM" (how Time In and Time Out are saved) as minutes after midnight, or null.
export const clockTextMinutes = value => {
  const match = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(String(value || '').trim());
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 12 || Number(match[2]) > 59) return null;
  const hour = (Number(match[1]) % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return hour * 60 + Number(match[2]);
};

// Whether a saved Time In such as "08:05 AM" on `date` (YYYY-MM-DD) is late, by the same rule as
// isLateClockIn, or null when it is not a time.
export const isLateTimeText = (value, date) => {
  const minutes = clockTextMinutes(value);
  return minutes === null ? null : isLateArrival(minutes, date);
};

// Whether a Lunch In such as "01:15 PM" is late: back after 1:00 PM, the end of the noon
// break, which is tardiness too. null when it is not a time.
export const isLateLunchIn = value => {
  const minutes = clockTextMinutes(value);
  return minutes === null ? null : minutes > OFFICE_HOURS.pmStart;
};

// When a Time Out happened. An online Time Out uses the server clock. A Time Out that was
// saved offline and sent later keeps the time the phone recorded, but never earlier than
// the Time In or later than now.
export const resolveTimeOutMoment = ({ recordedOfflineAt, timeInAt, now = new Date() }) => {
  const recorded = typeof recordedOfflineAt === 'string' ? Date.parse(recordedOfflineAt) : NaN;
  if (!Number.isFinite(recorded)) return now;
  const timeIn = timeInAt ? new Date(timeInAt).getTime() : NaN;
  const earliest = Number.isFinite(timeIn) ? timeIn : recorded;
  return new Date(Math.min(now.getTime(), Math.max(recorded, earliest)));
};
