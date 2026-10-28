import { getManilaMinutesOfDay } from '../../../shared/localDate.js';
import { OFFICE_HOURS } from '../../../shared/officeHours.js';

// The office start time as HH:MM (24-hour clock), from the office hours the app and the DTR
// use too, so a Time In the server marks late is late in the DTR as well.
const OFFICE_START_TIME = `${String(Math.floor(OFFICE_HOURS.amStart / 60)).padStart(2, '0')}:${String(OFFICE_HOURS.amStart % 60).padStart(2, '0')}`;

// Parses an HH:MM office start time (24-hour clock) into minutes since midnight.
const parseOfficeStart = value => {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value || '').trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

// Whether an arrival at `minutes` after midnight is late, as government DTRs count tardiness:
// after the office start (`officeStartTime`, HH:MM) in the morning, or after 1:00 PM from
// noon on, when a Time In starts an afternoon-only half day.
const isLateArrival = (minutes, officeStartTime) => minutes > (minutes >= OFFICE_HOURS.noon
  ? OFFICE_HOURS.pmStart
  : parseOfficeStart(officeStartTime) ?? OFFICE_HOURS.amStart);

// A Time In is late when it is after the start of its half of the day in Manila (the
// morning start is `officeStartTime`, HH:MM, and defaults to the office hours' 8:00 AM).
export const isLateClockIn = (date = new Date(), officeStartTime = OFFICE_START_TIME) => (
  isLateArrival(getManilaMinutesOfDay(date), officeStartTime)
);

// "08:05 AM" (how Time In and Time Out are saved) as minutes after midnight, or null.
export const clockTextMinutes = value => {
  const match = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(String(value || '').trim());
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 12 || Number(match[2]) > 59) return null;
  const hour = (Number(match[1]) % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return hour * 60 + Number(match[2]);
};

// Whether a saved Time In such as "08:05 AM" is late, by the same rule as isLateClockIn,
// or null when it is not a time.
export const isLateTimeText = (value, officeStartTime = OFFICE_START_TIME) => {
  const minutes = clockTextMinutes(value);
  return minutes === null ? null : isLateArrival(minutes, officeStartTime);
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
