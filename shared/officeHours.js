// DILG Marinduque's office hours, in minutes after midnight (Manila time). A working day is eight
// hours, without the 12:00 NN to 1:00 PM lunch break.
// - Monday: 7:00 AM to 12:00 NN and 1:00 to 4:00 PM, for everyone, since the week starts with
//   the flag-raising ceremony (RA 8491, Sec. 18).
// - Tuesday to Friday: flexitime, which an agency may set between 7:00 AM and 7:00 PM (CSC MC
//   No. 6, s. 2022). The employee comes in any time from 7:00 to 9:00 AM and leaves eight working
//   hours later, from 4:00 to 6:00 PM. Coming in after 9:00 AM is late, and the day still ends at
//   6:00 PM: staying later does not make up for it (CSC MC No. 21, s. 1991).
// The server reads a Time In as late by these hours, and the app and the DTR count tardiness,
// undertime, and overtime by them, so they always agree.
export const OFFICE_HOURS = {
  // Monday's start, and the earliest a flexitime day counts from.
  amStart: 7 * 60,
  // The latest a flexitime day can start without being late.
  flexLatestStart: 9 * 60,
  noon: 12 * 60,
  pmStart: 13 * 60,
  workMinutes: 8 * 60
};

const LUNCH_MINUTES = OFFICE_HOURS.pmStart - OFFICE_HOURS.noon;

// When eight working hours that start at `start` end, after the lunch break: 4:00 PM for 7:00 AM.
export const workdayEnd = start => start + OFFICE_HOURS.workMinutes + LUNCH_MINUTES;

// True when `date` (YYYY-MM-DD) is a Monday, the day with fixed hours.
export const isFixedHoursDay = date => new Date(`${date}T00:00:00Z`).getUTCDay() === 1;

// The office hours of `date` (YYYY-MM-DD) for an employee who arrived at `arrival` (minutes after
// midnight, or null before Time In): `lateAfter`, the latest on-time arrival; `start`, when the
// day's eight hours count from; and `end`, when they end. Monday is 7:00 AM, 7:00 AM, and 4:00 PM.
// Tuesday to Friday, the day counts from the arrival, but not before 7:00 or after 9:00 AM. An
// afternoon-only half day (an arrival from noon on) runs from 1:00 PM to the end of Monday's hours
// on a Monday, and for four hours, to 5:00 PM, on the other days.
export const daySchedule = (date, arrival = null) => {
  const { amStart, flexLatestStart, noon, pmStart, workMinutes } = OFFICE_HOURS;
  const fixed = isFixedHoursDay(date);
  if (arrival !== null && arrival >= noon) {
    return { lateAfter: pmStart, start: pmStart, end: fixed ? workdayEnd(amStart) : pmStart + workMinutes / 2 };
  }
  const lateAfter = fixed ? amStart : flexLatestStart;
  const start = Math.min(lateAfter, Math.max(amStart, arrival ?? amStart));
  return { lateAfter, start, end: workdayEnd(start) };
};
