import React, { useEffect, useMemo, useState } from 'react';
import { getManilaDateString, getManilaMinutesOfDay } from '../../shared/localDate';
import { employeesInServiceOn } from '../../shared/separation';
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
  MapPin,
  Plane,
  UserRound,
  Users
} from 'lucide-react';
import { activeEmployees, dayEndText, dtrIssue, employeeDayStatus, geofenceStateOf, isDayOver, liveLocationFor, monitoringStatus, NO_TIME_IN, NOT_YET_IN, recordsForEmployees } from '../utils/hrAttendance';
import { matchesAttendanceEmployee } from '../utils/attendanceIdentity';
import { apiFetch } from '../utils/api';
import { weeklyAttendance } from '../utils/weeklyAttendance';
import WeeklyAttendanceChart from './WeeklyAttendanceChart';

// The live GPS of open shifts refreshes every 30 seconds while the page is on screen, as on
// Attendance's GPS & Geofence.
const LIVE_REFRESH_MS = 30000;

const MetricCard = ({ icon: Icon, label, value, detail, action, color, onClick }) => (
  <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
    <div className="flex items-start justify-between gap-3">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${color}`}><Icon className="h-4 w-4" /></div>
      <p className="text-2xl font-black tracking-tight text-slate-900">{value}</p>
    </div>
    <p className="mt-3 text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 min-h-7 text-xs font-semibold leading-3.5 text-slate-500">{detail}</p>
    <button type="button" onClick={onClick} className="mt-2 inline-flex items-center gap-1 text-xs font-black text-indigo-700">{action}<ArrowRight className="h-3 w-3" /></button>
  </article>
);

export default function HRAdminDashboard({
  user,
  employees = [],
  attendanceHistory = [],
  requests = [],
  holidays = [],
  onOpenTab
}) {
  const [showAllActivities, setShowAllActivities] = useState(false);
  // The live GPS of today's open shifts, for Geofence Alerts. Until it loads, or when it cannot,
  // each employee is counted from the GPS taken at their Time In, as Attendance does.
  const [liveLocations, setLiveLocations] = useState([]);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (document.hidden) return;
      apiFetch('/api/dtr/action?action=location-live')
        .then(async response => {
          const result = await response.json().catch(() => ({}));
          if (!cancelled && response.ok && result.success && Array.isArray(result.locations)) setLiveLocations(result.locations);
        })
        .catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, LIVE_REFRESH_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  const today = getManilaDateString();
  // Only current, active employee accounts and their own records and requests are counted.
  // Those in the service today.
  const staff = employeesInServiceOn(employees, today);
  const employeeHistory = recordsForEmployees(attendanceHistory, employees);
  const employeeRequests = recordsForEmployees(requests, employees);
  const totalEmployees = staff.length;
  // No Time In yet is Not Yet In before 7:00 AM on a Monday or 9:00 AM on the flexitime days,
  // then No Time In until the day's office hours end, and only then Absent (see monitoringStatus).
  const nowMinutes = getManilaMinutesOfDay();
  const todayIsOver = isDayOver(today, nowMinutes);
  const todayStatuses = staff.map(employee => {
    const day = employeeDayStatus(employee, { records: employeeHistory, requests: employeeRequests, date: today, holidays, today });
    return { employee, ...day, status: monitoringStatus(day.status, today, today, nowMinutes, day.record) };
  });
  // The last five working days beside today's donut. Made again only when the lists change, or
  // once today's office hours end (not on every refresh of the live GPS).
  const recentDays = useMemo(
    () => weeklyAttendance({ employees, records: attendanceHistory, requests, holidays, today, minutes: getManilaMinutesOfDay() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [employees, attendanceHistory, requests, holidays, today, todayIsOver]
  );
  const countStatus = (...statuses) => todayStatuses.filter(item => statuses.includes(item.status)).length;
  const late = countStatus('Late');
  const present = countStatus('Present', 'Late');
  const onTime = present - late;
  const onLeave = countStatus('On Leave');
  const onTravel = countStatus('On Travel');
  const absent = countStatus('Absent');
  const notYetIn = countStatus(NOT_YET_IN);
  const noTimeIn = countStatus(NO_TIME_IN);
  const leaveRequests = employeeRequests.filter(request => request.type === 'Leave Request');
  const travelRequests = employeeRequests.filter(request => request.type === 'Travel Order');
  // The records that need HR, plus the employees with no Time In today (No Time In or Absent,
  // after the latest on-time arrival), as Attendance's DTR Issues lists them.
  const dtrIssues = employeeHistory.filter(record => dtrIssue(record, today));
  const dtrIssueCount = dtrIssues.length + absent + noTimeIn;
  // Employees outside their assigned area now, by the live GPS of their open shift, as
  // Attendance's Geofence Status counts them (not those out for lunch or already timed out).
  const todayRecords = employeeHistory.filter(record => record.date === today);
  const geofenceAlerts = staff.filter(employee => geofenceStateOf(
    todayRecords.find(record => matchesAttendanceEmployee(record, employee)),
    liveLocationFor(liveLocations, employee, today)
  ) === 'Outside Geofence');
  const pendingLeave = leaveRequests.filter(request => ['Pending', 'For Pre-approval'].includes(request.status)).length;
  const pendingTravel = travelRequests.filter(request => ['Pending', 'For Pre-approval'].includes(request.status)).length;
  const returned = employeeRequests.filter(request => request.status === 'Returned' || request.status === 'Rejected').length;
  const rate = totalEmployees ? ((present / totalEmployees) * 100).toFixed(1) : '0.0';
  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? 'Good Morning' : greetingHour < 18 ? 'Good Afternoon' : 'Good Evening';
  const activityTime = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  // The latest Time Ins, Time Outs, and requests from current employees: five, or all of
  // them after View All.
  const allActivityItems = [
    ...employeeHistory.map(record => ({
      at: record.updatedAt || record.createdAt || record.date,
      title: record.timeOut ? 'Time Out recorded' : 'Time In recorded',
      detail: `${record.employeeName || 'Employee'} · ${record.date || ''} · ${record.timeOut || record.timeIn || ''}`,
      icon: record.timeOut ? Clock3 : CheckCircle2,
      tone: 'text-emerald-600 bg-emerald-50'
    })),
    ...employeeRequests.map(request => ({
      at: request.updatedAt || request.createdAt || request.dateSubmitted,
      title: `${request.type || 'Request'} · ${request.status || 'Submitted'}`,
      detail: `${request.employeeName || 'Employee'} · ${request.id || ''}`,
      icon: request.type === 'Travel Order' ? Plane : FileCheck2,
      tone: request.type === 'Travel Order' ? 'text-violet-600 bg-violet-50' : 'text-blue-600 bg-blue-50'
    }))
  ]
    .sort((a, b) => (new Date(b.at).getTime() || 0) - (new Date(a.at).getTime() || 0));
  const activityItems = (showAllActivities ? allActivityItems : allActivityItems.slice(0, 5))
    .map(item => [item.title, item.detail, item.icon, activityTime(item.at), item.tone]);
  const attendanceStatusTotal = Math.max(1, totalEmployees);
  const presentDegrees = (onTime / attendanceStatusTotal) * 360;
  const lateDegrees = (late / attendanceStatusTotal) * 360;
  const absentDegrees = (absent / attendanceStatusTotal) * 360;
  const awayDegrees = ((onLeave + onTravel) / attendanceStatusTotal) * 360;

  // Today's employees who need HR: absent, no Time In yet past the latest on-time arrival, late,
  // or with a log that needs HR (see dtrIssue), most serious first. Those not in yet before the
  // latest on-time arrival, on leave, or on travel are fine.
  const ATTENTION_ORDER = { Absent: 0, [NO_TIME_IN]: 1, Late: 2 };
  const attentionRows = todayStatuses
    .map(({ employee, status, record }) => {
      const issue = record ? dtrIssue(record, today) : '';
      const flagged = status in ATTENTION_ORDER;
      if (!flagged && !issue) return null;
      return {
        key: employee._id || employee.email || employee.employeeId || employee.name,
        name: employee.name || 'Unnamed Employee',
        office: employee.office || '',
        status: flagged ? status : issue,
        rank: flagged ? ATTENTION_ORDER[status] : 3,
        detail: status === NO_TIME_IN ? `Absent if none by ${dayEndText(today)}`
          : status === 'Absent' ? 'No Time In today'
            : [record?.timeIn && `Time In ${record.timeIn}`, flagged && issue].filter(Boolean).join(' · ')
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  const ATTENTION_SHOWN = 8;
  const attentionTone = rank => (rank === 0 ? 'bg-rose-50 text-rose-700' : rank === 3 ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700');

  return (
    <div className="w-full min-w-0 space-y-5 overflow-x-hidden pb-24 sm:pb-0">
      <header className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{greeting}, {user?.name || 'Admin'}!</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500 sm:text-sm">Overview of attendance, service operations, and pending HR actions.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3">
          <CalendarDays className="h-4 w-4 text-slate-500 sm:h-5 sm:w-5" />
          <div>
            <p className="text-xs font-black text-slate-700 sm:text-sm">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            <p className="text-xs font-semibold text-slate-500 sm:text-xs">{new Date().toLocaleDateString('en-US', { weekday: 'long' })}</p>
          </div>
        </div>
      </header>

      {/* What the attendance overview below does not show: the counts there are not repeated. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard icon={Users} label="Active Employees" value={totalEmployees} detail="Pending accounts not included" action="View Employees" color="bg-blue-50 text-blue-600" onClick={() => onOpenTab('directory')} />
        <MetricCard icon={AlertCircle} label="DTR Issues" value={dtrIssueCount} detail="Missing or incomplete attendance logs" action="Review DTR" color="bg-amber-50 text-amber-600" onClick={() => onOpenTab('dtr')} />
        <MetricCard icon={MapPin} label="Geofence Alerts" value={geofenceAlerts.length} detail="Employees outside assigned location" action="View Alerts" color="bg-rose-50 text-rose-600" onClick={() => onOpenTab('dtr')} />
        <MetricCard icon={FileCheck2} label="Pending Requests" value={pendingLeave + pendingTravel} detail={[`${pendingLeave} leave`, `${pendingTravel} Travel Order${pendingTravel === 1 ? '' : 's'}`, returned && `${returned} returned to employees`].filter(Boolean).join(' · ')} action="View Requests" color="bg-emerald-50 text-emerald-600" onClick={() => onOpenTab('requests')} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h3 className="text-lg font-black text-slate-900">Today's Attendance Overview</h3><button onClick={() => onOpenTab('dtr')} className="text-xs font-black text-indigo-700">View All <ArrowRight className="inline h-3 w-3" /></button></div><div className="mt-5 flex flex-wrap items-center justify-center gap-8 md:justify-start"><div className="relative h-44 w-44 shrink-0 rounded-full" style={{ background: `conic-gradient(#10b981 0deg ${presentDegrees}deg, #f59e0b ${presentDegrees}deg ${presentDegrees + lateDegrees}deg, #ef4444 ${presentDegrees + lateDegrees}deg ${presentDegrees + lateDegrees + absentDegrees}deg, #3b82f6 ${presentDegrees + lateDegrees + absentDegrees}deg ${presentDegrees + lateDegrees + absentDegrees + awayDegrees}deg, #cbd5e1 ${presentDegrees + lateDegrees + absentDegrees + awayDegrees}deg 360deg)` }}><div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-white"><strong className="text-2xl font-black text-slate-900">{rate}%</strong><span className="text-xs font-bold text-slate-500">Attendance Rate</span></div></div><div className="grid min-w-[210px] gap-3 text-sm">{[['On Time', onTime, 'bg-emerald-500'], ['Late', late, 'bg-amber-500'], ['Absent', absent, 'bg-rose-500'], ['On Leave / Travel', onLeave + onTravel, 'bg-blue-500'], ...(notYetIn ? [['Not Yet In', notYetIn, 'bg-slate-300']] : []), ...(noTimeIn ? [['No Time In', noTimeIn, 'bg-slate-300']] : [])].map(([label, value, color]) => <div key={label} className="flex items-center justify-between gap-8"><span className="flex items-center gap-2 font-semibold text-slate-600"><i className={`h-3 w-3 rounded-full ${color}`} />{label}</span><strong className="text-lg text-slate-900">{value}</strong></div>)}</div><WeeklyAttendanceChart days={recentDays} today={today} /></div></section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-slate-900">Needs attention today{attentionRows.length ? ` (${attentionRows.length})` : ''}</h3>
          <button onClick={() => onOpenTab('dtr')} className="text-xs font-black text-indigo-700">View all in Attendance <ArrowRight className="inline h-3 w-3" /></button>
        </div>
        {attentionRows.length ? (
          <ul className="mt-3 divide-y divide-slate-100">
            {attentionRows.slice(0, ATTENTION_SHOWN).map(row => (
              <li key={row.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-slate-800">{row.name}</span>
                  <span className="block truncate text-xs text-slate-500">{[row.office, row.detail].filter(Boolean).join(' · ')}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${attentionTone(row.rank)}`}>{row.status}</span>
              </li>
            ))}
            {attentionRows.length > ATTENTION_SHOWN && (
              <li className="pt-2.5 text-xs font-bold text-slate-500">And {attentionRows.length - ATTENTION_SHOWN} more in Attendance.</li>
            )}
          </ul>
        ) : (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> Everyone is on track today: no one late, absent, or with a log to fix.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 pb-3"><h3 className="text-lg font-black text-slate-900">Recent Activities</h3>{allActivityItems.length > 5 && <button onClick={() => setShowAllActivities(value => !value)} aria-expanded={showAllActivities} className="text-xs font-black text-indigo-700">{showAllActivities ? 'Show Less' : `View All (${allActivityItems.length})`} <ArrowRight className={`inline h-3 w-3 ${showAllActivities ? '-rotate-90' : ''}`} /></button>}</div><div className={`divide-y divide-slate-100 ${showAllActivities ? 'max-h-[28rem] overflow-y-auto' : ''}`}>{activityItems.length ? activityItems.map(([title, detail, Icon, time, tone], index) => <div key={`${title}-${index}`} className="flex items-center gap-3 py-3"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-800">{title}</p><p className="truncate text-xs text-slate-500">{detail}</p></div><span className="shrink-0 text-xs font-semibold text-slate-500">{time}</span></div>) : <p className="py-4 text-center text-xs font-semibold text-slate-500">No attendance or request activity from current employees yet.</p>}</div></section>
    </div>
  );
}
