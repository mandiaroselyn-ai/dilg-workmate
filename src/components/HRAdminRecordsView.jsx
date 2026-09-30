import React, { useMemo, useState } from 'react';
import { getManilaDateString } from '../../shared/localDate';
import {
  Activity,
  AlarmClockCheck,
  CalendarDays,
  CheckCircle2,
  FileText,
  Plane,
  Search,
  ShieldCheck,
  Users
} from 'lucide-react';
import { activeEmployees, employeeDayStatus, hasSelfie, recordsForEmployees } from '../utils/hrAttendance';
import OlderAttendanceLoader from './OlderAttendanceLoader';

const StatCard = ({ icon: Icon, label, value, hint, accentClass }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accentClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-2xl font-black tracking-tight text-slate-900">{value}</span>
    </div>
    <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-slate-500">{label}</p>
    <p className="mt-1 text-[11px] font-semibold text-slate-500">{hint}</p>
  </div>
);

// Long tables show this many rows at a time.
const PAGE_SIZE = 50;

const ShowMore = ({ shown, total, onMore }) => (total > shown ? (
  <button type="button" onClick={onMore} className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-black text-indigo-700 hover:bg-slate-50">
    Show more ({Math.min(PAGE_SIZE, total - shown)} of {total - shown} remaining)
  </button>
) : null);

