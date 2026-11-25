import { clockTextMinutes, isLateLunchIn, isLateTimeText } from './attendanceTime.js';

// An attendance record HR adds for a day the employee worked but has no record of, such as when
// their phone died, WorkMate was down, or they forgot to time in. As with a paper DTR, a day
// without a log needs a reason (a written explanation approved by the Head, for example), and
// the record says HR added it, who, when, and why (the user's choice, 2026-11-25). HR corrects a
// day that already has a record instead.

export const HR_RECORD_REASON_MAX = 300;
const LOCATION_MAX = 200;
const DUTY_TYPES = ['office', 'field', 'wfh'];

const clock = value => (typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, ' ') : '');
const optionalClock = (value, label) => {
  const text = clock(value);
  if (!text) return { value: null };
  return clockTextMinutes(text) === null ? { error: `${label} must be a time such as 05:00 PM, or left empty.` } : { value: text };
};

// The record HR sends ({ employee, date, timeIn, lunchOut, lunchIn, timeOut, dutyType, location,
// reason }), checked: a day not after `today` (YYYY-MM-DD), its times in order, and a reason.
// Returns { value } or { error }.
export const readHrRecord = (body, today) => {
  const employee = typeof body?.employee === 'string' ? body.employee.trim() : '';
  if (!employee) return { error: 'Choose the employee.' };
  const date = typeof body?.date === 'string' ? body.date.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return { error: 'Choose the date, like 2026-11-25.' };
  if (date > today) return { error: 'A record can be added only for today or a day that has passed.' };

  const timeIn = clock(body?.timeIn);
  if (clockTextMinutes(timeIn) === null) return { error: 'Time In must be a time such as 08:05 AM.' };
  const lunchOut = optionalClock(body?.lunchOut, 'Lunch Out');
  const lunchIn = optionalClock(body?.lunchIn, 'Lunch In');
  const timeOut = optionalClock(body?.timeOut, 'Time Out');
  for (const part of [lunchOut, lunchIn, timeOut]) if (part.error) return { error: part.error };
  if (lunchIn.value && !lunchOut.value) return { error: 'Enter the Lunch Out with the Lunch In.' };
  // Each log after the one before it.
  const order = [['Time In', timeIn], ['Lunch Out', lunchOut.value], ['Lunch In', lunchIn.value], ['Time Out', timeOut.value]]
    .filter(([, value]) => value);
  for (let index = 1; index < order.length; index += 1) {
    if (clockTextMinutes(order[index][1]) <= clockTextMinutes(order[index - 1][1])) {
      return { error: `${order[index][0]} must be later than ${order[index - 1][0]}.` };
    }
  }

  const dutyType = typeof body?.dutyType === 'string' ? body.dutyType.trim().toLowerCase() : '';
  if (!DUTY_TYPES.includes(dutyType)) return { error: 'Choose where the employee worked: Office, Field, or WFH.' };
  const location = typeof body?.location === 'string' ? body.location.trim().replace(/\s+/g, ' ') : '';
  if (!location) return { error: 'Write where the employee worked, such as their office or barangay.' };
  if (location.length > LOCATION_MAX) return { error: `The place must be ${LOCATION_MAX} characters or fewer.` };
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!reason) return { error: 'Write why HR is adding this record, such as the approved letter of explanation.' };
  if (reason.length > HR_RECORD_REASON_MAX) return { error: `The reason must be ${HR_RECORD_REASON_MAX} characters or fewer.` };

  return {
    value: {
      employee,
      date,
      timeIn,
      lunchOut: lunchOut.value,
      lunchIn: lunchIn.value,
      timeOut: timeOut.value,
      dutyType,
      location,
      reason,
      // Late by the day's office hours, or back from lunch after 1:00 PM, as a corrected Time In is.
      late: isLateTimeText(timeIn, date) === true || isLateLunchIn(lunchIn.value) === true
    }
  };
};
