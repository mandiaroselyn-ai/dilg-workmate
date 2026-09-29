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
