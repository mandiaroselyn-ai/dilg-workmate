import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getManilaDateString } from '../../shared/localDate';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Filter,
  MapPin,
  RefreshCw,
  Search,
  Users,
  XCircle,
  Plane
} from 'lucide-react';
import { matchesAttendanceEmployee } from '../utils/attendanceIdentity';
import { activeEmployees, dtrIssue, employeeDayStatus, hasSelfie, recordsForEmployees } from '../utils/hrAttendance';
import { apiFetch } from '../utils/api';
import { scrollIntoContentView } from '../utils/scroll';

// Loaded only when HR opens GPS & Geofence, so the map library does not slow other screens.
const HRLiveGpsMap = lazy(() => import('./HRLiveGpsMap'));
const employeeMapKey = employee => String(employee?.employeeId || employee?.email || employee?.name || '');
// Positions about 100 m apart share a place name.
const placeKeyOf = (latitude, longitude) => `${Number(latitude).toFixed(3)},${Number(longitude).toFixed(3)}`;

const statusStyles = {
  Present: ['bg-emerald-50 text-emerald-700', CheckCircle2],
  Late: ['bg-orange-50 text-orange-700', Clock3],
  Absent: ['bg-rose-50 text-rose-700', XCircle],
  'On Leave': ['bg-violet-50 text-violet-700', CalendarDays],
  'On Travel': ['bg-blue-50 text-blue-700', Plane]
};

// The app sends an employee's phone GPS every minute while it is open; after 5 minutes
// without one (app closed, phone locked, or weak GPS) HR sees "No Live Signal".
const NO_SIGNAL_AFTER_SECONDS = 5 * 60;
const LIVE_REFRESH_MS = 30000;

const accuracyText = value => {
  const accuracy = Number(value);
  return value != null && Number.isFinite(accuracy) && accuracy > 0 ? ` · ±${Math.round(accuracy)} m` : '';
};
const clockText = iso => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });

// Where the employee was at Time In: for an open shift the live entry keeps it apart from
// the latest position; an attendance record's own position is the Time In one.
const timeInPositionOf = row => (row.live ? row.record.timeInGps : row.record) || {};

// The GPS taken at Time In, for example "Time In 08:14 AM · ±12 m".
const describeTimeInGps = row => {
  if (!row.record?.timeIn) return '-';
  const accuracy = row.live ? row.record.timeInGps?.accuracy : row.record.gpsAccuracy;
  return `Time In ${row.record.timeIn}${accuracyText(accuracy)}`;
};

// The latest GPS of an open shift, for example "2:15 PM · ±18 m".
const describeLastGps = row => (row.live && row.record.lastGpsAt
  ? `${clockText(row.record.lastGpsAt)}${accuracyText(row.record.gpsAccuracy)}`
  : '-');

const statusTextFor = row => {
  const { record } = row;
  if (row.gpsState === 'Timed Out') return `Timed out${record.timeOut ? ` at ${record.timeOut}` : ''}`;
  if (row.gpsState === 'No Live Signal') {
    const lastKnown = /in range/i.test(record.gpsStatus || '') ? 'inside' : 'outside';
    return `No live GPS since ${clockText(record.lastGpsAt)} (app closed, phone locked, or weak GPS). Last known: ${lastKnown} assigned area.`;
  }
  if (row.gpsState === 'Inside Assigned Area') return 'Inside assigned area';
  return record.leftAreaAt ? `Outside assigned area since ${clockText(record.leftAreaAt)}` : 'Outside assigned area';
};

const gpsStateStyles = {
  'Inside Assigned Area': ['bg-emerald-50 text-emerald-700', 'text-emerald-700'],
  'Outside Geofence': ['bg-rose-50 text-rose-700', 'text-rose-700'],
  'No Live Signal': ['bg-amber-50 text-amber-700', 'text-amber-700']
};
const gpsBadgeClass = state => gpsStateStyles[state]?.[0] || 'bg-slate-100 text-slate-600';
const gpsTextClass = state => gpsStateStyles[state]?.[1] || 'text-slate-700';

const SummaryCard = ({ icon: Icon, label, value, detail, color, action, onClick }) => <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-2"><div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${color}`}><Icon className="h-5 w-5" /></div><strong className="text-3xl font-black text-slate-900">{value}</strong></div><p className="mt-4 text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p><button onClick={onClick} className="mt-3 inline-flex items-center gap-1 text-xs font-black text-blue-700">{action}<ChevronRight className="h-3.5 w-3.5" /></button></article>;

