import { OFFICE_HOURS, daySchedule, isFixedHoursDay, workdayEnd } from './officeHours.js';

// Reminders so an employee does not forget a punch: Time In before it is late, Lunch Out and
// Lunch In at the noon break, and Time Out when their eight hours end. The server checks them on
// a schedule (vercel.json `schedules`, every weekday, Manila time) and sends each one at most once
// a day, only to an employee who still has that punch to make. These are times in minutes after
// midnight, Manila time, by DILG Marinduque's office hours (shared/officeHours.js).

// The Time In reminder comes this long before the day's latest on-time arrival: from 6:30 AM on
// Monday (in by 7:00) and from 8:30 AM on Tuesday to Friday (in by 9:00).
export const TIME_IN_REMINDER_LEAD = 30;
// Lunch Out from 12:00 NN, Lunch In from 12:45 PM (back by 1:00 PM).
export const LUNCH_OUT_REMINDER_AT = OFFICE_HOURS.noon;
export const LUNCH_IN_REMINDER_AT = OFFICE_HOURS.pmStart - 15;
// The Time Out reminder comes from 15 minutes before the employee's eight hours end, and no later
// than an hour after (a late run sends nothing rather than an old reminder).
export const TIME_OUT_REMINDER_LEAD = 15;
export const TIME_OUT_REMINDER_LAST = 60;

// "4:23 PM" from minutes after midnight.
export const clockLabel = minutes => {
  const hour24 = Math.floor(minutes / 60);
  return `${hour24 % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hour24 < 12 ? 'AM' : 'PM'}`;
};

// True for Monday to Friday (`date` YYYY-MM-DD). Saturdays and Sundays are rest days.
export const isWeekday = date => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
};

// Whether any reminder can be due on `date` at `minutes`, so a scheduled run with nothing to send
// stops before reading the database.
export const reminderWindowOpen = (date, minutes) => {
  if (!isWeekday(date)) return false;
  const { lateAfter } = daySchedule(date);
  const timeIn = minutes >= lateAfter - TIME_IN_REMINDER_LEAD && minutes <= lateAfter;
  const lunch = minutes >= LUNCH_OUT_REMINDER_AT && minutes <= OFFICE_HOURS.pmStart;
  const earliestEnd = workdayEnd(OFFICE_HOURS.amStart);
  const latestEnd = workdayEnd(OFFICE_HOURS.flexLatestStart);
  const timeOut = minutes >= earliestEnd - TIME_OUT_REMINDER_LEAD && minutes <= latestEnd + TIME_OUT_REMINDER_LAST;
  return timeIn || lunch || timeOut;
};

// The reminder due on `date` (YYYY-MM-DD, a working day for the employee) at `minutes`, from the
// employee's record of that day: `log` is null with no Time In yet, or { arrival (Time In in
// minutes after midnight), lunchOut, lunchIn, timeOut } with each punch true once recorded.
// Returns { kind, title, message } or null.
export const attendanceReminderFor = ({ date, minutes, log = null }) => {
  if (!isWeekday(date)) return null;
  if (!log) {
    const { lateAfter } = daySchedule(date);
    if (minutes < lateAfter - TIME_IN_REMINDER_LEAD || minutes > lateAfter) return null;
    return {
      kind: 'time-in',
      title: 'Time In Reminder',
      message: isFixedHoursDay(date)
        ? `You have no Time In yet today. Monday's office hours start at ${clockLabel(lateAfter)}, so Time In by then to avoid being late.`
        : `You have no Time In yet today. Time In by ${clockLabel(lateAfter)}; a Time In after ${clockLabel(lateAfter)} is late.`
    };
  }
  if (log.timeOut || !Number.isFinite(log.arrival)) return null;
  if (log.arrival < OFFICE_HOURS.noon && !log.lunchOut && minutes >= LUNCH_OUT_REMINDER_AT && minutes < LUNCH_IN_REMINDER_AT) {
    return {
      kind: 'lunch-out',
      title: 'Lunch Out Reminder',
      message: 'It is the noon break. Record your Lunch Out when you leave for lunch, so your DTR shows the morning\'s departure.'
    };
  }
  if (log.lunchOut && !log.lunchIn && minutes >= LUNCH_IN_REMINDER_AT && minutes <= OFFICE_HOURS.pmStart) {
    return {
      kind: 'lunch-in',
      title: 'Lunch In Reminder',
      message: `Record your Lunch In by ${clockLabel(OFFICE_HOURS.pmStart)}. Coming back after ${clockLabel(OFFICE_HOURS.pmStart)} is late.`
    };
  }
  const { end } = daySchedule(date, log.arrival);
  if (minutes >= end - TIME_OUT_REMINDER_LEAD && minutes <= end + TIME_OUT_REMINDER_LAST) {
    return {
      kind: 'time-out',
      title: 'Time Out Reminder',
      message: `Your eight working hours today end at ${clockLabel(end)}. Record your Time Out before you leave.`
    };
  }
  return null;
};
