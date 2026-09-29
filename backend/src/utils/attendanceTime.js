import { getManilaMinutesOfDay } from '../../../shared/localDate.js';

const DEFAULT_OFFICE_START_TIME = '08:00';

// Parses an HH:MM office start time (24-hour clock) into minutes since midnight.
const parseOfficeStart = value => {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value || '').trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

// A Time In is late when it is after the office start time in Manila. The start time
// comes from OFFICE_START_TIME (HH:MM, 24-hour clock) and defaults to 08:00.
export const isLateClockIn = (date = new Date(), officeStartTime = process.env.OFFICE_START_TIME) => {
  const startMinutes = parseOfficeStart(officeStartTime) ?? parseOfficeStart(DEFAULT_OFFICE_START_TIME);
  return getManilaMinutesOfDay(date) > startMinutes;
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
