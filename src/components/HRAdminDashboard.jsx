import React, { useState } from 'react';
import { getManilaDateString } from '../../shared/localDate';
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
  Users,
  XCircle
} from 'lucide-react';
import { activeEmployees, dtrIssue, employeeDayStatus, recordsForEmployees } from '../utils/hrAttendance';

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
  onOpenTab
}) {
  const [showAllActivities, setShowAllActivities] = useState(false);
  const today = getManilaDateString();
  // Only current, active employee accounts and their own records and requests are counted.
  const staff = activeEmployees(employees);
  const employeeHistory = recordsForEmployees(attendanceHistory, employees);
  const employeeRequests = recordsForEmployees(requests, employees);
  const totalEmployees = staff.length;
  const todayStatuses = staff.map(employee => ({
    employee,
    ...employeeDayStatus(employee, { records: employeeHistory, requests: employeeRequests, date: today })
  }));
  const countStatus = (...statuses) => todayStatuses.filter(item => statuses.includes(item.status)).length;
  const late = countStatus('Late');
  const present = countStatus('Present', 'Late');
  const onTime = present - late;
  const onLeave = countStatus('On Leave');
  const onTravel = countStatus('On Travel');
  const absent = countStatus('Absent');
  const leaveRequests = employeeRequests.filter(request => request.type === 'Leave Request');
  const travelRequests = employeeRequests.filter(request => request.type === 'Travel Order');
  const dtrIssues = employeeHistory.filter(record => dtrIssue(record, today));
  const geofenceAlerts = employeeHistory.filter(record => record.date === today && record.gpsStatus && !/in range/i.test(record.gpsStatus));
  const pendingLeave = leaveRequests.filter(request => request.status === 'Pending').length;
  const pendingTravel = travelRequests.filter(request => request.status === 'Pending').length;
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

  const employeeAttendanceRows = todayStatuses
    .map(({ employee, status, record }) => ({
      employeeName: employee.name || 'Unnamed Employee',
      status,
      timeIn: record?.timeIn || '--',
      timeOut: record?.timeOut || '--',
      late: status === 'Late'
    }))
    .slice(0, 8);

  const getAttendanceStatusStyle = (status) => {
    const normalized = (status || '').toLowerCase();
    if (normalized.includes('present') || normalized === 'in' || normalized === 'on time') {
      return 'bg-emerald-100 text-emerald-700';
    }
    if (normalized.includes('late')) {
      return 'bg-amber-100 text-amber-700';
    }
    if (normalized.includes('absent') || normalized === 'no record') {
      return 'bg-rose-100 text-rose-700';
    }
    return 'bg-slate-100 text-slate-700';
  };

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

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard icon={Users} label="Active Employees" value={totalEmployees} detail="Pending accounts not included" action="View Employees" color="bg-blue-50 text-blue-600" onClick={() => onOpenTab('directory')} />
        <MetricCard icon={CheckCircle2} label="Present Today" value={present} detail={`${rate}% of employees`} action="View Attendance" color="bg-emerald-50 text-emerald-600" onClick={() => onOpenTab('dtr')} />
        <MetricCard icon={XCircle} label="Absent Today" value={absent} detail={`${totalEmployees ? ((absent / totalEmployees) * 100).toFixed(1) : '0.0'}% of employees`} action="View Records" color="bg-rose-50 text-rose-600" onClick={() => onOpenTab('dtr')} />
        <MetricCard icon={Clock3} label="Late Today" value={late} detail={`${totalEmployees ? ((late / totalEmployees) * 100).toFixed(1) : '0.0'}% of employees`} action="View Late" color="bg-amber-50 text-amber-600" onClick={() => onOpenTab('dtr')} />
        <MetricCard icon={CalendarDays} label="On Leave" value={onLeave} detail="Employees currently on approved leave" action="View Leaves" color="bg-blue-50 text-blue-600" onClick={() => onOpenTab('requests')} />
        <MetricCard icon={Plane} label="On Official Travel" value={onTravel} detail="Employees assigned outside office" action="View Travels" color="bg-blue-50 text-blue-600" onClick={() => onOpenTab('requests')} />
        <MetricCard icon={AlertCircle} label="DTR Issues" value={dtrIssues.length} detail="Missing or incomplete attendance logs" action="Review DTR" color="bg-amber-50 text-amber-600" onClick={() => onOpenTab('dtr')} />
        <MetricCard icon={MapPin} label="Geofence Alerts" value={geofenceAlerts.length} detail="Employees outside assigned location" action="View Alerts" color="bg-rose-50 text-rose-600" onClick={() => onOpenTab('dtr')} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h3 className="text-lg font-black text-slate-900">Today's Attendance Overview</h3><button onClick={() => onOpenTab('dtr')} className="text-xs font-black text-indigo-700">View All <ArrowRight className="inline h-3 w-3" /></button></div><div className="mt-5 flex flex-wrap items-center justify-center gap-8 md:justify-start"><div className="relative h-44 w-44 shrink-0 rounded-full" style={{ background: `conic-gradient(#10b981 0deg ${presentDegrees}deg, #f59e0b ${presentDegrees}deg ${presentDegrees + lateDegrees}deg, #ef4444 ${presentDegrees + lateDegrees}deg ${presentDegrees + lateDegrees + absentDegrees}deg, #3b82f6 ${presentDegrees + lateDegrees + absentDegrees}deg 360deg)` }}><div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-white"><strong className="text-2xl font-black text-slate-900">{rate}%</strong><span className="text-xs font-bold text-slate-500">Attendance Rate</span></div></div><div className="grid min-w-[210px] gap-3 text-sm">{[['On Time', onTime, 'bg-emerald-500'], ['Late', late, 'bg-amber-500'], ['Absent', absent, 'bg-rose-500'], ['On Leave / Travel', onLeave + onTravel, 'bg-blue-500']].map(([label, value, color]) => <div key={label} className="flex items-center justify-between gap-8"><span className="flex items-center gap-2 font-semibold text-slate-600"><i className={`h-3 w-3 rounded-full ${color}`} />{label}</span><strong className="text-lg text-slate-900">{value}</strong></div>)}</div></div></section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-slate-900">Employee Attendance Information</h3>
          <button onClick={() => onOpenTab('dtr')} className="text-xs font-black text-indigo-700">View Details <ArrowRight className="inline h-3 w-3" /></button>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.22em] text-slate-500">
            <span>Employee</span>
            <span>Status</span>
            <span>Time In</span>
            <span>Time Out</span>
          </div>

          <div className="divide-y divide-slate-100">
            {employeeAttendanceRows.map((row) => (
              <div key={row.employeeName} className="grid grid-cols-[1.5fr_1fr_1fr_1fr] items-center gap-3 px-4 py-3 text-sm">
                <span className="font-semibold text-slate-700">{row.employeeName}</span>
                <span className={`inline-flex w-fit items-center justify-center rounded-full px-2.5 py-1 text-xs font-black ${getAttendanceStatusStyle(row.status)}`}>
                  {row.status}
                </span>
                <span className="text-slate-600">{row.timeIn}</span>
                <span className="text-slate-600">{row.timeOut}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h3 className="text-lg font-black text-slate-900">Pending Requests</h3><button onClick={() => onOpenTab('requests')} className="text-xs font-black text-indigo-700">View All <ArrowRight className="inline h-3 w-3" /></button></div><div className="mt-4 grid gap-4 md:grid-cols-3"><div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4"><CalendarDays className="h-7 w-7 text-emerald-600" /><div><p className="text-sm font-bold text-slate-700">Leave Applications</p><strong className="text-2xl text-emerald-600">{pendingLeave}</strong><p className="text-[11px] text-slate-500">For Supervisor Review</p></div></div><div className="flex items-center gap-3 rounded-xl bg-blue-50 p-4"><Plane className="h-7 w-7 text-blue-600" /><div><p className="text-sm font-bold text-slate-700">Travel Orders</p><strong className="text-2xl text-blue-600">{pendingTravel}</strong><p className="text-[11px] text-slate-500">For Supervisor Review</p></div></div><div className="flex items-center gap-3 rounded-xl bg-amber-50 p-4"><FileCheck2 className="h-7 w-7 text-amber-600" /><div><p className="text-sm font-bold text-slate-700">Returned Requests</p><strong className="text-2xl text-amber-600">{returned}</strong><p className="text-[11px] text-slate-500">Needs employee action</p></div></div></div></section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 pb-3"><h3 className="text-lg font-black text-slate-900">Recent Activities</h3>{allActivityItems.length > 5 && <button onClick={() => setShowAllActivities(value => !value)} aria-expanded={showAllActivities} className="text-xs font-black text-indigo-700">{showAllActivities ? 'Show Less' : `View All (${allActivityItems.length})`} <ArrowRight className={`inline h-3 w-3 ${showAllActivities ? '-rotate-90' : ''}`} /></button>}</div><div className={`divide-y divide-slate-100 ${showAllActivities ? 'max-h-[28rem] overflow-y-auto' : ''}`}>{activityItems.length ? activityItems.map(([title, detail, Icon, time, tone], index) => <div key={`${title}-${index}`} className="flex items-center gap-3 py-3"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-800">{title}</p><p className="truncate text-xs text-slate-500">{detail}</p></div><span className="shrink-0 text-xs font-semibold text-slate-500">{time}</span></div>) : <p className="py-4 text-center text-xs font-semibold text-slate-500">No attendance or request activity from current employees yet.</p>}</div></section>
    </div>
  );
}
