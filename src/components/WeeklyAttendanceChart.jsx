import React, { useState } from 'react';

// The HR dashboard's last five working days (see utils/weeklyAttendance.js) as stacked columns,
// beside today's donut and in its colors, so the card's legend names them too: on time, late,
// absent, on leave or travel, and today's not yet in. Each day's numbers show as text on hover or
// keyboard focus, and in a table for screen readers.

const SERIES = [
  { key: 'onTime', label: 'On Time', color: '#10b981' },
  { key: 'late', label: 'Late', color: '#f59e0b' },
  { key: 'absent', label: 'Absent', color: '#ef4444' },
  { key: 'away', label: 'On Leave / Travel', color: '#3b82f6' },
  { key: 'notIn', label: 'Not yet in', color: '#cbd5e1' }
];
const PLOT = 132; // the tallest column, in px
const GAP = 2; // the surface gap between a column's parts

const utc = date => new Date(`${date}T00:00:00Z`);
const weekday = (date, style = 'short') => utc(date).toLocaleDateString('en-US', { weekday: style, timeZone: 'UTC' });
const monthDay = date => utc(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const rateOf = day => (day.total ? Math.round(((day.onTime + day.late) / day.total) * 100) : 0);
const describe = (day, isToday) => `${isToday ? 'Today, ' : ''}${weekday(day.date, 'long')}, ${monthDay(day.date)}: ${SERIES
  .filter(series => series.key !== 'notIn' || day.notIn)
  .map(series => `${day[series.key]} ${series.label.toLowerCase()}`)
  .join(', ')}, of ${day.total} employee${day.total === 1 ? '' : 's'}. Attendance rate ${rateOf(day)}%.`;

export default function WeeklyAttendanceChart({ days = [], today = '' }) {
  const [active, setActive] = useState('');
  const most = Math.max(1, ...days.map(day => day.total));

  return (
    <div className="min-w-[260px] flex-1 md:border-l md:border-slate-100 md:pl-8">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">Last {days.length} working days</p>
      <div className="mt-3 flex items-end justify-around gap-2 border-b border-slate-200" style={{ height: PLOT + 8 }} onMouseLeave={() => setActive('')}>
        {days.map((day, index) => {
          const parts = SERIES.filter(series => day[series.key] > 0);
          const height = (day.total / most) * PLOT;
          const usable = Math.max(0, height - GAP * (parts.length - 1));
          const isToday = day.date === today;
          // The tooltip opens beside the column, to the left of the last one, so it stays in the card.
          const side = index === days.length - 1 ? 'right-full mr-1' : 'left-full ml-1';
          return (
            <button
              key={day.date}
              type="button"
              aria-label={describe(day, isToday)}
              onMouseEnter={() => setActive(day.date)}
              onFocus={() => setActive(day.date)}
              onBlur={() => setActive('')}
              className="relative flex h-full w-12 cursor-default flex-col items-center justify-end rounded-md outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <span className="flex w-[22px] flex-col-reverse" style={{ height, gap: GAP }} aria-hidden="true">
                {parts.map((series, part) => (
                  <span
                    key={series.key}
                    className={part === parts.length - 1 ? 'rounded-t' : ''}
                    style={{ height: (usable * day[series.key]) / day.total, background: series.color }}
                  />
                ))}
              </span>
              {active === day.date && (
                <span role="tooltip" className={`pointer-events-none absolute top-0 z-10 w-max rounded-lg border border-slate-200 bg-white p-2 text-left text-[11px] shadow-lg ${side}`}>
                  <b className="block text-slate-900">{isToday ? 'Today' : weekday(day.date, 'long')}, {monthDay(day.date)}</b>
                  {parts.map(series => (
                    <span key={series.key} className="mt-0.5 flex items-center justify-between gap-4 font-semibold text-slate-600">
                      <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: series.color }} />{series.label}</span>
                      <b className="text-slate-900">{day[series.key]}</b>
                    </span>
                  ))}
                  <span className="mt-1 block border-t border-slate-100 pt-1 font-bold text-slate-500">Attendance rate {rateOf(day)}% of {day.total}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex justify-around gap-2 pt-1.5" aria-hidden="true">
        {days.map(day => (
          <span key={day.date} className="w-12 text-center leading-tight">
            <span className={`block text-[11px] ${day.date === today ? 'font-black text-slate-900' : 'font-bold text-slate-500'}`}>{day.date === today ? 'Today' : weekday(day.date)}</span>
            <span className="block text-[10px] font-semibold text-slate-400">{monthDay(day.date)}</span>
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Attendance of the last {days.length} working days</caption>
        <thead><tr><th scope="col">Day</th>{SERIES.map(series => <th key={series.key} scope="col">{series.label}</th>)}<th scope="col">Employees</th></tr></thead>
        <tbody>
          {days.map(day => (
            <tr key={day.date}><th scope="row">{weekday(day.date, 'long')}, {monthDay(day.date)}</th>{SERIES.map(series => <td key={series.key}>{day[series.key]}</td>)}<td>{day.total}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
