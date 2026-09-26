import React from 'react';
import { LogIn, LogOut, Clock as ClockIcon, MapPin, Check, CalendarDays } from 'lucide-react';

export default function AttendanceTodayCard({
  user = {},
  todayRecord = {},
  elapsedText = '--',
  currentUtcTime = '--:--:--',
  onViewDetails = () => {}
}) {
  const status = (() => {
    // Show ON DUTY if user has timeIn and hasn't timed out yet
    if (todayRecord?.timeIn && !todayRecord?.timeOut) return { label: 'ON DUTY', color: 'emerald' };
    // If user has both timeIn and timeOut, consider them OFF DUTY for the day
    if (todayRecord?.timeIn && todayRecord?.timeOut) return { label: 'OFF DUTY', color: 'rose' };
    // Default when no timeIn yet
    return { label: 'OFF DUTY', color: 'rose' };
  })();

  const shortenLocation = (name) => {
    if (!name) return 'Marinduque Prov. Office';
    let s = name
      .replace(/Provincial/gi, 'Prov.')
      .replace(/Province/gi, 'Prov.')
      .replace(/Municipal/gi, 'Mun.')
      .replace(/City/gi, 'City')
      .replace(/Office/gi, 'Office')
      .replace(/Department/gi, 'Dept.')
      .replace(/Region/gi, 'Reg.')
      .replace(/\s+/g, ' ')
      .trim();
    if (s.length > 30) s = s.slice(0, 27) + '...';
    return s;
  };

  const hasAttendanceRecord = Boolean(todayRecord?.timeIn || todayRecord?.timeOut || todayRecord?.location || todayRecord?.mode);
  const recordLocation = todayRecord?.location;
  const locationLabel = recordLocation ? shortenLocation(recordLocation) : 'Not recorded';
  const geoVerified = todayRecord?.gpsStatus && String(todayRecord.gpsStatus).toLowerCase().includes('in');

  // Infer mode: WFH, Field, or Office
  const mode = (() => {
    if (todayRecord?.mode) return String(todayRecord.mode).toLowerCase();
    if (todayRecord?.status && /wfh|work from home/i.test(todayRecord.status)) return 'wfh';
    if (todayRecord?.workAssignment && todayRecord.workAssignment.task && /field/i.test(String(todayRecord.workAssignment.task))) return 'field';
    if (todayRecord?.workAssignment && todayRecord.workAssignment.location && /home/i.test(String(todayRecord.workAssignment.location))) return 'wfh';
    return null;
  })();

  return (
    <div className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-sm">
      {/* Header removed - title shown in section container */}

      {/* Duty status banner with location */}
      <div className={`mt-3 rounded-lg p-3 flex flex-col gap-2 border border-transparent ${status.color === 'emerald' ? 'bg-emerald-50' : status.color === 'rose' ? 'bg-rose-50' : 'bg-amber-50'}`}>
        <div>
          <div className="text-[10px] font-semibold text-slate-600">DUTY STATUS</div>
          <div className="mt-1 flex items-center gap-2">
            <div className={`${status.label === 'OFF DUTY' ? 'text-sm' : 'text-lg'} font-extrabold ${status.color === 'emerald' ? 'text-emerald-800' : status.color === 'rose' ? 'text-rose-800' : 'text-amber-800'}`}>{status.label}</div>
            <div className={`inline-flex w-3 h-3 rounded-full shadow-sm ${status.color === 'emerald' ? 'bg-emerald-600' : status.color === 'rose' ? 'bg-rose-600' : 'bg-amber-500'}`} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <MapPin className="w-4 h-4 text-emerald-700" />
            <div className="truncate">{hasAttendanceRecord ? locationLabel : 'Not recorded'}</div>
            {mode && (
              <div className="ml-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${mode === 'wfh' ? 'bg-indigo-100 text-indigo-700' : mode === 'field' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{mode === 'wfh' ? 'WFH' : mode === 'field' ? 'FIELD' : 'OFFICE'}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${geoVerified ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              <Check className="w-3 h-3" />
            </div>
            <div className={`text-xs font-medium ${geoVerified ? 'text-emerald-700' : 'text-rose-700'}`}>{geoVerified ? 'Geo-tag Verified' : 'Geo-tag Not Verified'}</div>
          </div>
        </div>
      </div>

      {/* Clock box */}
      <div className="mt-3 rounded-md border border-slate-200 overflow-hidden">
        <div className="px-4 py-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">REAL-TIME CLOCK</div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">{currentUtcTime}</div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-slate-200 bg-white border-t border-slate-200">
          <div className="p-3 flex flex-col items-center text-center">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-emerald-700 text-white mb-2"><LogIn className="w-4 h-4" /></div>
            <div className="text-[10px] text-slate-500 font-semibold uppercase">TIME IN</div>
            <div className="mt-1 font-extrabold text-sm text-emerald-800">{todayRecord.timeIn || '--:-- --'}</div>
          </div>

          <div className="p-3 flex flex-col items-center text-center">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-rose-600 text-white mb-2"><LogOut className="w-4 h-4" /></div>
            <div className="text-[10px] text-slate-500 font-semibold uppercase">TIME OUT</div>
            <div className="mt-1 font-extrabold text-sm text-rose-700">{todayRecord.timeOut || '--:-- --'}</div>
          </div>

          <div className="p-3 flex flex-col items-center text-center">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-amber-500 text-white mb-2"><ClockIcon className="w-4 h-4" /></div>
            <div className="text-[10px] text-slate-500 font-semibold uppercase">TOTAL HOURS</div>
            <div className="mt-1 font-extrabold text-sm text-amber-700">{elapsedText || '--'}</div>
          </div>
        </div>
      </div>

      {/* Action button */}
      <div className="mt-4">
        <button onClick={onViewDetails} className="w-full rounded-lg bg-[#0B4EA2] text-white py-3 text-sm font-bold shadow-md">
          View Attendance Details
        </button>
      </div>
    </div>
  );
}