export default function HRAdminAttendanceView({ employees = [], attendanceHistory = [], attendanceFrom = '', requests = [], onOpenTab }) {
  const [activeSection, setActiveSection] = useState('Monitoring');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [employeeFilter, setEmployeeFilter] = useState('All Employees');
  const [officeFilter, setOfficeFilter] = useState('All Offices');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [monitorDate, setMonitorDate] = useState(() => getManilaDateString());
  const [locationSearch, setLocationSearch] = useState('');
  const [locationStatus, setLocationStatus] = useState('All Status');
  const [lastGpsRefresh, setLastGpsRefreshText] = useState('Not refreshed');
  const [liveLocations, setLiveLocations] = useState([]);
  // When the live locations arrived, and the time now (ticking), to tell a lost signal.
  const [liveFetchedAt, setLiveFetchedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  // Place names for Time In positions, such as "Brgy. Bangbang, Gasan" ('' if unknown).
  const [placeNames, setPlaceNames] = useState({});
  const [issueSearch, setIssueSearch] = useState('');
  const [issueFilter, setIssueFilter] = useState('All Issues');
  const openDtrRecords = () => onOpenTab?.('dtr_records');
  const today = getManilaDateString();
  const refreshLiveGps = useCallback(async () => {
    setLastGpsRefreshText('Refreshing live locations...');
    try {
      const response = await apiFetch('/api/dtr/action?action=location-live');
      const result = await response.json();
      if (!response.ok || !result.success || !Array.isArray(result.locations)) {
        throw new Error(result.error || 'Unable to load live employee locations.');
      }
      setLiveLocations(result.locations);
      setLiveFetchedAt(Date.now());
      setNow(Date.now());
      setLastGpsRefreshText(new Date().toLocaleTimeString());
    } catch (error) {
      setLastGpsRefreshText(`Refresh failed: ${error.message || 'Unable to load live employee locations.'}`);
    }
  }, []);
  const setLastGpsRefresh = refreshLiveGps;

  // Live locations refresh every 30 seconds on the screens that show them, and the clock
  // ticks so an employee whose GPS stops coming turns "No Live Signal" on time.
  const showsLiveGps = activeSection === 'GPS & Geofence' || activeSection === 'Monitoring';
  useEffect(() => {
    if (!showsLiveGps) return undefined;
    const refreshIfShown = () => {
      if (!document.hidden) void refreshLiveGps();
    };
    refreshIfShown();
    const refresh = window.setInterval(refreshIfShown, LIVE_REFRESH_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 15000);
    document.addEventListener('visibilitychange', refreshIfShown);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(tick);
      document.removeEventListener('visibilitychange', refreshIfShown);
    };
  }, [showsLiveGps, refreshLiveGps]);

  // Only active employee accounts, and records and requests that belong to current
  // employees, are counted.
  const staff = activeEmployees(employees);
  const employeeHistory = recordsForEmployees(attendanceHistory, employees);
  const employeeRequests = recordsForEmployees(requests, employees);
  const records = employeeHistory.filter(record => record.date === today);
  const findEmployee = record => employees.find(employee => matchesAttendanceEmployee(record, employee));
  const statusesOn = date => staff.map(employee => ({
    employee,
    ...employeeDayStatus(employee, { records: employeeHistory, requests: employeeRequests, date })
  }));
  const todayStatuses = statusesOn(today);
  // Monitoring shows today unless HR picks an earlier day, back to the first day of the
  // loaded attendance (earlier days are in Attendance History and DTR Records).
  const isMonitoringToday = monitorDate === today;
  const monitorDateLabel = new Date(`${monitorDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const pickMonitorDate = value => setMonitorDate(!value || value > today ? today : attendanceFrom && value < attendanceFrom ? attendanceFrom : value);
  const rows = (isMonitoringToday ? todayStatuses : statusesOn(monitorDate)).map(({ employee, status, record }) => ({
    name: employee.name || 'Registered employee',
    role: employee.role || 'DILG Personnel',
    office: employee.office || record?.employeeOffice || 'Office not assigned',
    location: record?.location || '-',
    status,
    time: record?.timeIn
      ? `${record.timeIn}${record.timeOut ? ` – ${record.timeOut}` : isMonitoringToday ? ' · On duty' : ' · No Time Out'}`
      : status === 'Absent' ? 'No Time In' : status,
    profilePicture: employee.profilePicture
  }));
  const total = staff.length;
  const late = rows.filter(row => row.status === 'Late').length;
  const present = rows.filter(row => row.status === 'Present' || row.status === 'Late').length;
  const onLeave = rows.filter(row => row.status === 'On Leave' || row.status === 'On Travel').length;
  const absent = rows.filter(row => row.status === 'Absent').length;
  const recordIssues = employeeHistory
    .map(record => ({ record, issue: dtrIssue(record, today) }))
    .filter(item => item.issue);
  const dtrIssues = recordIssues.map(item => item.record);
  const noTimeInToday = todayStatuses.filter(item => item.status === 'Absent');
  const issueMissingOut = recordIssues.filter(item => item.issue === 'Missing Time Out').length;
  const issueMissingIn = noTimeInToday.length + recordIssues.filter(item => item.issue === 'Missing Time In').length;
  const issueIncomplete = recordIssues.filter(item => /Verification$/.test(item.issue)).length;
  const dtrIssueRows = [
    ...recordIssues.map(({ record, issue }, index) => ({
      id: record.id || `dtr-issue-${index + 1}`,
      employee: findEmployee(record)?.name || record.employeeName || 'Registered employee',
      employeeId: findEmployee(record)?.employeeId || record.employeeId || 'Not assigned',
      date: record.date || 'No date',
      timeIn: record.timeIn || '-',
      timeOut: record.timeOut || '-',
      issue
    })),
    ...noTimeInToday.map(({ employee }, index) => ({
      id: `no-time-in-${employee.employeeId || index}`,
      employee: employee.name || 'Registered employee',
      employeeId: employee.employeeId || 'Not assigned',
      date: today,
      timeIn: '-',
      timeOut: '-',
      issue: 'No Time In Today'
    }))
  ];
  const filteredIssueRows = dtrIssueRows.filter(issue => (issueFilter === 'All Issues' || issue.issue === issueFilter) && `${issue.employee} ${issue.employeeId} ${issue.issue} ${issue.date}`.toLowerCase().includes(issueSearch.toLowerCase()));
  // Live GPS comes from the latest phone position of each open shift (the Time In one until
  // the app sends another).
  const locationRows = staff.map(employee => {
    const attendanceRecord = records.find(item => matchesAttendanceEmployee(item, employee));
    const liveRecord = liveLocations.find(item => matchesAttendanceEmployee(item, employee));
    const record = liveRecord || attendanceRecord;
    const gpsAgeSeconds = liveRecord ? Number(liveRecord.lastGpsAgeSeconds) + Math.max(0, now - liveFetchedAt) / 1000 : null;
    const gpsState = !record ? 'Not Timed In'
      : !liveRecord && attendanceRecord?.timeOut ? 'Timed Out'
        : liveRecord && !(gpsAgeSeconds <= NO_SIGNAL_AFTER_SECONDS) ? 'No Live Signal'
          : /in range/i.test(record.gpsStatus || '') ? 'Inside Assigned Area' : 'Outside Geofence';
    return {
      employee,
      record,
      live: Boolean(liveRecord),
      gpsState,
      distance: record?.distanceToAssignmentMeters,
      verified: hasSelfie(attendanceRecord) && attendanceRecord?.fingerprintVerified ? 'Verified' : 'Not verified'
    };
  });
  const filteredLocationRows = locationRows.filter(row => (locationStatus === 'All Status' || row.gpsState === locationStatus) && `${row.employee.name || ''} ${row.employee.employeeId || ''} ${row.employee.office || ''} ${row.record?.location || ''}`.toLowerCase().includes(locationSearch.toLowerCase()));
  const insideCount = locationRows.filter(row => row.gpsState === 'Inside Assigned Area').length;
  const outsideCount = locationRows.filter(row => row.gpsState === 'Outside Geofence').length;
  const unavailableCount = locationRows.filter(row => row.gpsState === 'Not Timed In').length;
  const initials = name => name.split(' ').map(part => part[0]).join('').slice(0, 2);
  const offices = [...new Set(rows.map(row => row.office).filter(Boolean))];
  const matchesStatusFilter = row => statusFilter === 'All'
    || (statusFilter === 'Present' ? ['Present', 'Late'].includes(row.status)
      : statusFilter === 'On Leave' ? ['On Leave', 'On Travel'].includes(row.status)
        : row.status === statusFilter);
  const filteredRows = rows.filter(row => matchesStatusFilter(row) && (employeeFilter === 'All Employees' || row.name === employeeFilter) && (officeFilter === 'All Offices' || row.office === officeFilter) && `${row.name} ${row.role} ${row.office} ${row.location}`.toLowerCase().includes(search.toLowerCase()));

  const selectedLocationRow = filteredLocationRows.find(row => {
    if (!selectedEmployee) return row.live || row.gpsState !== 'Not Timed In';
    return matchesAttendanceEmployee(row.employee, selectedEmployee);
  }) || filteredLocationRows[0] || locationRows[0] || null;

  const mapTargetEmployee = selectedLocationRow?.employee || null;
  const mapRecord = selectedLocationRow?.record || null;
  // The employee's latest position, as on the map.
  const employeeCurrentLat = Number(mapRecord?.latitude ?? mapRecord?.selfieLatitude);
  const employeeCurrentLon = Number(mapRecord?.longitude ?? mapRecord?.selfieLongitude);
  const hasMapCoordinates = Number.isFinite(employeeCurrentLat) && Number.isFinite(employeeCurrentLon);

  const placeTextFor = (latitude, longitude) => {
    const key = placeKeyOf(latitude, longitude);
    return key in placeNames ? placeNames[key] || 'Place name not found' : 'Finding place name…';
  };
  // The place of an employee's latest position: its barangay from the server for an open
  // shift, or the looked-up name of the Time In position for a finished one.
  const currentPlaceOf = row => (row.live
    ? row.record.place || 'Not in a Marinduque barangay'
    : placeTextFor(row.record.latitude, row.record.longitude));
  const timeInPlaceOf = row => {
    const { latitude, longitude } = timeInPositionOf(row);
    return Number.isFinite(Number(latitude)) ? placeTextFor(latitude, longitude) : '-';
  };

  // Where an employee is on the map: their latest phone GPS, green inside their assigned
  // area, red outside it, amber when no GPS has come for 5 minutes, gray after Time Out.
  const mapPointFor = row => {
    const { record } = row;
    if (!record) return null;
    const latitude = Number(record.latitude);
    const longitude = Number(record.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const area = (row.live ? record.assignmentArea : record.assignmentSite) || null;
    const state = { 'Inside Assigned Area': 'inside', 'Outside Geofence': 'outside' }[row.gpsState] || 'done';
    if (state === 'done' && row.gpsState === 'No Live Signal') return null;
    return {
      key: employeeMapKey(row.employee),
      name: row.employee.name || 'Registered employee',
      latitude,
      longitude,
      state,
      place: currentPlaceOf(row),
      details: [
        statusTextFor(row),
        `${!row.live ? 'Place at Time In' : 'Now at'}: ${currentPlaceOf(row)}`,
        ...(row.live ? [`Last GPS: ${describeLastGps(row)}`, `Place at Time In: ${timeInPlaceOf(row)} (${describeTimeInGps(row)})`] : [describeTimeInGps(row)]),
        `Assigned: ${area?.label || record.location || 'Not recorded'}`
      ]
    };
  };
  const pickedRow = selectedEmployee ? selectedLocationRow : null;
  const livePoints = filteredLocationRows.filter(row => row.live).map(mapPointFor).filter(Boolean);
  const pickedPoint = pickedRow && !pickedRow.live ? mapPointFor(pickedRow) : null;
  const shownPoints = pickedPoint ? [...livePoints, pickedPoint] : livePoints;
  // The map redraws only when what it shows changes, so an open popup is not closed by
  // unrelated updates such as typing in the search box.
  const mapPointsKey = JSON.stringify(shownPoints);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mapPoints = useMemo(() => shownPoints, [mapPointsKey]);
  // Looks up the names of Time In positions that are not known yet, one at a time.
  const shownRows = [...filteredLocationRows.filter(row => row.live), ...(pickedRow && !pickedRow.live ? [pickedRow] : [])];
  const missingPlaceKeys = [...new Set(shownRows
    .map(row => timeInPositionOf(row))
    .filter(position => Number.isFinite(Number(position.latitude)) && Number.isFinite(Number(position.longitude)))
    .map(position => placeKeyOf(position.latitude, position.longitude)))]
    .filter(key => !(key in placeNames))
    .join('|');
  useEffect(() => {
    if (!missingPlaceKeys) return undefined;
    let cancelled = false;
    const [key] = missingPlaceKeys.split('|');
    const [lat, lon] = key.split(',');
    apiFetch(`/api/dtr/action?action=place-name&lat=${lat}&lon=${lon}`)
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        return response.ok && data.success ? data.place || '' : '';
      })
      .catch(() => '')
      .then(place => {
        if (!cancelled) setPlaceNames(current => ({ ...current, [key]: place }));
      });
    return () => {
      cancelled = true;
    };
  }, [missingPlaceKeys]);
  const pickedKey = pickedRow ? employeeMapKey(pickedRow.employee) : null;
  const selectedMapKey = pickedKey && shownPoints.some(point => point.key === pickedKey) ? pickedKey : null;
  // Picking someone in the list shows them on the map, scrolled into view.
  const mapCardRef = useRef(null);
  const showOnMap = employee => {
    setSelectedEmployee(employee);
    scrollIntoContentView(mapCardRef.current);
  };
  const selectMapPoint = key => {
    const row = locationRows.find(item => employeeMapKey(item.employee) === key);
    if (row) setSelectedEmployee(row.employee);
  };

  return <div className="w-full min-w-0 space-y-5 overflow-x-hidden pb-24 sm:pb-0">
    <div className="flex min-w-0 gap-5 overflow-x-auto border-b border-slate-200 text-sm font-black text-slate-500"><div className="flex min-w-max gap-5">{['Monitoring', 'DTR Records', 'DTR Issues', 'GPS & Geofence', 'History'].map(tab => <button key={tab} onClick={() => tab === 'DTR Records' ? openDtrRecords() : tab === 'History' ? onOpenTab?.('attendance_history') : setActiveSection(tab)} className={`whitespace-nowrap border-b-2 px-1 pb-3 ${activeSection === tab ? 'border-blue-600 text-blue-700' : 'border-transparent hover:text-slate-800'}`}>{tab}</button>)}</div></div>
    {activeSection === 'Monitoring' && <>
      <div className="grid grid-cols-3 gap-2"><label className="flex min-w-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-xs font-bold text-slate-700 shadow-sm sm:px-4 sm:py-3 sm:text-sm"><Users className="h-3.5 w-3.5 shrink-0 text-slate-500 sm:h-4 sm:w-4" /><select value={employeeFilter} onChange={event => setEmployeeFilter(event.target.value)} className="min-w-0 flex-1 bg-transparent outline-none"><option>All Employees</option>{rows.map(row => <option key={row.name}>{row.name}</option>)}</select></label><label className="flex min-w-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-xs font-bold text-slate-700 shadow-sm sm:px-4 sm:py-3 sm:text-sm"><CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-500 sm:h-4 sm:w-4" /><input type="date" value={monitorDate} min={attendanceFrom || undefined} max={today} onChange={event => pickMonitorDate(event.target.value)} aria-label="Attendance date" className="min-w-0 flex-1 bg-transparent outline-none" /></label><label className="flex min-w-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-xs font-bold text-slate-700 shadow-sm sm:px-4 sm:py-3 sm:text-sm"><Building2 className="h-3.5 w-3.5 shrink-0 text-slate-500 sm:h-4 sm:w-4" /><select value={officeFilter} onChange={event => setOfficeFilter(event.target.value)} className="min-w-0 flex-1 bg-transparent outline-none"><option>All Offices</option>{offices.map(office => <option key={office}>{office}</option>)}</select></label></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><SummaryCard icon={CheckCircle2} label={isMonitoringToday ? 'Present Today' : 'Present'} value={present} detail={`${total ? ((present / total) * 100).toFixed(1) : '0.0'}% of employees`} action="View Attendance" color="bg-emerald-50 text-emerald-600" onClick={openDtrRecords} /><SummaryCard icon={XCircle} label={isMonitoringToday ? 'Absent Today' : 'Absent'} value={absent} detail={`${total ? ((absent / total) * 100).toFixed(1) : '0.0'}% of employees`} action="View Records" color="bg-rose-50 text-rose-600" onClick={openDtrRecords} /><SummaryCard icon={Clock3} label={isMonitoringToday ? 'Late Today' : 'Late'} value={late} detail={`${total ? ((late / total) * 100).toFixed(1) : '0.0'}% of employees`} action="View Late" color="bg-amber-50 text-amber-600" onClick={openDtrRecords} /><SummaryCard icon={AlertCircle} label="DTR Issues" value={dtrIssues.length} detail="Need your review" action="View All" color="bg-amber-50 text-amber-600" onClick={() => setActiveSection('DTR Issues')} /></div>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-lg font-black text-slate-900">{isMonitoringToday ? 'Live Attendance Monitoring' : `Attendance on ${monitorDateLabel}`}</h2><button onClick={openDtrRecords} className="text-xs font-black text-blue-700">View All <ArrowRight className="inline h-3 w-3" /></button></div><div className="mt-4 flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search employee..." className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none" /></div><button type="button" onClick={() => { setSearch(''); setEmployeeFilter('All Employees'); setOfficeFilter('All Offices'); setStatusFilter('All'); setMonitorDate(today); }} className="rounded-xl border border-slate-200 px-3 text-slate-600" title="Reset attendance filters"><Filter className="h-5 w-5" /></button></div><div className="mt-3 flex gap-2 overflow-x-auto pb-1">{[['All', total], ['Present', present], ['Late', late], ['Absent', absent], ['On Leave', onLeave]].map(([label, count]) => <button key={label} onClick={() => setStatusFilter(label)} className={`whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-black ${statusFilter === label ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'}`}>{label} ({count})</button>)}</div><div className="mt-3 space-y-2">{filteredRows.map((row, index) => { const [badge, Icon] = statusStyles[row.status] || statusStyles.Present; return <div key={`${row.name}-${index}`} onClick={() => setSelectedEmployee(row)} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 hover:border-blue-300"><div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-black text-slate-500">{row.profilePicture ? <img src={row.profilePicture} alt="" className="h-full w-full object-cover" /> : initials(row.name)}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-800">{row.name}</p><p className="truncate text-xs font-semibold text-slate-600">{row.role}</p><p className="truncate text-xs text-slate-500">{row.office} · {row.location}</p></div><div className="shrink-0 text-right"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-black ${badge}`}><Icon className="h-3 w-3" />{row.status.toUpperCase()}</span><p className="mt-1 text-xs font-black text-slate-700">{row.time}</p></div><ChevronRight className="h-5 w-5 shrink-0 text-slate-500" /></div>; })}</div>{selectedEmployee && <div className="mt-3 flex items-center justify-between rounded-xl bg-blue-50 p-3 text-xs"><div><strong className="block text-blue-900">{selectedEmployee.name}</strong><span className="text-blue-700">{selectedEmployee.status} · {selectedEmployee.time} · {selectedEmployee.location}</span></div><button type="button" onClick={() => setSelectedEmployee(null)} className="font-black text-blue-700">Close</button></div>}</section>
      <div className="grid grid-cols-2 gap-2 sm:gap-4"><section className="rounded-2xl border border-amber-200 bg-white p-3 shadow-sm sm:p-4"><div className="flex items-center justify-between"><h2 className="text-xs font-black text-slate-900 sm:text-sm">DTR Issues</h2><AlertCircle className="h-4 w-4 text-amber-500 sm:h-5 sm:w-5" /></div><div className="mt-3 space-y-2 text-xs sm:mt-4 sm:space-y-3 sm:text-sm"><div className="flex justify-between gap-1"><span>Missing Time Out</span><strong className="text-rose-600">{issueMissingOut}</strong></div><div className="flex justify-between gap-1"><span>Missing Time In</span><strong className="text-orange-600">{issueMissingIn}</strong></div><div className="flex justify-between gap-1"><span>Incomplete Records</span><strong className="text-amber-600">{issueIncomplete}</strong></div></div><button onClick={() => setActiveSection('DTR Issues')} className="mt-3 w-full rounded-xl bg-rose-50 px-2 py-2.5 text-xs font-black text-rose-600 sm:mt-4 sm:px-3 sm:py-3 sm:text-xs">Review DTR Issues <ChevronRight className="inline h-3 w-3 sm:h-4 sm:w-4" /></button></section><section className="rounded-2xl border border-emerald-200 bg-white p-3 shadow-sm sm:p-4"><div className="flex items-center justify-between"><h2 className="text-xs font-black text-slate-900 sm:text-sm">Geofence Status</h2><MapPin className="h-4 w-4 text-emerald-600 sm:h-5 sm:w-5" /></div><div className="mt-3 space-y-2 text-xs sm:mt-4 sm:space-y-3 sm:text-sm"><div className="flex justify-between gap-1"><span>Inside Assigned Area</span><strong className="text-emerald-600">{insideCount}</strong></div><div className="flex justify-between gap-1"><span>Outside Geofence</span><strong className="text-rose-600">{outsideCount}</strong></div><div className="flex justify-between gap-1"><span>Not Timed In</span><strong className="text-slate-500">{unavailableCount}</strong></div></div><button onClick={() => setActiveSection('GPS & Geofence')} className="mt-3 w-full rounded-xl bg-emerald-50 px-2 py-2.5 text-xs font-black text-emerald-600 sm:mt-4 sm:px-3 sm:py-3 sm:text-xs">View Geofence Monitoring <ChevronRight className="inline h-3 w-3 sm:h-4 sm:w-4" /></button></section></div>
    </>}
    {activeSection === 'DTR Issues' && <section className="space-y-4"><div className="grid grid-cols-3 gap-2"><div className="rounded-2xl border border-orange-200 bg-white p-3 text-center shadow-sm"><Clock3 className="mx-auto h-5 w-5 text-orange-600" /><strong className="mt-2 block text-xl text-orange-600">{issueMissingOut}</strong><span className="text-xs font-bold text-slate-500">Missing Time Out</span></div><div className="rounded-2xl border border-blue-200 bg-white p-3 text-center shadow-sm"><Clock3 className="mx-auto h-5 w-5 text-blue-600" /><strong className="mt-2 block text-xl text-blue-600">{issueMissingIn}</strong><span className="text-xs font-bold text-slate-500">Missing Time In</span></div><div className="rounded-2xl border border-amber-200 bg-white p-3 text-center shadow-sm"><AlertCircle className="mx-auto h-5 w-5 text-amber-600" /><strong className="mt-2 block text-xl text-amber-600">{issueIncomplete}</strong><span className="text-xs font-bold text-slate-500">Incomplete Records</span></div></div><section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 pb-3"><div><h3 className="text-sm font-black text-slate-900">Records Needing Attention</h3><p className="mt-1 text-xs font-semibold text-slate-500">{dtrIssueRows.length} Total</p></div><button onClick={() => setActiveSection('Monitoring')} className="text-xs font-black text-blue-700">Back to Monitoring</button></div><div className="mt-4 flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input value={issueSearch} onChange={event => setIssueSearch(event.target.value)} placeholder="Search employee..." className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none" /></div><select value={issueFilter} onChange={event => setIssueFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600"><option>All Issues</option><option>Missing Time Out</option><option>Missing Time In</option><option>Missing Selfie Verification</option><option>Missing Biometric Verification</option><option>No Time In Today</option></select></div>{filteredIssueRows.length > 0 ? <div className="mt-4 space-y-3">{filteredIssueRows.map(issue => <article key={issue.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-800">{issue.employee}</p><p className="mt-1 text-xs text-slate-500">Employee ID: {issue.employeeId}</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">Needs Attention</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500"><span>Issue: <strong className="text-slate-700">{issue.issue}</strong></span><span>Date: <strong className="text-slate-700">{issue.date}</strong></span><span>Time In: <strong className="text-slate-700">{issue.timeIn}</strong></span><span>Time Out: <strong className="text-slate-700">{issue.timeOut}</strong></span></div><button onClick={openDtrRecords} className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">View DTR <ChevronRight className="inline h-3 w-3" /></button></article>)}</div> : <div className="mt-5 rounded-xl bg-emerald-50 p-6 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" /><p className="mt-3 text-sm font-black text-emerald-800">No DTR issues found</p><p className="mt-1 text-xs font-semibold text-emerald-700">All registered employees have complete attendance records.</p></div>}</section></section>}
    {activeSection === 'GPS & Geofence' && <section className="space-y-4"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-2xl border border-emerald-200 bg-white p-3 text-center shadow-sm"><MapPin className="mx-auto h-5 w-5 text-emerald-600" /><strong className="mt-2 block text-xl text-emerald-600">{insideCount}</strong><span className="text-xs font-bold text-slate-500">Inside Assigned Area</span></div><div className="rounded-2xl border border-rose-200 bg-white p-3 text-center shadow-sm"><MapPin className="mx-auto h-5 w-5 text-rose-600" /><strong className="mt-2 block text-xl text-rose-600">{outsideCount}</strong><span className="text-xs font-bold text-slate-500">Outside Geofence</span></div><div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm"><MapPin className="mx-auto h-5 w-5 text-slate-500" /><strong className="mt-2 block text-xl text-slate-600">{unavailableCount}</strong><span className="text-xs font-bold text-slate-500">Not Timed In</span></div></div><div ref={mapCardRef} className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h3 className="text-lg font-black text-slate-900">Live GPS Map</h3><p className="mt-1 text-xs text-slate-500">{mapTargetEmployee ? `${mapTargetEmployee.name || 'Employee'} · ${mapTargetEmployee.office || 'Assigned station'}` : 'Employee tracking map'}</p></div>{selectedEmployee && <button type="button" onClick={() => setSelectedEmployee(null)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-700">Show everyone</button>}</div><div className="mt-4"><Suspense fallback={<div className="flex h-[55vh] min-h-[22rem] items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-500 sm:h-[70vh]">Loading map…</div>}><HRLiveGpsMap points={mapPoints} selectedKey={selectedMapKey} onSelect={selectMapPoint} /></Suspense>{pickedRow && !selectedMapKey && <p className="mt-2 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">{pickedRow.employee.name || 'This employee'} has no location to show today because they have not timed in.</p>}</div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Employee</p><p className="mt-1 text-sm font-black text-slate-800">{mapTargetEmployee?.name || 'Not assigned'}</p></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-black uppercase tracking-wide text-slate-500">{selectedLocationRow?.live ? 'Latest GPS' : 'GPS'}</p><p className="mt-1 text-sm font-black text-slate-800">{hasMapCoordinates ? `${employeeCurrentLat.toFixed(4)}, ${employeeCurrentLon.toFixed(4)}` : 'No GPS yet'}</p>{hasMapCoordinates && (selectedLocationRow?.live || selectedMapKey) && <p className="mt-1 text-[11px] font-semibold text-slate-600">{currentPlaceOf(selectedLocationRow)}{selectedLocationRow.live ? ` · ${describeLastGps(selectedLocationRow)}` : ''}</p>}</div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Time In GPS</p><p className="mt-1 text-sm font-black text-slate-800">{selectedLocationRow ? describeTimeInGps(selectedLocationRow) : '-'}</p></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Status</p><p className={`mt-1 text-sm font-black ${gpsTextClass(selectedLocationRow?.gpsState)}`}>{selectedLocationRow?.gpsState || 'Not Timed In'}</p>{selectedLocationRow?.record && selectedLocationRow.gpsState === 'Outside Geofence' && <p className="mt-1 text-[11px] font-semibold text-slate-600">{statusTextFor(selectedLocationRow)}</p>}</div></div></div><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-black text-slate-900">Employee Location Monitoring</h3><p className="mt-1 text-xs text-slate-500">Tap an employee to see where they are on the map.</p></div><select value={locationStatus} onChange={event => setLocationStatus(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"><option>All Status</option><option>Inside Assigned Area</option><option>Outside Geofence</option><option>Timed Out</option><option>Not Timed In</option></select></div><div className="relative mt-4"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={locationSearch} onChange={event => setLocationSearch(event.target.value)} placeholder="Search employee..." className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none" /></div><div className="mt-3 space-y-3">{filteredLocationRows.map(row => <div key={row.employee.employeeId || row.employee.email || row.employee.name} role="button" tabIndex={0} aria-pressed={pickedKey === employeeMapKey(row.employee)} onClick={() => showOnMap(row.employee)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showOnMap(row.employee); } }} className={`cursor-pointer rounded-xl border p-4 transition-colors ${pickedKey === employeeMapKey(row.employee) ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-black text-slate-500">{row.employee.profilePicture ? <img src={row.employee.profilePicture} alt="" className="h-full w-full object-cover" /> : (row.employee.name || 'RE').split(' ').map(part => part[0]).join('').slice(0, 2)}</div><div className="min-w-0 flex-1"><p className="font-black text-slate-800">{row.employee.name || 'Registered employee'}</p><p className="mt-1 text-xs text-slate-500">Employee ID: {row.employee.employeeId || row.employee.id || 'Not assigned'}</p><p className="mt-1 text-xs text-slate-500">Assigned Location: {row.employee.office || 'Not assigned'}</p><p className="text-xs text-slate-500">Time In Location: {row.record?.location || 'Not verified'}</p>{row.live && <p className="text-xs font-bold text-slate-700">Now at: {currentPlaceOf(row)}</p>}{row.live && <p className="text-xs text-slate-500">Place at Time In: {timeInPlaceOf(row)}</p>}{row.live && row.gpsState === 'Outside Geofence' && <p className={`text-xs font-semibold ${gpsTextClass(row.gpsState)}`}>{statusTextFor(row)}</p>}</div><span className={`shrink-0 rounded-full px-2 py-1 text-xs font-black ${gpsBadgeClass(row.gpsState)}`}>{row.gpsState}</span></div><div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 sm:grid-cols-4"><span>Distance: <strong className="text-slate-700">{row.distance ?? '-'} m</strong></span><span>Time In GPS: <strong className="text-slate-700">{describeTimeInGps(row)}</strong></span><span>Last GPS: <strong className="text-slate-700">{describeLastGps(row)}</strong></span><span>Last Verified: <strong className="text-slate-700">{row.verified}</strong></span></div></div>)}{filteredLocationRows.length === 0 && <div className="rounded-xl bg-slate-50 p-5 text-center text-sm font-bold text-slate-500">No registered employees match this location filter.</div>}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="font-black text-slate-900">Geofence Status</h3><p className="mt-1 text-xs text-slate-500">Assigned area: within 150 m of the assigned office, or of the assigned barangay's boundary for field work</p></div><button onClick={() => scrollIntoContentView(mapCardRef.current)} className="shrink-0 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">View Map</button></div><div className="mt-3 grid grid-cols-2 gap-3 text-center text-xs sm:grid-cols-4"><div><strong className="block text-lg text-emerald-600">{insideCount}</strong>Employees Inside</div><div><strong className="block text-lg text-rose-600">{outsideCount}</strong>Employees Outside</div><div><strong className="block text-lg text-slate-600">{unavailableCount}</strong>Not Timed In</div></div><div className="mt-3 flex gap-2"><button onClick={() => setLastGpsRefresh(new Date().toLocaleTimeString())} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 py-3 text-xs font-black text-white"><RefreshCw className="h-4 w-4" />Refresh GPS</button><button onClick={() => setActiveSection('Monitoring')} className="flex-1 rounded-xl border border-slate-200 px-3 py-3 text-xs font-black text-slate-700">Back to Monitoring</button></div><p className="mt-2 text-center text-xs text-slate-500">Last refresh: {lastGpsRefresh}</p></div></section>}
  </div>;
}
