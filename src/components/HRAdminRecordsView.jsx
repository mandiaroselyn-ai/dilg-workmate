import React, { useMemo, useState } from 'react';
import { getManilaDateString, getManilaMinutesOfDay } from '../../shared/localDate';
import { minutesToLeaveDays } from '../../shared/leaveConversion';
import {
  Activity,
  AlarmClockCheck,
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  Plane,
  Printer,
  Search,
  ShieldCheck,
  Users
} from 'lucide-react';
import { durationText } from '../utils/dtrDay';
import { dtrEntry } from '../utils/dtrMonth';
import { absentDays, activeEmployees, employeeDayStatus, hasSelfie, isBeforeLatestArrival, isLate, isOfflineReviewPending, isOfflineTimeOutPending, monitoringStatus, NOT_YET_IN, recordsForEmployees, totalHoursWorked } from '../utils/hrAttendance';
import { matchesAttendanceEmployee } from '../utils/attendanceIdentity';
import { employeeKey } from '../utils/reports';
import { downloadBytes } from '../utils/documentFiles';
import { dtrStatusText } from '../utils/dtrSubmission';
import { dtrSubmissionFor, makeEmployeeDtr } from '../utils/employeeDtr';
import OlderAttendanceLoader from './OlderAttendanceLoader';
import HRReportsView from './HRReportsView';
import HRDtrSubmissions from './HRDtrSubmissions';
import DocumentViewer from './DocumentViewer';

// Minutes as the DTR table shows them, such as "7 min" or "1h 05m".
const minutesCell = minutes => (minutes ? durationText(minutes) : '—');

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

// A record's status as the DTR counts it: an offline Time In or Time Out still waiting for HR,
// one HR rejected (left out of the DTR), Absent, or Late or Present by the DTR's own rule (a late
// Time In, or back from lunch after 1:00 PM).
const recordStatusOf = record => (isOfflineReviewPending(record) || isOfflineTimeOutPending(record) ? 'For HR review'
  : record.offlineTimeIn?.decision === 'rejected' ? 'Rejected (not in DTR)'
    : /absent/i.test(record.status || '') ? 'Absent'
      : isLate(record) ? 'Late' : 'Present');
const RECORD_STATUS_TONES = {
  'For HR review': 'bg-violet-50 text-violet-700',
  'Rejected (not in DTR)': 'bg-rose-50 text-rose-700',
  Absent: 'bg-rose-50 text-rose-700',
  Late: 'bg-amber-50 text-amber-700',
  Present: 'bg-emerald-50 text-emerald-700'
};
// The requests still waiting for a decision, under each of the names they go by.
const PENDING_STATUSES = ['Pending', 'Pending Review', 'For Pre-approval', 'For Supervisor'];
const requestStatusTone = status => (/^approved/i.test(status) ? 'bg-emerald-50 text-emerald-700'
  : /rejected|disapproved|cancelled|returned/i.test(status) ? 'bg-rose-50 text-rose-700'
    : 'bg-amber-50 text-amber-700');
// "2026-11-24", or "2026-11-24 – 2026-11-26" for more than one day.
const dateRange = (start, end) => (!start ? '—' : !end || end === start ? start : `${start} – ${end}`);
// Rows that open what they show: a DTR record, or a leave or travel request.
const clickableRow = onOpen => (onOpen ? {
  role: 'button',
  tabIndex: 0,
  onClick: onOpen,
  onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); } },
  className: 'cursor-pointer border-b border-slate-100 last:border-none hover:bg-indigo-50/60'
} : { className: 'border-b border-slate-100 last:border-none' });

