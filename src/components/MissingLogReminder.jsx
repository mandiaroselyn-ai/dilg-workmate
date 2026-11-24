import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { attendanceWindowStart } from '../../shared/localDate';
import { incompleteDtrDays } from '../utils/hrAttendance';

// At most this many days are listed; the rest are counted.
const LISTED_DAYS = 5;
const dayText = date => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

// Reminds an employee of the days this month and last month whose DTR still lacks a log (a Time
// Out, Lunch Out, or Lunch In), so they ask HR to correct them before signing the DTR at the end
// of the month, when HR also charges late and undertime. A forgotten Time Out does not stop the
// next day's Time In; only HR can enter the missing log, and the day drops off once HR does.
// `records` are the employee's own attendance; nothing shows when every day is complete.
export default function MissingLogReminder({ records = [], today, className = '' }) {
  const days = incompleteDtrDays({ records, today, from: attendanceWindowStart(today) });
  if (!days.length) return null;
  const listed = days.slice(0, LISTED_DAYS);
  const more = days.length - listed.length;
  return (
    <section role="status" className={`rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 ${className}`}>
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0">
          <p className="text-sm font-black">Your DTR is missing {days.length === 1 ? 'a log' : 'logs'}</p>
          <p className="mt-0.5 text-xs">
            Tell HR so they can correct {days.length === 1 ? 'it' : 'them'} before you sign your DTR at the end of the month.
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {listed.map(({ date, record, missing }) => (
              <li key={record.id || date}>
                <b>{dayText(date)}</b>: {missing}{record.timeIn ? ` (Time In ${record.timeIn})` : ''}
              </li>
            ))}
          </ul>
          {more > 0 && <p className="mt-1 text-xs font-bold">and {more} more day{more === 1 ? '' : 's'}, listed in your attendance history</p>}
        </div>
      </div>
    </section>
  );
}