export default function HRAdminRecordsView({ employees = [], attendanceHistory: allAttendance = [], requests: allRequests = [], attendanceFrom, loadedAttendanceMonths = [], onLoadAttendanceMonth }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const openTab = tab => {
    setActiveTab(tab);
    setShownCount(PAGE_SIZE);
  };
  const showMore = () => setShownCount(count => count + PAGE_SIZE);
  const today = getManilaDateString();
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const matchesSearch = (value = '') => {
    if (!normalizedQuery) return true;
    const searchText = String(value).toLowerCase();
    const monthName = new Date(value).toLocaleString('en-US', { month: 'long' });
    return searchText.includes(normalizedQuery) || monthName.toLowerCase().includes(normalizedQuery);
  };
  // Counted like the Dashboard: only active employee accounts, and only records and
  // requests that belong to a current employee account.
  const staff = activeEmployees(employees);
  const attendanceHistory = recordsForEmployees(allAttendance, employees);
  const requests = recordsForEmployees(allRequests, employees);
  const todayStatuses = staff.map(employee => employeeDayStatus(employee, { records: attendanceHistory, requests, date: today }).status);
  const lateCount = todayStatuses.filter(status => status === 'Late').length;
  const presentCount = lateCount + todayStatuses.filter(status => status === 'Present').length;
  const absentCount = todayStatuses.filter(status => status === 'Absent').length;

  const leaveApplications = requests.filter((request) => request.type === 'Leave Request');
  const approvedLeaves = leaveApplications.filter((request) => request.status === 'Approved');
  const pendingLeaves = leaveApplications.filter((request) => request.status === 'Pending');

  const travelOrders = requests.filter((request) => request.type === 'Travel Order');
  const approvedTravel = travelOrders.filter((request) => request.status === 'Approved');
  const pendingTravel = travelOrders.filter((request) => request.status === 'Pending');

  const verifiedDtr = attendanceHistory.filter((record) => hasSelfie(record) && record.fingerprintVerified).length;
  const totalEmployees = staff.length;

  const dtrTable = useMemo(
    () =>
      attendanceHistory
        .filter((record) => {
          const employeeName = record.employeeName || 'Unassigned Employee';
          const rowDate = record.date || today;
          return (
            !normalizedQuery ||
            [employeeName, rowDate, record.status, record.timeIn, record.timeOut, new Date(rowDate).toLocaleString('en-US', { month: 'long' })]
              .some((value) => String(value).toLowerCase().includes(normalizedQuery))
          );
        })
        .map((record) => ({
          id: record.id || record.employeeId || record.employeeName,
          employee: record.employeeName || 'Unassigned Employee',
          date: record.date || today,
          status: record.status || 'Present',
          timeIn: record.timeIn || '—',
          timeOut: record.timeOut || '—',
          late: record.late || /late/i.test(record.status || '') ? 'Late' : 'On Time'
        })),
    [attendanceHistory, normalizedQuery, today]
  );

  const leaveRows = useMemo(
    () =>
      leaveApplications
        .filter((request) => {
          const employeeName = request.employeeName || 'Unknown Employee';
          const rowDate = request.date || request.createdAt || today;
          return (
            !normalizedQuery ||
            [employeeName, rowDate, request.status, request.leaveType, new Date(rowDate).toLocaleString('en-US', { month: 'long' })]
              .some((value) => String(value).toLowerCase().includes(normalizedQuery))
          );
        })
        .map((request) => ({
          id: request.id || 'N/A',
          employee: request.employeeName || 'Unknown Employee',
          type: request.leaveType || 'Leave',
          date: request.date || request.createdAt || today,
          status: request.status || 'Pending'
        })),
    [leaveApplications, normalizedQuery, today]
  );

  const travelRows = useMemo(
    () =>
      travelOrders
        .filter((request) => {
          const employeeName = request.employeeName || 'Unknown Employee';
          const rowDate = request.date || request.createdAt || today;
          return (
            !normalizedQuery ||
            [employeeName, rowDate, request.status, request.purpose, new Date(rowDate).toLocaleString('en-US', { month: 'long' })]
              .some((value) => String(value).toLowerCase().includes(normalizedQuery))
          );
        })
        .map((request) => ({
          id: request.id || 'N/A',
          employee: request.employeeName || 'Unknown Employee',
          purpose: request.purpose || 'Official Travel',
          date: request.date || request.createdAt || today,
          status: request.status || 'Pending'
        })),
    [travelOrders, normalizedQuery, today]
  );

  const downloadCsv = (filename, headers, rows) => {
    const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    // The byte order mark makes Excel read the file as UTF-8, so names with ñ stay intact.
    const csv = `\uFEFF${[headers, ...rows].map(row => row.map(escape).join(',')).join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const reportCards = [
    {
      title: 'DTR Attendance Report',
      description: 'Time In, Time Out, status, and late records per employee.',
      count: dtrTable.length,
      accent: 'bg-indigo-50 text-indigo-700',
      download: () => downloadCsv('dtr-attendance-report.csv', ['Employee', 'Date', 'Time In', 'Time Out', 'Status'], dtrTable.map(row => [row.employee, row.date, row.timeIn, row.timeOut, row.status]))
    },
    {
      title: 'Leave Applications Report',
      description: 'Leave requests, leave type, submitted date, and status.',
      count: leaveRows.length,
      accent: 'bg-violet-50 text-violet-700',
      download: () => downloadCsv('leave-applications-report.csv', ['Request ID', 'Employee', 'Leave Type', 'Date', 'Status'], leaveRows.map(row => [row.id, row.employee, row.type, row.date, row.status]))
    },
    {
      title: 'Travel Orders Report',
      description: 'Official travel requests, purpose, date, and approval status.',
      count: travelRows.length,
      accent: 'bg-blue-50 text-blue-700',
      download: () => downloadCsv('travel-orders-report.csv', ['Request ID', 'Employee', 'Purpose', 'Date', 'Status'], travelRows.map(row => [row.id, row.employee, row.purpose, row.date, row.status]))
    },
    {
      title: 'Employee Masterlist',
      description: 'Registered employee names, IDs, offices, and account status.',
      count: employees.length,
      accent: 'bg-emerald-50 text-emerald-700',
      download: () => downloadCsv('employee-masterlist.csv', ['Name', 'Employee ID', 'Email', 'Office', 'Account Status'], employees.map(employee => [employee.name, employee.employeeId, employee.email, employee.office, employee.accountStatus]))
    }
  ];

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'dtr', label: 'DTR' },
    { id: 'leaves', label: 'Leaves' },
    { id: 'travel', label: 'Travel Orders' },
    { id: 'reports', label: 'Reports' }
  ];

  return (
    <div className="space-y-6 p-1 sm:p-2">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-4">
        <p className="text-sm text-slate-500">
          Centralized records for attendance, monthly performance, leave applications, approved leaves, travel orders, and DTR review.
        </p>

        <div className="relative w-full max-w-lg">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => { setSearchQuery(event.target.value); setShownCount(PAGE_SIZE); }}
            placeholder="Search employee, date, month, or status..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => openTab(tab.id)}
              className={`rounded-xl border px-3 py-2 text-[11px] font-black transition ${
                activeTab === tab.id
                  ? 'border-indigo-700 bg-indigo-700 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <OlderAttendanceLoader from={attendanceFrom} loadedMonths={loadedAttendanceMonths} onLoadMonth={onLoadAttendanceMonth} />
      </header>

      {activeTab === 'overview' && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={CheckCircle2} label="Presents" value={presentCount} hint="Employees with valid attendance" accentClass="bg-emerald-50 text-emerald-600" />
            <StatCard icon={AlarmClockCheck} label="Late / Tardiness" value={lateCount} hint="Detected late and tardy entries" accentClass="bg-amber-50 text-amber-600" />
            <StatCard icon={CalendarDays} label="Leave Records" value={`${approvedLeaves.length}/${leaveApplications.length}`} hint="Approved / total applications" accentClass="bg-violet-50 text-violet-600" />
            <StatCard icon={Plane} label="Travel Orders" value={`${approvedTravel.length}/${travelOrders.length}`} hint="Approved / total orders" accentClass="bg-blue-50 text-blue-600" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Daily Time Record (DTR)</h3>
                    <p className="text-xs text-slate-500">Attendance compliance log</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
                  {verifiedDtr} verified
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <th className="px-3 py-2 font-black uppercase tracking-wide">Employee</th>
                      <th className="px-3 py-2 font-black uppercase tracking-wide">Date</th>
                      <th className="px-3 py-2 font-black uppercase tracking-wide">Time In</th>
                      <th className="px-3 py-2 font-black uppercase tracking-wide">Time Out</th>
                      <th className="px-3 py-2 font-black uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dtrTable.slice(0, 8).map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 last:border-none">
                        <td className="px-3 py-3 font-bold text-slate-800">{row.employee}</td>
                        <td className="px-3 py-3 text-slate-600">{row.date}</td>
                        <td className="px-3 py-3 text-slate-600">{row.timeIn}</td>
                        <td className="px-3 py-3 text-slate-600">{row.timeOut}</td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-black ${row.status === 'Absent' ? 'bg-rose-50 text-rose-700' : row.late === 'Late' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                            {row.status === 'Absent' ? 'Absent' : row.late === 'Late' ? 'Late' : 'Present'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {dtrTable.length > 8 && (
                <button type="button" onClick={() => openTab('dtr')} className="mt-3 text-xs font-black text-indigo-700">
                  View all {dtrTable.length} DTR records
                </button>
              )}
            </section>

            <aside className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Attendance Status</h3>
                  </div>
                </div>
                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex items-center justify-between"><span className="text-slate-600">Present</span><strong className="text-slate-900">{presentCount}</strong></div>
                  <div className="flex items-center justify-between"><span className="text-slate-600">Late / Tardy</span><strong className="text-slate-900">{lateCount}</strong></div>
                  <div className="flex items-center justify-between"><span className="text-slate-600">Absent</span><strong className="text-slate-900">{absentCount}</strong></div>
                  <div className="flex items-center justify-between"><span className="text-slate-600">Employees</span><strong className="text-slate-900">{totalEmployees}</strong></div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Leave & Travel Summary</h3>
                  </div>
                </div>
                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex items-center justify-between"><span className="text-slate-600">Applications</span><strong className="text-slate-900">{leaveApplications.length}</strong></div>
                  <div className="flex items-center justify-between"><span className="text-slate-600">Approved Leave</span><strong className="text-slate-900">{approvedLeaves.length}</strong></div>
                  <div className="flex items-center justify-between"><span className="text-slate-600">Pending Leave</span><strong className="text-slate-900">{pendingLeaves.length}</strong></div>
                  <div className="flex items-center justify-between"><span className="text-slate-600">Travel Orders</span><strong className="text-slate-900">{travelOrders.length}</strong></div>
                  <div className="flex items-center justify-between"><span className="text-slate-600">Approved Travel</span><strong className="text-slate-900">{approvedTravel.length}</strong></div>
                </div>
              </div>
            </aside>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Record Status Overview</h3>
                <p className="text-xs text-slate-500">Live summary of attendance, leave, and official travel records.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span className="text-base font-black text-emerald-700">Presents</span>
                </div>
                <p className="mt-3 text-2xl font-black text-slate-900">{presentCount}</p>
                <p className="text-xs text-slate-600">Validated attendance today</p>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-3">
                  <AlarmClockCheck className="h-5 w-5 text-amber-600" />
                  <span className="text-base font-black text-amber-700">Late / Tardy</span>
                </div>
                <p className="mt-3 text-2xl font-black text-slate-900">{lateCount}</p>
                <p className="text-xs text-slate-600">Attendance issues needing follow-up</p>
              </div>

              <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-5 w-5 text-violet-600" />
                  <span className="text-base font-black text-violet-700">Leave & Travel</span>
                </div>
                <p className="mt-3 text-2xl font-black text-slate-900">{approvedLeaves.length + approvedTravel.length}</p>
                <p className="text-xs text-slate-600">Approved entries in the system</p>
              </div>
            </div>
          </section>
        </>
      )}

      {activeTab === 'dtr' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-indigo-600">DTR Repository</p>
              <h3 className="mt-2 text-xl font-black text-slate-900">Daily Time Record (DTR)</h3>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">{normalizedQuery ? `${dtrTable.length} of ${attendanceHistory.length}` : attendanceHistory.length} total records</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Employee</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Date</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Time In</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Time Out</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Status</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Late</th>
                </tr>
              </thead>
              <tbody>
                {dtrTable.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-3 py-8 text-center text-sm font-semibold text-slate-500">
                      No matching DTR records found.
                    </td>
                  </tr>
                ) : (
                  dtrTable.slice(0, shownCount).map((record) => (
                    <tr key={record.id || `${record.employee}-${record.date}`} className="border-b border-slate-100 last:border-none">
                      <td className="px-3 py-3 font-bold text-slate-800">{record.employee}</td>
                      <td className="px-3 py-3 text-slate-600">{record.date}</td>
                      <td className="px-3 py-3 text-slate-600">{record.timeIn}</td>
                      <td className="px-3 py-3 text-slate-600">{record.timeOut}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-black ${record.status === 'Absent' ? 'bg-rose-50 text-rose-700' : record.status === 'Late' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                          {record.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{record.late === 'Late' ? 'Yes' : 'No'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <ShowMore shown={shownCount} total={dtrTable.length} onMore={showMore} />
        </section>
      )}

      {activeTab === 'leaves' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-violet-600">Leave Registry</p>
              <h3 className="mt-2 text-xl font-black text-slate-900">Leave Applications & Approved Leaves</h3>
            </div>
            <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">{normalizedQuery ? `${leaveRows.length} of ${leaveApplications.length}` : leaveApplications.length} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Request ID</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Employee</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Type</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Date</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {leaveRows.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-3 py-8 text-center text-sm font-semibold text-slate-500">
                      No matching leave records found.
                    </td>
                  </tr>
                ) : (
                  leaveRows.slice(0, shownCount).map((record) => (
                    <tr key={record.id} className="border-b border-slate-100 last:border-none">
                      <td className="px-3 py-3 font-bold text-slate-800">{record.id}</td>
                      <td className="px-3 py-3 text-slate-700">{record.employee}</td>
                      <td className="px-3 py-3 text-slate-600">{record.type}</td>
                      <td className="px-3 py-3 text-slate-600">{record.date}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-black ${record.status === 'Approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {record.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <ShowMore shown={shownCount} total={leaveRows.length} onMore={showMore} />
        </section>
      )}

      {activeTab === 'travel' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-600">Travel Registry</p>
              <h3 className="mt-2 text-xl font-black text-slate-900">Travel Order Records</h3>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{normalizedQuery ? `${travelRows.length} of ${travelOrders.length}` : travelOrders.length} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Request ID</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Employee</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Purpose</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Date</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {travelRows.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-3 py-8 text-center text-sm font-semibold text-slate-500">
                      No matching travel records found.
                    </td>
                  </tr>
                ) : (
                  travelRows.slice(0, shownCount).map((record) => (
                    <tr key={record.id} className="border-b border-slate-100 last:border-none">
                      <td className="px-3 py-3 font-bold text-slate-800">{record.id}</td>
                      <td className="px-3 py-3 text-slate-700">{record.employee}</td>
                      <td className="px-3 py-3 text-slate-600">{record.purpose}</td>
                      <td className="px-3 py-3 text-slate-600">{record.date}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-black ${record.status === 'Approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {record.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <ShowMore shown={shownCount} total={travelRows.length} onMore={showMore} />
        </section>
      )}

      {activeTab === 'reports' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-indigo-600">HR/Admin Reports</p>
            <h3 className="mt-2 text-xl font-black text-slate-900">Records Reports</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">Each report has every matching record{normalizedQuery ? ` (only those matching “${searchQuery.trim()}”)` : ''}. The employee masterlist always has every account.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {reportCards.map(report => (
              <article key={report.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${report.accent}`}><FileText className="h-5 w-5" /></div>
                  <span className="text-2xl font-black text-slate-900">{report.count}</span>
                </div>
                <h4 className="mt-4 text-sm font-black text-slate-900">{report.title}</h4>
                <p className="mt-1 text-xs leading-5 text-slate-500">{report.description}</p>
                <button type="button" onClick={report.download} className="mt-4 rounded-lg bg-indigo-700 px-3 py-2 text-xs font-black text-white hover:bg-indigo-800">Download CSV</button>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
