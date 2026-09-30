// DILG WorkMate runs in the Philippines, so calendar dates (attendance days, request
// submission dates) are always Manila dates. `toISOString()` returns the UTC date,
// which is the previous day before 8:00 AM Manila time.
const MANILA_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

// Returns the Manila calendar date as YYYY-MM-DD.
export const getManilaDateString = (date = new Date()) => MANILA_DATE_FORMAT.format(date);

const MANILA_TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

// Returns minutes since midnight in Manila (for example, 8:05 AM is 485).
export const getManilaMinutesOfDay = (date = new Date()) => {
  const parts = Object.fromEntries(MANILA_TIME_FORMAT.formatToParts(date).map(part => [part.type, part.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
};

// Returns the Manila clock time as DTR records show it, for example "08:05 AM".
export const formatManilaClockTime = (date = new Date()) => {
  const minutes = getManilaMinutesOfDay(date);
  const hour24 = Math.floor(minutes / 60);
  const hour12 = hour24 % 12 || 12;
  return `${String(hour12).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} ${hour24 < 12 ? 'AM' : 'PM'}`;
};

// The first day of the month before `date` (YYYY-MM-DD). HR's attendance lists start on
// this day; HR loads an earlier month when it needs one.
export const attendanceWindowStart = (date = getManilaDateString()) => {
  const [year, month] = date.split('-').map(Number);
  const [startYear, startMonth] = month === 1 ? [year - 1, 12] : [year, month - 1];
  return `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
};