// Requests the employee never submitted or discarded are not records (as in Reports).
const UNSUBMITTED = ['Draft', 'Cancelled'];
const DUTY_LABELS = { office: 'Office', field: 'Field', wfh: 'WFH' };
// What HR did to a record (Correct Record, Mark Verified, or an offline decision): who, when,
// and for a correction, the times it had before and the reason. Null when HR did nothing.
const hrReviewOf = record => {
  const audit = record.verificationAudit || {};
  const dayOf = value => (value ? String(value).slice(0, 10) : '');
  if (audit.correctedBy) {
    return {
      label: `Corrected by ${audit.correctedBy}${dayOf(audit.correctedAt) ? ` · ${dayOf(audit.correctedAt)}` : ''}`,
      detail: `Was: In ${audit.originalTimeIn || '—'}, Lunch ${audit.originalLunchOut || '—'}–${audit.originalLunchIn || '—'}, Out ${audit.originalTimeOut || '—'}${audit.correctionReason ? `. Reason: ${audit.correctionReason}` : ''}`
    };
  }
  if (audit.verifiedBy) return { label: `Verified by ${audit.verifiedBy}${dayOf(audit.verifiedAt) ? ` · ${dayOf(audit.verifiedAt)}` : ''}`, detail: '' };
  const offline = record.offlineTimeIn?.decision && record.offlineTimeIn;
  if (offline) return { label: `Offline Time In ${offline.decision} by ${offline.decidedBy || 'HR'}`, detail: '' };
  return null;
};
// The people a Travel Order also covers.
const companionsOf = request => (request.companions || [])
  .map(companion => companion?.name || companion?.employeeName || companion?.employeeId)
  .filter(Boolean)
  .join(', ');

// Long tables show this many rows at a time.
const PAGE_SIZE = 50;

const ShowMore = ({ shown, total, onMore }) => (total > shown ? (
  <button type="button" onClick={onMore} className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-black text-indigo-700 hover:bg-slate-50">
    Show more ({Math.min(PAGE_SIZE, total - shown)} of {total - shown} remaining)
  </button>
) : null);

