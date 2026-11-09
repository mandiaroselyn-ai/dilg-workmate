import { requestCoversDate } from './hrAttendance.js';
import { durationText, isRestDate, tardiness, usesLunchLogs } from './dtrDay.js';

const nextDay = date => {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
};

// "2026-11-10" as "Nov 10".
const shortDate = date => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

// The last day of the employee's approved requests of `type` that cover `today`, and of the
// ones that follow with only weekends or HR's holidays between, or null when none covers today.
const lastDayOf = (type, { requests, today, holidays }) => {
  const approved = requests.filter(request => request?.type === type && /approved/i.test(request?.status || ''));
  const covers = date => approved.some(request => requestCoversDate(request, date));
  if (!covers(today)) return null;
  // Day by day from today, until a working day no request covers (at most about a year).
  let last = today;
  for (let day = today, step = 0; step < 400; day = nextDay(day), step += 1) {
    if (covers(day)) last = day;
    else if (!isRestDate(day, holidays)) break;
  }
  return last;
};

// What the status dot on the employee's own profile picture and the label on their profile say
// on `today` (YYYY-MM-DD): { kind: 'on-leave' | 'on-travel' | 'late', text }, or null.
// Leave and travel give the day they end, such as "On Leave · until Nov 10". A leave no longer
// shows once the employee has timed in that day, as they are back at work.
export const todayStatus = ({ requests = [], attendanceHistory = [], today, holidays = [] }) => {
  const records = attendanceHistory.filter(record => record?.date === today);
  const timedIn = records.some(record => record.timeIn && record.status !== 'Absent' && record.offlineTimeIn?.decision !== 'rejected');
  const ending = (kind, label, last) => ({ kind, text: last === today ? `${label} today` : `${label} · until ${shortDate(last)}` });

  const leaveEnds = timedIn ? null : lastDayOf('Leave Request', { requests, today, holidays });
  if (leaveEnds) return ending('on-leave', 'On Leave', leaveEnds);
  const travelEnds = lastDayOf('Travel Order', { requests, today, holidays });
  if (travelEnds) return ending('on-travel', 'On Travel', travelEnds);

  const late = records.find(record => record.late || /late/i.test(record.status || ''));
  if (!late) return null;
  const { am, pm } = usesLunchLogs(late) ? tardiness(late) : { am: 0, pm: 0 };
  return { kind: 'late', text: am + pm > 0 ? `Late today · ${durationText(am + pm)}` : 'Late today' };
};
