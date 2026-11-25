import { DILG_OFFICE_GROUPS } from '../../shared/dilgAssignments.js';
import { OFFICE_HOURS } from '../../shared/officeHours.js';
import { holidaysFor } from '../../shared/phHolidays.js';
import { earnsLeaveCredits } from '../../shared/profileFields.js';
import { inServiceSince } from '../../shared/separation.js';
import { matchesAttendanceEmployee } from './attendanceIdentity.js';
import { dtrDayLogs, isRestDate, isRestDay, logsSchedule } from './dtrDay.js';
import { dtrEntry } from './dtrMonth.js';
import { absentDays, dtrTimeOut, recordsForEmployees } from './hrAttendance.js';

// DILG Marinduque's monthly Consolidated Report of Attendance based on CS Form 48 (the DTR), as
// the office makes it in its own template (src/assets/template): one row per organic employee
// with the days of vacation and sick leave, each day's tardiness and undertime, the half days
// missed, and the other leave in the remarks, then the number of personnel.

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "October 2026" for '2026-10'.
export const monthText = month => {
  const [year, number] = String(month || '').split('-').map(Number);
  return MONTH_NAMES[number - 1] ? `${MONTH_NAMES[number - 1]} ${year}` : '';
};

const monthDays = month => {
  const [year, number] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return Array.from({ length: last }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
};

const clean = value => String(value ?? '').trim();
const dayOf = date => Number(String(date).slice(8, 10));

// The days of the month of these dates, as the report writes them: "3-6, 10, 13-14".
export const dayList = dates => {
  const runs = [];
  for (const day of [...new Set(dates.map(dayOf))].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1];
    if (last && day === last[1] + 1) last[1] = day;
    else runs.push([day, day]);
  }
  return runs.map(([first, last]) => (first === last ? String(first) : `${first}-${last}`)).join(', ');
};

// "Buenaventura, Daryl A.": last name, first name, and middle initial, when the name parts are
// saved; else the full name.
export const reportName = person => {
  const last = clean(person?.lastName);
  const first = clean(person?.firstName);
  if (!last || !first) return clean(person?.name) || 'Unnamed employee';
  const initial = clean(person.middleName).charAt(0).toUpperCase();
  const suffix = clean(person.suffix);
  return `${last}, ${first}${initial ? ` ${initial}.` : ''}${suffix ? ` ${suffix}` : ''}`;
};

// The position title, with the designation when the title does not already say it.
const positionOf = person => {
  const role = clean(person?.role);
  const designation = clean(person?.designation);
  return designation && !role.toLowerCase().includes(designation.toLowerCase())
    ? [role, designation].filter(Boolean).join(' / ')
    : role;
};

const PROVINCIAL_OFFICES = DILG_OFFICE_GROUPS.find(group => group.label === 'Provincial Office')?.offices || [];

// Where the employee works, as the report names it: "Provincial Office" for its sections and
// units, and "DILG-Gasan" for the MLGOO of a town.
export const stationOf = person => {
  const office = clean(person?.office);
  if (PROVINCIAL_OFFICES.includes(office)) return 'Provincial Office';
  const town = /^Office of the MLGOO - (.+)$/.exec(office)?.[1];
  if (town) return `DILG-${town === 'Santa Cruz' ? 'Sta. Cruz' : town}`;
  return clean(person?.assignedStation) || office;
};

// The Provincial Director's name for the report's signature, from WorkMate's accounts (`accounts`:
// supervisor, HR, and employee accounts): the active account whose position title is Provincial
// Director (not the Assistant Provincial Director), or '' when there is none.
export const provincialDirectorName = (accounts = []) => {
  const director = accounts.find(account => /^provincial director\b/i.test(clean(account?.role))
    && clean(account?.accountStatus || 'Active').toLowerCase() === 'active');
  return director ? clean(director.name) : '';
};

// How the report's remarks name a leave type. CTO is filed as "Others" with what it is for.
const LEAVE_LABELS = {
  'Mandatory / Forced Leave': 'MFL',
  'Special Privilege Leave': 'SPL',
  'Wellness Leave': 'WELLNESS',
  'Special Emergency (Calamity) Leave': 'CALAMITY LEAVE',
  'Special Emergency Lease': 'CALAMITY LEAVE',
  'Special Leave Benefits for Women': 'SLBW',
  '10-Day VAWC Leave': 'VAWC LEAVE'
};
export const leaveLabel = request => {
  const type = clean(request?.leaveType);
  if (type === 'Vacation Leave') return 'VL';
  if (type === 'Sick Leave') return 'SL';
  if (type === 'Others') {
    const specify = clean(request.detailsSpecify);
    return /\bCTO\b|compensatory time/i.test(specify) ? 'CTO' : (specify || 'Other leave').toUpperCase();
  }
  return LEAVE_LABELS[type] || (type || 'Leave').toUpperCase();
};

// Whether the employee was in the service on any day of the month and is organic personnel: not
// a contract of service or job order worker (CS Form 48 and leave are for government employees).
const isPersonnelOf = (person, month) => {
  const hired = clean(person?.dateHired).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(hired) && hired.slice(0, 7) > month) return false;
  return inServiceSince(person, `${month}-01`) && earnsLeaveCredits(person);
};