export default function HRAdminRecordsView({ employees = [], attendanceHistory: allAttendance = [], requests: allRequests = [], holidays = [], attendanceFrom, loadedAttendanceMonths = [], onLoadAttendanceMonth, reportGeneratedBy = '', dtrSubmissions = [], onOpenRecord, onOpenRequest }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  // The month (YYYY-MM), office, and employee (employeeKey) the tables show; '' for all.
  const [monthFilter, setMonthFilter] = useState('');
  const [officeFilter, setOfficeFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
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
  // Before 7:00 AM on a Monday or 9:00 AM on the flexitime days, no Time In yet is Not Yet In.
  const nowMinutes = getManilaMinutesOfDay();
  const todayStatuses = staff.map(employee => monitoringStatus(
    employeeDayStatus(employee, { records: attendanceHistory, requests, date: today, holidays, today }).status,
    today, today, nowMinutes
  ));
  const lateCount = todayStatuses.filter(status => status === 'Late').length;
  const presentCount = lateCount + todayStatuses.filter(status => status === 'Present').length;
  const absentCount = todayStatuses.filter(status => status === 'Absent').length;
  const notYetInCount = todayStatuses.filter(status => status === NOT_YET_IN).length;

  // True when a record or request (or an employee's absence) is in the chosen month, office,
  // and employee; `dates` are the YYYY-MM-DD dates it covers.
  const accountOf = item => employees.find(employee => matchesAttendanceEmployee(item, employee)) || null;
  const passesFilters = (item, dates) => {
    const account = accountOf(item);
    if (employeeFilter && (!account || employeeKey(account) !== employeeFilter)) return false;
    if (officeFilter && (account?.office || item.employeeOffice || '') !== officeFilter) return false;
    return !monthFilter || dates.some(date => String(date || '').slice(0, 7) === monthFilter);
  };
  const monthOptions = [...new Set([
    ...allAttendance.map(record => String(record.date || '').slice(0, 7)),
    ...allRequests.map(request => String(request.startDate || '').slice(0, 7))
  ].filter(month => /^\d{4}-\d{2}$/.test(month)))].sort().reverse();
  const officeOptions = [...new Set(staff.map(employee => employee.office).filter(Boolean))].sort();
  const employeeOptions = [...staff].filter(employee => employeeKey(employee)).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const filtersActive = Boolean(monthFilter || officeFilter || employeeFilter);
  const clearFilters = () => {
    setMonthFilter('');
    setOfficeFilter('');
    setEmployeeFilter('');
    setShownCount(PAGE_SIZE);
  };

  // The chosen employee's DTR (CSC Form No. 48) for the chosen month, to view, print, or download.
  const [dtrViewer, setDtrViewer] = useState(null); // { key, title, load }
  const [dtrBusy, setDtrBusy] = useState(false);
  const [dtrError, setDtrError] = useState('');
  const dtrEmployee = employeeFilter ? employees.find(employee => employeeKey(employee) === employeeFilter) || null : null;
  const dtrMonthLoaded = !attendanceFrom || monthFilter >= attendanceFrom.slice(0, 7) || loadedAttendanceMonths.includes(monthFilter);
  const dtrSubmission = dtrEmployee && monthFilter ? dtrSubmissionFor(dtrSubmissions, dtrEmployee, monthFilter) : null;
  const makeDtr = () => makeEmployeeDtr({ employee: dtrEmployee, month: monthFilter, attendance: attendanceHistory, requests: allRequests, submission: dtrSubmission });
  const viewDtr = () => setDtrViewer({ key: Date.now(), title: `DTR · ${dtrEmployee?.name || 'Employee'} · ${monthFilter}`, load: makeDtr });
  const downloadDtr = async () => {
    setDtrBusy(true);
    setDtrError('');
    try {
      const file = await makeDtr();
      await downloadBytes(file.bytes, file.fileName, file.fileType);
    } catch (errorValue) {
      setDtrError(errorValue.message || 'Unable to prepare the DTR. Please try again.');
    } finally {
      setDtrBusy(false);
    }
  };
  // The Signed DTRs list follows the office and employee filters.
  const signedDtrEmployees = employees.filter(employee => (!officeFilter || employee.office === officeFilter)
    && (!employeeFilter || employeeKey(employee) === employeeFilter));

  const leaveApplications = requests.filter((request) => request.type === 'Leave Request' && !UNSUBMITTED.includes(request.status));
  const approvedLeaves = leaveApplications.filter((request) => request.status === 'Approved');
  const pendingLeaves = leaveApplications.filter((request) => PENDING_STATUSES.includes(request.status));

  const travelOrders = requests.filter((request) => request.type === 'Travel Order' && !UNSUBMITTED.includes(request.status));
  const approvedTravel = travelOrders.filter((request) => request.status === 'Approved');
  const pendingTravel = travelOrders.filter((request) => PENDING_STATUSES.includes(request.status));

  const verifiedDtr = attendanceHistory.filter((record) => hasSelfie(record) && record.fingerprintVerified).length;
  const totalEmployees = staff.length;

  const dtrTable = useMemo(
    () =>
      attendanceHistory
        .filter((record) => passesFilters(record, [record.date]))
        .filter((record) => {
          const employeeName = record.employeeName || 'Unassigned Employee';
          const rowDate = record.date || today;
          return (
            !normalizedQuery ||
            [employeeName, rowDate, record.status, record.timeIn, record.timeOut, new Date(rowDate).toLocaleString('en-US', { month: 'long' })]
              .some((value) => String(value).toLowerCase().includes(normalizedQuery))
          );
        })
        .map((record) => {
          // As the DTR counts them (none for a record the DTR leaves out).
          const dtr = dtrEntry(record);
          return {
            id: record.id || record.employeeId || record.employeeName,
            recordId: record.id || '',
            employee: record.employeeName || 'Unassigned Employee',
            date: record.date || today,
            status: recordStatusOf(record),
            // The day's four logs, in the order of CS Form 48 ('—' for a day without a lunch log,
            // such as a half day).
            timeIn: record.timeIn || '—',
            lunchOut: record.lunchOut || '—',
            lunchIn: record.lunchIn || '—',
            timeOut: record.timeOut || '—',
            hours: totalHoursWorked(record) || '—',
            duty: DUTY_LABELS[record.dutyType || record.workAssignment?.assignmentRole] || '—',
            review: hrReviewOf(record),
            lateTime: minutesCell(dtr?.late),
            undertime: minutesCell(dtr?.early),
            deduction: dtr?.undertime ? `${minutesToLeaveDays(dtr.undertime).toFixed(3)} day` : '—',
            overtime: minutesCell(dtr?.overtime)
          };
        }),
    [attendanceHistory, normalizedQuery, today, monthFilter, officeFilter, employeeFilter, employees]
  );

  const leaveRows = useMemo(
    () =>
      leaveApplications
        .filter((request) => passesFilters(request, [request.startDate, request.endDate]))
        .filter((request) => {
          const employeeName = request.employeeName || 'Unknown Employee';
          const rowDate = request.date || request.createdAt || today;
          return (
            !normalizedQuery ||
            [employeeName, rowDate, request.startDate, request.endDate, request.status, request.leaveType, new Date(request.startDate || rowDate).toLocaleString('en-US', { month: 'long' })]
              .some((value) => String(value).toLowerCase().includes(normalizedQuery))
          );
        })
        .map((request) => ({
          id: request.id || 'N/A',
          requestId: request.id || '',
          employee: request.employeeName || 'Unknown Employee',
          type: request.leaveType || 'Leave',
          dates: dateRange(request.startDate, request.endDate),
          days: request.workingDays || request.numberOfDays || '—',
          // Days charged without pay, once HR charged the leave to the credits.
          withoutPay: Number.isFinite(Number(request.creditCharge?.withoutPayDays)) ? Number(request.creditCharge.withoutPayDays) : '—',
          filed: String(request.submissionDate || request.date || request.createdAt || '').slice(0, 10) || '—',
          status: request.status || 'Pending'
        })),
    [leaveApplications, normalizedQuery, today, monthFilter, officeFilter, employeeFilter, employees]
  );

  const travelRows = useMemo(
    () =>
      travelOrders
        .filter((request) => passesFilters(request, [request.startDate, request.endDate]))
        .filter((request) => {
          const employeeName = request.employeeName || 'Unknown Employee';
          const rowDate = request.date || request.createdAt || today;
          return (
            !normalizedQuery ||
            [employeeName, rowDate, request.startDate, request.endDate, request.status, request.purpose, request.travelActivity, request.travelVenue, request.destination, new Date(request.startDate || rowDate).toLocaleString('en-US', { month: 'long' })]
              .some((value) => String(value).toLowerCase().includes(normalizedQuery))
          );
        })
        .map((request) => ({
          id: request.id || 'N/A',
          requestId: request.id || '',
          employee: request.employeeName || 'Unknown Employee',
          // Newer Travel Orders keep it as the activity; older ones as the purpose.
          purpose: request.travelActivity || request.purpose || 'Official Travel',
          destination: request.travelVenue || request.destination || '—',
          companions: companionsOf(request) || '—',
          dates: dateRange(request.startDate, request.endDate),
          status: request.status || 'Pending'
        })),
    [travelOrders, normalizedQuery, today, monthFilter, officeFilter, employeeFilter, employees]
  );

  // Every past working day an employee was absent (see absentDays), newest first.
  const todayCounted = !isBeforeLatestArrival(today, nowMinutes);
  const allAbsences = useMemo(
    () => absentDays({ employees, records: allAttendance, requests: allRequests, holidays, from: attendanceFrom || '', today, minutes: todayCounted ? 24 * 60 : 0 }),
    [employees, allAttendance, allRequests, holidays, attendanceFrom, today, todayCounted]
  );
  const absenceRows = allAbsences
    .filter(({ date, employee }) => passesFilters(employee, [date]))
    .filter(({ date, employee }) => !normalizedQuery
      || [employee.name, employee.employeeId, employee.office, date, new Date(date).toLocaleString('en-US', { month: 'long' })]
        .some(value => String(value || '').toLowerCase().includes(normalizedQuery)));
  // Absent days per employee (half days count 0.5), most first.
  const absenceTotals = Object.values(absenceRows.reduce((totals, { employee, days }) => {
    const key = employeeKey(employee) || employee.name;
    totals[key] = { employee, days: (totals[key]?.days || 0) + days };
    return totals;
  }, {})).sort((a, b) => b.days - a.days);
  const absenceDayTotal = absenceRows.reduce((total, row) => total + row.days, 0);


  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'dtr', label: 'DTR' },
    { id: 'leaves', label: 'Leaves' },
    { id: 'travel', label: 'Travel Orders' },
    { id: 'absences', label: 'Absences' },
    { id: 'reports', label: 'Reports' }
  ];

  return (
    <div className="space-y-6 p-1 sm:p-2">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-4">
        <p className="text-sm text-slate-500">
          Centralized records for attendance, monthly performance, leave applications, approved leaves, travel orders, and DTR review.
        </p>

        {/* Reports have their own filters. */}
        {activeTab !== 'reports' && <div className="relative w-full max-w-lg">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => { setSearchQuery(event.target.value); setShownCount(PAGE_SIZE); }}
            placeholder="Search employee, date, month, or status..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </div>}

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
        {/* The tables' month, office, and employee (Reports have their own filters). */}
        {activeTab !== 'reports' && (
          <div className="flex flex-wrap items-center gap-2">
            <select value={monthFilter} onChange={event => { setMonthFilter(event.target.value); setShownCount(PAGE_SIZE); }} aria-label="Month" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
              <option value="">All months</option>
              {monthOptions.map(month => <option key={month} value={month}>{new Date(`${month}-01T00:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' })}</option>)}
            </select>
            <select value={officeFilter} onChange={event => { setOfficeFilter(event.target.value); setShownCount(PAGE_SIZE); }} aria-label="Office" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
              <option value="">All offices</option>
              {officeOptions.map(office => <option key={office} value={office}>{office}</option>)}
            </select>
            <select value={employeeFilter} onChange={event => { setEmployeeFilter(event.target.value); setShownCount(PAGE_SIZE); }} aria-label="Employee" className="max-w-[14rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
              <option value="">All employees</option>
              {employeeOptions.map(employee => <option key={employeeKey(employee)} value={employeeKey(employee)}>{employee.name || employeeKey(employee)}</option>)}
            </select>
            {filtersActive && <button type="button" onClick={clearFilters} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-indigo-700">Clear filters</button>}
          </div>
        )}
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
                      <th className="px-3 py-2 font-black uppercase tracking-wide">Lunch Out</th>
                      <th className="px-3 py-2 font-black uppercase tracking-wide">Lunch In</th>
                      <th className="px-3 py-2 font-black uppercase tracking-wide">Time Out</th>
                      <th className="px-3 py-2 font-black uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dtrTable.slice(0, 8).map((row) => (
                      <tr key={row.id} {...clickableRow(row.recordId && onOpenRecord ? () => onOpenRecord({ recordId: row.recordId, date: row.date }) : null)}>
                        <td className="px-3 py-3 font-bold text-slate-800">{row.employee}</td>
                        <td className="px-3 py-3 text-slate-600">{row.date}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.timeIn}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.lunchOut}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.lunchIn}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.timeOut}</td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-black ${RECORD_STATUS_TONES[row.status]}`}>
                            {row.status}
                          </span>
                          {row.review && <span title={[row.review.label, row.review.detail].filter(Boolean).join('. ')} className="ml-1 rounded-full bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-700">{/^Corrected/.test(row.review.label) ? 'Corrected' : 'HR reviewed'}</span>}
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
                  {notYetInCount > 0 && <div className="flex items-center justify-between"><span className="text-slate-600">Not yet in</span><strong className="text-slate-900">{notYetInCount}</strong></div>}
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

          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-black text-slate-800">Print DTR (CSC Form No. 48)</p>
            {dtrEmployee && monthFilter ? (
              <>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">{dtrEmployee.name || 'Employee'} · {new Date(`${monthFilter}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                  <button type="button" onClick={viewDtr} disabled={!dtrMonthLoaded} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-700 hover:border-blue-300 disabled:opacity-50"><Printer className="h-3.5 w-3.5" />View and print</button>
                  <button type="button" onClick={downloadDtr} disabled={!dtrMonthLoaded || dtrBusy} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-700 hover:border-blue-300 disabled:opacity-50"><Download className="h-3.5 w-3.5" />{dtrBusy ? 'Preparing...' : 'Download'}</button>
                </div>
                {dtrMonthLoaded ? (
                  <p className="mt-1.5 text-[11px] font-semibold text-slate-500">{dtrSubmission ? `Signed DTR: ${dtrStatusText(dtrSubmission)}.` : 'Not signed and submitted through WorkMate yet.'}</p>
                ) : (
                  <p className="mt-1.5 text-[11px] font-semibold text-amber-800">
                    This month's attendance is not loaded yet.{' '}
                    {onLoadAttendanceMonth && <button type="button" onClick={() => onLoadAttendanceMonth(monthFilter)} className="font-black text-blue-700 underline">Load {monthFilter}</button>}
                  </p>
                )}
                {dtrError && <p role="alert" className="mt-1.5 text-[11px] font-semibold text-rose-700">{dtrError}</p>}
              </>
            ) : (
              <p className="mt-1 text-[11px] font-semibold text-slate-500">Choose a month and an employee above to view, print, or download their DTR.</p>
            )}
          </div>

          <div className="mb-4">
            <HRDtrSubmissions key={monthFilter} employees={signedDtrEmployees} submissions={dtrSubmissions} initialMonth={monthFilter} />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Employee</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Date</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Duty</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Time In</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Lunch Out</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Lunch In</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Time Out</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Hours</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Status</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Late</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Undertime</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Deduction</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Overtime</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">HR Review</th>
                </tr>
              </thead>
              <tbody>
                {dtrTable.length === 0 ? (
                  <tr>
                    <td colSpan="14" className="px-3 py-8 text-center text-sm font-semibold text-slate-500">
                      No matching DTR records found.
                    </td>
                  </tr>
                ) : (
                  dtrTable.slice(0, shownCount).map((record) => (
                    <tr key={record.id || `${record.employee}-${record.date}`} {...clickableRow(record.recordId && onOpenRecord ? () => onOpenRecord({ recordId: record.recordId, date: record.date }) : null)}>
                      <td className="px-3 py-3 font-bold text-slate-800">{record.employee}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">{record.date}</td>
                      <td className="px-3 py-3 text-slate-600">{record.duty}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">{record.timeIn}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">{record.lunchOut}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">{record.lunchIn}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">{record.timeOut}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">{record.hours}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-black ${RECORD_STATUS_TONES[record.status]}`}>
                          {record.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{record.lateTime}</td>
                      <td className="px-3 py-3 text-slate-600">{record.undertime}</td>
                      <td className="px-3 py-3 text-slate-600">{record.deduction}</td>
                      <td className="px-3 py-3 text-slate-600">{record.overtime}</td>
                      <td className="min-w-[10rem] px-3 py-3 text-slate-600">
                        {record.review ? (
                          <>
                            <span className="font-bold text-sky-700">{record.review.label}</span>
                            {record.review.detail && <span className="block text-[10px] text-slate-500">{record.review.detail}</span>}
                          </>
                        ) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <ShowMore shown={shownCount} total={dtrTable.length} onMore={showMore} />
          {dtrViewer && <DocumentViewer key={dtrViewer.key} title={dtrViewer.title} load={dtrViewer.load} onClose={() => setDtrViewer(null)} />}
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
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Inclusive Dates</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Days</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Without Pay</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Filed</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {leaveRows.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-3 py-8 text-center text-sm font-semibold text-slate-500">
                      No matching leave records found.
                    </td>
                  </tr>
                ) : (
                  leaveRows.slice(0, shownCount).map((record) => (
                    <tr key={record.id} {...clickableRow(record.requestId && onOpenRequest ? () => onOpenRequest(record.requestId) : null)}>
                      <td className="px-3 py-3 font-bold text-slate-800">{record.id}</td>
                      <td className="px-3 py-3 text-slate-700">{record.employee}</td>
                      <td className="px-3 py-3 text-slate-600">{record.type}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">{record.dates}</td>
                      <td className="px-3 py-3 text-slate-600">{record.days}</td>
                      <td className={`px-3 py-3 ${record.withoutPay > 0 ? 'font-black text-rose-700' : 'text-slate-600'}`}>{record.withoutPay}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">{record.filed}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-black ${requestStatusTone(record.status)}`}>
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
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Purpose / Activity</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Destination</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Also Included</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Travel Dates</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {travelRows.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-3 py-8 text-center text-sm font-semibold text-slate-500">
                      No matching travel records found.
                    </td>
                  </tr>
                ) : (
                  travelRows.slice(0, shownCount).map((record) => (
                    <tr key={record.id} {...clickableRow(record.requestId && onOpenRequest ? () => onOpenRequest(record.requestId) : null)}>
                      <td className="px-3 py-3 font-bold text-slate-800">{record.id}</td>
                      <td className="px-3 py-3 text-slate-700">{record.employee}</td>
                      <td className="px-3 py-3 text-slate-600">{record.purpose}</td>
                      <td className="px-3 py-3 text-slate-600">{record.destination}</td>
                      <td className="px-3 py-3 text-slate-600">{record.companions}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">{record.dates}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-black ${requestStatusTone(record.status)}`}>
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

      {activeTab === 'absences' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-600">Absence Registry</p>
              <h3 className="mt-2 text-xl font-black text-slate-900">Absent Days</h3>
              <p className="mt-1 text-xs text-slate-500">Working days with no Time In, and half days missed (a Time In from noon on, or a Time Out by 1:00 PM), with no approved leave or Travel Order. Counted from the first day attendance was recorded in WorkMate and from each employee's hiring, in the months loaded on this page.</p>
            </div>
            <span className="shrink-0 rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700">{absenceDayTotal} day{absenceDayTotal === 1 ? '' : 's'}</span>
          </div>
          {absenceTotals.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {absenceTotals.map(({ employee, days }) => (
                <span key={employeeKey(employee) || employee.name} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-800">{employee.name || employeeKey(employee)}: {days} day{days === 1 ? '' : 's'}</span>
              ))}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Date</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Employee</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Employee ID</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Office</th>
                  <th className="px-3 py-2 font-black uppercase tracking-wide">Absent</th>
                </tr>
              </thead>
              <tbody>
                {absenceRows.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-3 py-8 text-center text-sm font-semibold text-slate-500">
                      No absent days found.
                    </td>
                  </tr>
                ) : (
                  absenceRows.slice(0, shownCount).map(({ date, employee, half, record }) => (
                    <tr key={`${employeeKey(employee)}-${date}`} {...clickableRow(record?.id && onOpenRecord ? () => onOpenRecord({ recordId: record.id, date }) : null)}>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">{date}</td>
                      <td className="px-3 py-3 font-bold text-slate-800">{employee.name || 'Unnamed employee'}</td>
                      <td className="px-3 py-3 text-slate-600">{employee.employeeId || '—'}</td>
                      <td className="px-3 py-3 text-slate-600">{employee.office || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-black ${half ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
                          {half ? `${half} (half day)` : 'Whole day'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <ShowMore shown={shownCount} total={absenceRows.length} onMore={showMore} />
        </section>
      )}

      {activeTab === 'reports' && (
        <HRReportsView
          holidays={holidays}
          employees={employees}
          attendanceHistory={allAttendance}
          requests={allRequests}
          attendanceFrom={attendanceFrom}
          generatedBy={reportGeneratedBy}
        />
      )}

    </div>
  );
}
