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