// One employee's row: `records` and `requests` are everyone's; `absences` the employee's days
// absent without approved leave or Travel Order.
const personnelRow = (person, { month, records, requests, holidays, absences }) => {
  const days = monthDays(month);
  const ownHolidays = holidaysFor(holidays, person);
  const leave = {};
  for (const request of requests) {
    if (request?.type !== 'Leave Request' || request.status !== 'Approved' || !matchesAttendanceEmployee(request, person)) continue;
    const start = String(request.startDate || '').slice(0, 10);
    const end = String(request.endDate || '').slice(0, 10) || start;
    const label = leaveLabel(request);
    for (const date of days) {
      if (date >= start && date <= end && !isRestDate(date, ownHolidays)) (leave[label] ||= []).push(date);
    }
  }

  const name = MONTH_NAMES[Number(month.slice(5, 7)) - 1];
  const tardy = [];
  const undertime = [];
  const halfDays = [];
  const ownRecords = records
    .filter(record => String(record?.date || '').startsWith(month) && matchesAttendanceEmployee(record, person))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const record of ownRecords) {
    const entry = dtrEntry(record);
    if (!entry || isRestDay(record)) continue;
    // A half day missed goes under HALF DAY, so tardiness and undertime leave its minutes out.
    const logs = dtrDayLogs({ ...record, timeOut: dtrTimeOut(record) });
    const { lateAfter, end } = logsSchedule(logs, record.date);
    const late = entry.late - (logs.missedHalf === 'Morning' ? OFFICE_HOURS.noon - lateAfter : 0);
    const early = entry.early - (logs.missedHalf === 'Afternoon' ? end - OFFICE_HOURS.pmStart : 0);
    if (late > 0) tardy.push(`${late} min - ${name} ${dayOf(record.date)}`);
    if (early > 0) undertime.push(`${early} min - ${name} ${dayOf(record.date)}`);
    if (logs.missedHalf) halfDays.push(`${dayOf(record.date)} (${logs.missedHalf === 'Morning' ? 'AM' : 'PM'})`);
  }

  const { VL = [], SL = [], ...others } = leave;
  const remarks = Object.entries(others)
    .sort(([, a], [, b]) => a[0].localeCompare(b[0]))
    .map(([label, dates]) => `${label} - ${dayList(dates)}`);
  if (absences.length) remarks.push(`ABSENT - ${dayList(absences)}`);
  return {
    employeeId: person.employeeId || '',
    name: reportName(person),
    position: positionOf(person),
    station: stationOf(person),
    office: clean(person.office),
    gender: clean(person.gender),
    vl: dayList(VL),
    sl: dayList(SL),
    tardy: tardy.join('\n'),
    undertime: undertime.join('\n'),
    halfDay: halfDays.join(', '),
    remarks: remarks.join('\n'),
    absentDays: absences.length
  };
};

// The report for `month` (YYYY-MM) of the organic employees in `employees` that `include`
// keeps (the report's employee and office filters). `records` are DTR days (marked by
// markDtrDay), `requests` leave and Travel Orders, `from` the first loaded day of attendance
// (absences are counted from it), and `today` and `minutes` the time now.
export const consolidatedAttendance = ({ month, employees = [], records = [], requests = [], holidays = [], from = '', today = '', minutes = 24 * 60, include = () => true }) => {
  const personnel = employees.filter(person => isPersonnelOf(person, month) && include(person));
  const days = monthDays(month);
  const first = days[0];
  const last = days[days.length - 1];
  // Only the month's records and requests are read, which keeps the report quick with months of
  // attendance loaded. The earliest record stays for the absences: they count from the first day
  // attendance was recorded in WorkMate (see absentDays).
  const ownRecords = recordsForEmployees(records, personnel);
  const monthRecords = ownRecords.filter(record => String(record?.date || '').startsWith(month));
  const earliest = ownRecords.reduce((found, record) => (record?.date && (!found || record.date < found.date) ? record : found), null);
  const monthRequests = requests.filter(request => {
    const start = String(request?.startDate || '').slice(0, 10);
    const end = String(request?.endDate || '').slice(0, 10) || start;
    return Boolean(start) && start <= last && end >= first;
  });
  const absences = absentDays({
    employees: personnel,
    records: earliest && earliest.date < first ? [earliest, ...monthRecords] : monthRecords,
    requests: monthRequests,
    holidays,
    from: [first, from].filter(Boolean).sort().pop(),
    to: last,
    today,
    minutes
  });
  const rows = personnel
    .map(person => personnelRow(person, {
      month,
      records: monthRecords,
      requests: monthRequests,
      holidays,
      absences: absences.filter(item => item.employee === person).map(item => item.date)
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((row, index) => ({ no: index + 1, ...row }));
  const male = rows.filter(row => row.gender === 'Male').length;
  const female = rows.filter(row => row.gender === 'Female').length;
  return { rows, counts: { personnel: rows.length, male, female, noGender: rows.length - male - female } };
};
