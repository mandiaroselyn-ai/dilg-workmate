import React from 'react';
import { ChevronRight, MapPin } from 'lucide-react';

// HR's Live Attendance Monitoring list, one compact row per employee: who they are, the day's four
// logs (Time In, Lunch Out, Lunch In, Time Out) with a dot each, the day's status, and where they
// are. A dot is filled once the log is made, hollow while it is still to come, and orange when a
// finished day lacks it (see missingDtrLog). A row opens to show the employee on the map.

const LOGS = [
  { key: 'timeIn', label: 'Time In', short: 'In', missing: 'Missing Time In' },
  { key: 'lunchOut', label: 'Lunch Out', short: 'Lunch out', missing: 'Missing Lunch Out' },
  { key: 'lunchIn', label: 'Lunch In', short: 'Lunch in', missing: 'Missing Lunch In' },
  { key: 'timeOut', label: 'Time Out', short: 'Out', missing: 'Missing Time Out' }
];
// The columns on a wide screen: employee, the four logs, status, location, and the arrow.
const GRID = 'sm:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,0.75fr))_minmax(0,1fr)_minmax(0,1.4fr)_16px]';

// "07:45 AM" as "7:45 AM".
const shortTime = value => String(value || '').replace(/^0(\d)/, '$1');

const LogCell = ({ log, value, missing }) => {
  const dot = value ? 'bg-emerald-500 border-emerald-500' : missing ? 'border-orange-500 bg-orange-100' : 'border-slate-300 bg-white';
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={`${log.label}: ${value || (missing ? 'missing' : 'not yet')}`}>
      <i className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 ${dot}`} aria-hidden="true" />
      <span className={`truncate text-xs ${value ? 'font-bold text-slate-800' : missing ? 'font-bold text-orange-700' : 'text-slate-400'}`}>
        <span className="sr-only">{log.label}: </span>{value ? shortTime(value) : missing ? 'Missing' : '—'}
      </span>
    </span>
  );
};

// `rows` are the page's monitoring rows ({ employee, record, name, role, office, location, status,
// time, missingLog, profilePicture }); `statusStyles[status]` is [badge classes, icon];
// `gpsRowOf(employee)` is the employee's GPS standing; `selectedKey` and `keyOf(employee)` tell
// the open row; `onSelect(employee or null)` opens or closes one; `onShowOnMap(employee)`.
export default function HRAttendanceList({ rows = [], statusStyles = {}, gpsRowOf = () => null, keyOf = () => '', selectedKey = '', onSelect = () => {}, onShowOnMap = () => {} }) {
  const initials = name => String(name || '').split(' ').map(part => part[0]).join('').slice(0, 2);
  if (!rows.length) return <p className="mt-3 rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs font-semibold text-slate-500">No employees match these filters.</p>;

  return (
    <div className="mt-3">
      <div className={`hidden gap-3 border-b border-slate-200 px-3 pb-2 text-[11px] font-black uppercase tracking-wide text-slate-500 sm:grid ${GRID}`}>
        <span>Employee</span>
        {LOGS.map(log => <span key={log.key}>{log.label}</span>)}
        <span>Status</span>
        <span>Location</span>
        <span />
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map((row, index) => {
          const [badge, Icon] = statusStyles[row.status] || statusStyles.Present || ['bg-slate-100 text-slate-700', null];
          const key = keyOf(row.employee);
          const open = Boolean(selectedKey) && key === selectedKey;
          const gps = gpsRowOf(row.employee);
          const inside = gps?.gpsState === 'Inside Assigned Area';
          const onLunch = gps?.gpsState === 'On Lunch';
          const tracked = inside || onLunch || gps?.gpsState === 'Outside Geofence';
          const logged = Boolean(row.record?.timeIn);
          return (
            <li key={`${row.name}-${index}`}>
              <button
                type="button"
                onClick={() => onSelect(open ? null : row.employee)}
                aria-expanded={open}
                className={`grid w-full grid-cols-1 items-center gap-2 rounded-xl px-3 py-2.5 text-left sm:gap-3 ${GRID} ${open ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-[11px] font-black text-slate-500">
                    {row.profilePicture ? <img src={row.profilePicture} alt="" className="h-full w-full object-cover" /> : initials(row.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black text-slate-800">{row.name}</span>
                    <span className="block truncate text-[11px] font-semibold text-slate-500">{[row.role, row.office].filter(Boolean).join(' · ')}</span>
                  </span>
                  {/* On a phone the status sits beside the name. */}
                  <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-black sm:hidden ${badge}`}>{Icon && <Icon className="h-3 w-3" />}{row.status.toUpperCase()}</span>
                </span>
                {logged ? (
                  <span className="grid grid-cols-4 gap-2 sm:contents">
                    {LOGS.map(log => (
                      <span key={log.key} className="min-w-0">
                        <span className="block text-[9px] font-black uppercase tracking-wide text-slate-400 sm:hidden">{log.short}</span>
                        <LogCell log={log} value={row.record[log.key]} missing={row.missingLog === log.missing} />
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-slate-500 sm:col-span-4">{row.time}</span>
                )}
                <span className="hidden sm:block">
                  <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-black ${badge}`}>{Icon && <Icon className="h-3 w-3" />}{row.status.toUpperCase()}</span>
                </span>
                <span className="min-w-0 text-[11px] font-semibold text-slate-600">
                  {tracked && (
                    <span className="flex items-center gap-1">
                      <i className={`h-2 w-2 shrink-0 rounded-full ${inside ? 'bg-green-600' : onLunch ? 'bg-sky-600' : 'bg-red-600'} ${gps.noSignal ? 'opacity-40' : ''}`} aria-hidden="true" />
                      <span className="truncate">{inside ? 'Inside area' : onLunch ? `On lunch since ${shortTime(gps.record.lunchOut)}` : 'Outside area'}{gps.noSignal ? ' · no live signal' : ''}</span>
                    </span>
                  )}
                  {row.location && <span className="block truncate text-slate-500">{row.location}</span>}
                </span>
                <ChevronRight className={`hidden h-4 w-4 transition-transform sm:block ${open ? 'rotate-90 text-blue-500' : 'text-slate-400'}`} aria-hidden="true" />
              </button>
              {open && (
                <div className="mx-3 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs">
                  <div>
                    <strong className="block text-blue-900">{row.name}</strong>
                    <span className="text-blue-700">{[row.status, row.time, row.location].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {gps && gps.gpsState !== 'Not Timed In' && <button type="button" onClick={() => onShowOnMap(row.employee)} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 font-black text-white"><MapPin className="h-3.5 w-3.5" />Show on map</button>}
                    <button type="button" onClick={() => onSelect(null)} className="font-black text-blue-700">Close</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
