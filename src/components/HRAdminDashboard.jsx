import React from 'react';
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
import { matchesAttendanceEmployee } from '../utils/attendanceIdentity';

const MetricCard = ({ icon: Icon, label, value, detail, action, color, onClick }) => (
  <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
    <div className="flex items-start justify-between gap-3">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${color}`}><Icon className="h-4 w-4" /></div>
      <p className="text-2xl font-black tracking-tight text-slate-900">{value}</p>
    </div>
    <p className="mt-3 text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 min-h-7 text-[10px] font-semibold leading-3.5 text-slate-400">{detail}</p>
    <button type="button" onClick={onClick} className="mt-2 inline-flex items-center gap-1 text-[10px] font-black text-indigo-700">{action}<ArrowRight className="h-3 w-3" /></button>
  </article>
);

export default function HRAdminDashboard({
  user,
  employees = [],
  attendanceHistory = [],
  requests = [],
  onOpenTab,
  onViewAllActivities
}) {
  const today = getManilaDateString();
  const todayRecords = attendanceHistory.filter(record => record.date === today);
  const totalEmployees = employees.length;
  const isRegisteredRecord = record => employees.some(employee => matchesAttendanceEmployee(record, employee));
  const registeredTodayRecords = todayRecords.filter(isRegisteredRecord);
  const employeeTodayRecord = employee => registeredTodayRecords.find(record => matchesAttendanceEmployee(record, employee));
  const present = employees.filter(employee => {
    const record = employeeTodayRecord(employee);
    return record?.status !== 'Absent' && Boolean(record?.timeIn);
  }).length;
  const absent = Math.max(0, totalEmployees - present);
  const late = employees.filter(employee => {
    const record = employeeTodayRecord(employee);
    return Boolean(record?.late || /late/i.test(record?.status || ''));
  }).length;
  const leaveRequests = requests.filter(request => request.type === 'Leave Request');
  const travelRequests = requests.filter(request => request.type === 'Travel Order');
  const onLeave = leaveRequests.filter(request => request.status === 'Approved').length;
  const onTravel = travelRequests.filter(request => request.status === 'Approved').length;
  const dtrIssues = attendanceHistory.filter(record => isRegisteredRecord(record) && (!record.timeIn || !record.timeOut || !record.selfieUrl || !record.fingerprintVerified));
  const geofenceAlerts = attendanceHistory.filter(record => isRegisteredRecord(record) && record.gpsStatus && !/in range/i.test(record.gpsStatus));
  const pendingLeave = leaveRequests.filter(request => request.status === 'Pending').length;
  const pendingTravel = travelRequests.filter(request => request.status === 'Pending').length;
  const returned = requests.filter(request => request.status === 'Returned' || request.status === 'Rejected').length;
  const rate = totalEmployees ? ((present / totalEmployees) * 100).toFixed(1) : '0.0';
  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? 'Good Morning' : greetingHour < 18 ? 'Good Afternoon' : 'Good Evening';
  const activityItems = [
    ['DTR validated', `Employee: ${attendanceHistory[0]?.employeeName || 'No recent record'}`, CheckCircle2, '9:21 AM', 'text-emerald-600 bg-emerald-50'],
    ['Leave request pending review', `Request ID: ${leaveRequests[0]?.id || 'No recent record'}`, FileCheck2, '8:48 AM', 'text-blue-600 bg-blue-50'],
    ['Geofence alert detected', `Employee: ${geofenceAlerts[0]?.employeeName || 'No recent record'}`, AlertCircle, '8:15 AM', 'text-amber-600 bg-amber-50'],
    ['Travel order submitted', `Request ID: ${travelRequests[0]?.id || 'No recent record'}`, Plane, '7:35 AM', 'text-violet-600 bg-violet-50']
  ];
  const attendanceStatusTotal = Math.max(1, present + absent + late);
  const presentDegrees = (present / attendanceStatusTotal) * 360;
  const lateDegrees = (late / attendanceStatusTotal) * 360;
  const absentDegrees = (absent / attendanceStatusTotal) * 360;

  const employeeAttendanceRows = employees
    .map((employee) => {
      const record = attendanceHistory.find((entry) => {
        return matchesAttendanceEmployee(entry, employee) && entry.date === today;
      });

      return {
        employeeName: employee.name || 'Unnamed Employee',
        status: record?.status || 'No Record',
        timeIn: record?.timeIn || '--',
        timeOut: record?.timeOut || '--',
        late: Boolean(record?.late || /late/i.test(record?.status || ''))
      };
    })
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
            <p className="text-[10px] font-semibold text-slate-500 sm:text-xs">{new Date().toLocaleDateString('en-US', { weekday: 'long' })}</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard icon={Users} label="Total Employees" value={totalEmployees} detail="Registered employee records" action="View Employees" color="bg-blue-50 text-blue-600" onClick={() => onOpenTab('directory')} />
        <MetricCard icon={CheckCircle2} label="Present Today" value={present} detail={`${rate}% of employees`} action="View Attendance" color="bg-emerald-50 text-emerald-600" onClick={() => onOpenTab('dtr')} />
        <MetricCard icon={XCircle} label="Absent Today" value={absent} detail={`${totalEmployees ? ((absent / totalEmployees) * 100).toFixed(1) : '0.0'}% of employees`} action="View Records" color="bg-rose-50 text-rose-600" onClick={() => onOpenTab('dtr')} />
        <MetricCard icon={Clock3} label="Late Today" value={late} detail={`${totalEmployees ? ((late / totalEmployees) * 100).toFixed(1) : '0.0'}% of employees`} action="View Late" color="bg-orange-50 text-orange-600" onClick={() => onOpenTab('dtr')} />
        <MetricCard icon={CalendarDays} label="On Leave" value={onLeave} detail="Employees currently on approved leave" action="View Leaves" color="bg-violet-50 text-violet-600" onClick={() => onOpenTab('requests')} />
        <MetricCard icon={Plane} label="On Official Travel" value={onTravel} detail="Employees assigned outside office" action="View Travels" color="bg-blue-50 text-blue-600" onClick={() => onOpenTab('requests')} />
        <MetricCard icon={AlertCircle} label="DTR Issues" value={dtrIssues.length} detail="Missing or incomplete attendance logs" action="Review DTR" color="bg-amber-50 text-amber-600" onClick={() => onOpenTab('dtr')} />
        <MetricCard icon={MapPin} label="Geofence Alerts" value={geofenceAlerts.length} detail="Employees outside assigned location" action="View Alerts" color="bg-rose-50 text-rose-600" onClick={() => onOpenTab('dtr')} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h3 className="text-lg font-black text-slate-900">Today's Attendance Overview</h3><button onClick={() => onOpenTab('dtr')} className="text-xs font-black text-indigo-700">View All <ArrowRight className="inline h-3 w-3" /></button></div><div className="mt-5 flex flex-wrap items-center justify-center gap-8 md:justify-start"><div className="relative h-44 w-44 shrink-0 rounded-full" style={{ background: `conic-gradient(#10b981 0deg ${presentDegrees}deg, #f97316 ${presentDegrees}deg ${presentDegrees + lateDegrees}deg, #ef4444 ${presentDegrees + lateDegrees}deg ${presentDegrees + lateDegrees + absentDegrees}deg, #8b5cf6 ${presentDegrees + lateDegrees + absentDegrees}deg 360deg)` }}><div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-white"><strong className="text-2xl font-black text-slate-900">{rate}%</strong><span className="text-[10px] font-bold text-slate-500">Attendance Rate</span></div></div><div className="grid min-w-[210px] gap-3 text-sm">{[['Present', present, 'bg-emerald-500'], ['Late', late, 'bg-orange-500'], ['Absent', absent, 'bg-rose-500'], ['On Leave', onLeave, 'bg-violet-500']].map(([label, value, color]) => <div key={label} className="flex items-center justify-between gap-8"><span className="flex items-center gap-2 font-semibold text-slate-600"><i className={`h-3 w-3 rounded-full ${color}`} />{label}</span><strong className="text-lg text-slate-900">{value}</strong></div>)}</div></div></section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-slate-900">Employee Attendance Information</h3>
          <button onClick={() => onOpenTab('dtr')} className="text-xs font-black text-indigo-700">View Details <ArrowRight className="inline h-3 w-3" /></button>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-3 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
            <span>Employee</span>
            <span>Status</span>
            <span>Time In</span>
            <span>Time Out</span>
          </div>

          <div className="divide-y divide-slate-100">
            {employeeAttendanceRows.map((row) => (
              <div key={row.employeeName} className="grid grid-cols-[1.5fr_1fr_1fr_1fr] items-center gap-3 px-4 py-3 text-sm">
                <span className="font-semibold text-slate-700">{row.employeeName}</span>
                <span className={`inline-flex w-fit items-center justify-center rounded-full px-2.5 py-1 text-[10px] font-black ${getAttendanceStatusStyle(row.status)}`}>
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

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 pb-3"><h3 className="text-lg font-black text-slate-900">Recent Activities</h3><button onClick={onViewAllActivities} className="text-xs font-black text-indigo-700">View All <ArrowRight className="inline h-3 w-3" /></button></div><div className="divide-y divide-slate-100">{activityItems.map(([title, detail, Icon, time, tone]) => <div key={title} className="flex items-center gap-3 py-3"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-800">{title}</p><p className="truncate text-xs text-slate-500">{detail}</p></div><span className="text-xs font-semibold text-slate-400">{time}</span></div>)}</div></section>
    </div>
  );
}
