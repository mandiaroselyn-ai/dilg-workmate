import { attendanceReminderFor, reminderWindowOpen } from '../../../shared/attendanceReminders.js';
import { getManilaDateString, getManilaMinutesOfDay } from '../../../shared/localDate.js';
import { holidaysFor } from '../../../shared/phHolidays.js';
import { noTimeInOn } from '../../../shared/travelStatus.js';
import { Announcement } from '../models/announcementModel.js';
import { AttendanceReminder } from '../models/attendanceReminderModel.js';
import { DtrLog } from '../models/dtrLogModel.js';
import { Holiday } from '../models/holidayModel.js';
import { Leave } from '../models/leaveModel.js';
import { User } from '../models/User.js';
import { clockTextMinutes } from '../utils/attendanceTime.js';

const lower = value => String(value || '').trim().toLowerCase();

// The employee's record of the day among `logs`, by Employee ID or else email.
const logOf = (logs, employee) => logs.find(log => (
  (employee.employeeId && log.employeeId === employee.employeeId)
  || (employee.email && lower(log.employeeEmail) === lower(employee.email))
)) || null;

// The punches of `log` as shared/attendanceReminders.js reads them, or null with no Time In.
const punchesOf = log => (log ? {
  arrival: clockTextMinutes(log.timeIn),
  lunchOut: Boolean(log.lunchOut),
  lunchIn: Boolean(log.lunchIn),
  timeOut: Boolean(log.timeOut)
} : null);

// Sends the attendance reminders due at `now` (see shared/attendanceReminders.js): to each active
// employee who can Time In, on a working day for them (not a holiday of theirs, not a day of their
// approved leave or Travel Order, not before they were hired), the one punch they have not made
// yet. Each reminder goes once per employee and day, as a bell notification and a push to their
// phone and browser. Returns { date, time, sent }.
export const sendAttendanceReminders = async (now = new Date()) => {
  const date = getManilaDateString(now);
  const minutes = getManilaMinutesOfDay(now);
  const summary = { date, time: minutes, sent: 0 };
  if (!reminderWindowOpen(date, minutes)) return summary;

  const [employees, holidays, logs, absences] = await Promise.all([
    User.findAttendanceReminderRecipients(),
    Holiday.findAll(),
    DtrLog.findPunchesOnDate(date),
    Leave.findApprovedAbsencesOn(date)
  ]);

  const due = [];
  for (const employee of employees) {
    const hired = String(employee.dateHired || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(hired) && hired > date) continue;
    if (holidaysFor(holidays, employee).some(holiday => holiday?.date === date)) continue;
    if (noTimeInOn(absences, employee, date)) continue;
    const reminder = attendanceReminderFor({ date, minutes, log: punchesOf(logOf(logs, employee)) });
    if (!reminder) continue;
    const who = employee.employeeId || lower(employee.email);
    if (who) due.push({ key: `${date}|${reminder.kind}|${who}`, employee, reminder });
  }
  if (!due.length) return summary;

  const claimed = new Set(await AttendanceReminder.claim(due.map(item => item.key)));
  const results = await Promise.allSettled(due.filter(item => claimed.has(item.key)).map(({ employee, reminder }) => (
    Announcement.createNotification({
      title: reminder.title,
      message: reminder.message,
      type: 'attendance',
      view: 'attendance',
      employeeId: employee.employeeId || '',
      employeeEmail: employee.email || '',
      ring: true,
      waitForPush: true
    })
  )));
  for (const result of results) {
    if (result.status === 'rejected') console.error('Unable to send an attendance reminder:', result.reason?.message || result.reason);
  }
  summary.sent = results.filter(result => result.status === 'fulfilled').length;
  return summary;
};
