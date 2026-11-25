import { matchesAttendanceEmployee } from './attendanceIdentity.js';
import { consolidatedAttendance, monthText } from './consolidatedAttendance.js';
import { separationText } from '../../shared/separation.js';

// HR's reports: the monthly Consolidated Report of Attendance (DILG Marinduque's template, see
// consolidatedAttendance.js) and the employee masterlist, filtered by employee, month
// (attendance) or account status (masterlist), and office (department), shown on screen and
// downloaded or printed.

export const REPORT_TYPES = [
  { id: 'attendance', label: 'Attendance' },
  { id: 'masterlist', label: 'Employee Masterlist' }
];

// The masterlist is filtered by account status.
export const ACCOUNT_STATUSES = ['Active', 'Inactive', 'Pending', 'Rejected'];

// An employee's key in the employee filter: the account's own (its database ID, else its email),
// as old accounts can share the default Employee ID (DILG-2026-7689). Their records are told
// apart by the ID and the name (matchesAttendanceEmployee).
export const employeeKey = employee => String(employee?._id || employee?.email || employee?.employeeId || '');
// An employee as the filters and lists name them.
export const employeeLabel = employee => employee?.name || employee?.employeeId || employee?.email || 'Unnamed employee';

const officeOf = (item, account) => account?.office || item.employeeOffice || item.employee?.office || '';

// True when a record or account passes the employee and office filters.
// An account itself (a masterlist line) is the chosen one by its key; an attendance record, by
// its Employee ID and name.
const isFor = (item, account, { employee, office }, employees) => {
  if (employee) {
    if (employees.includes(item)) {
      if (employeeKey(item) !== employee) return false;
    } else {
      const chosen = employees.find(candidate => employeeKey(candidate) === employee);
      if (!chosen || !matchesAttendanceEmployee(item, chosen)) return false;
    }
  }
  return !office || officeOf(item, account) === office;
};

// The Consolidated Report of Attendance for the month `filters.month` (YYYY-MM).
const attendanceReport = ({ records, requests, employees, holidays, filters, from, today, minutes }) => {
  const month = filters.month || today.slice(0, 7);
  const { rows, counts } = consolidatedAttendance({
    month,
    employees,
    records,
    requests,
    holidays,
    from,
    today,
    minutes,
    include: person => isFor(person, person, filters, employees)
  });
  return {
    title: 'Consolidated Report of Attendance',
    month,
    monthLabel: monthText(month),
    counts,
    note: 'Based on the DTR (CS Form 48) and the approved leave in WorkMate. VL and SL are the days of vacation and sick leave; Remarks have the other leave (CTO, SPL, Wellness, MFL, and so on) and the days absent with no Time In and no approved leave or Travel Order. Tardy and Under Time are each day\'s minutes; a morning (AM) or afternoon (PM) missed is a Half Day. Job order and contract of service workers are not organic personnel and are not listed. Anything WorkMate does not know, such as ON TRAINING, can be typed into the downloaded Excel file. The PD signs above the name.',
    columns: [
      { key: 'no', label: 'No' },
      { key: 'name', label: 'Name' },
      { key: 'position', label: 'Position/Designation' },
      { key: 'station', label: 'Station' },
      { key: 'vl', label: 'VL' },
      { key: 'sl', label: 'SL' },
      { key: 'tardy', label: 'Tardy' },
      { key: 'undertime', label: 'Under Time' },
      { key: 'halfDay', label: 'Half Day' },
      { key: 'remarks', label: 'Remarks' }
    ],
    rows,
    summary: [
      { label: 'Organic personnel', value: counts.personnel },
      { label: 'Male', value: counts.male },
      { label: 'Female', value: counts.female },
      ...(counts.noGender ? [{ label: 'No gender on profile', value: counts.noGender }] : []),
      { label: 'Days absent', value: rows.reduce((total, row) => total + row.absentDays, 0) }
    ]
  };
};

const accountStatusText = employee => {
  const status = String(employee?.accountStatus || 'Active').trim();
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
};
// "Dela Cruz, Juan Santos Jr." when the name parts are saved, else the full name.
const listName = employee => {
  if (!employee.lastName) return employee.name || 'Unnamed employee';
  const given = [employee.firstName, employee.middleName, employee.suffix].filter(Boolean).join(' ');
  return given ? `${employee.lastName}, ${given}` : employee.lastName;
};

// Every employee account with its position, office, appointment, salary grade, date hired,
// account status, separation, and contact details, as of today. The dates do not filter it.
const masterlistReport = ({ employees, filters }) => {
  const rows = employees
    .filter(employee => isFor(employee, employee, filters, employees)
      && (!filters.status || accountStatusText(employee).toLowerCase() === filters.status.toLowerCase()))
    .map(employee => ({
      employee: listName(employee),
      employeeId: employee.employeeId || '',
      position: employee.role || '',
      designation: employee.designation || '',
      office: employee.office || '',
      division: employee.division || '',
      station: employee.assignedStation || '',
      appointment: employee.appointmentStatus || '',
      grade: [employee.salaryGrade, employee.salaryStep].filter(Boolean).join(' / '),
      salary: employee.salary || '',
      dateHired: employee.dateHired || '',
      employment: employee.employmentStatus || '',
      accountStatus: accountStatusText(employee),
      separation: separationText(employee),
      phone: employee.phoneNumber || '',
      email: employee.email || ''
    }))
    .sort((a, b) => a.employee.localeCompare(b.employee));
  const appointments = [...new Set(rows.map(row => row.appointment).filter(Boolean))].sort();
  return {
    title: 'Employee Masterlist',
    note: 'Employee accounts in WorkMate; Supervisors and HR/Admin accounts are not included. The monthly salary is the one set by the salary grade and step.',
    columns: [
      { key: 'employeeId', label: 'Employee ID' },
      { key: 'employee', label: 'Name' },
      { key: 'position', label: 'Position' },
      { key: 'designation', label: 'Designation' },
      { key: 'office', label: 'Office' },
      { key: 'division', label: 'Division / Unit' },
      { key: 'station', label: 'Station' },
      { key: 'appointment', label: 'Status of Appointment' },
      { key: 'grade', label: 'SG / Step' },
      { key: 'salary', label: 'Monthly Salary' },
      { key: 'dateHired', label: 'Date Hired' },
      { key: 'employment', label: 'Employment Status' },
      { key: 'accountStatus', label: 'Account Status' },
      { key: 'separation', label: 'Separation' },
      { key: 'phone', label: 'Mobile No.' },
      { key: 'email', label: 'Email' }
    ],
    rows,
    summary: [
      { label: 'Employees', value: rows.length },
      ...ACCOUNT_STATUSES.map(status => ({ label: status, value: rows.filter(row => row.accountStatus === status).length })),
      { label: 'Separated', value: rows.filter(row => row.separation).length },
      ...appointments.map(appointment => ({ label: appointment, value: rows.filter(row => row.appointment === appointment).length }))
    ]
  };
};

// The report of `type` ('attendance' or 'masterlist') for these filters:
// { employee (employeeKey), month (YYYY-MM, attendance), office, status (masterlist) }, any of
// them empty. `records` are DTR days, `requests` leave and Travel Orders, `from` the first loaded
// day of attendance, and `today` and `minutes` the time now (for the days absent).
export const buildReport = ({ type, records = [], requests = [], employees = [], filters = {}, holidays = [], from = '', today = '', minutes = 24 * 60 }) => {
  if (type === 'masterlist') return masterlistReport({ employees, filters });
  return attendanceReport({ records, requests, employees, holidays, filters, from, today, minutes });
};

// The filters in words, for the report's heading: the employee, the `period` (the month, or the
// day the masterlist is as of), the office, and the status when the report has one.
export const describeFilters = (filters = {}, employees = [], { period = '', status = true } = {}) => {
  const chosen = filters.employee ? employees.find(employee => employeeKey(employee) === filters.employee) : null;
  return [
    chosen ? `Employee: ${employeeLabel(chosen)}` : 'All employees',
    period,
    filters.office ? `Office: ${filters.office}` : 'All offices',
    status ? (filters.status ? `Status: ${filters.status}` : 'All statuses') : ''
  ].filter(Boolean).join(' · ');
};

// A CSV cell. Text that a spreadsheet would run as a formula (starting with =, +, -, or @)
// is kept as text.
const csvCell = value => {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// The report as CSV, which Excel and Google Sheets open. It starts with a byte order mark
// so Excel reads names with ñ correctly.
export const reportCsv = report => `﻿${[
  report.columns.map(column => csvCell(column.label)).join(','),
  ...report.rows.map(row => report.columns.map(column => csvCell(row[column.key])).join(','))
].join('\r\n')}\r\n`;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

// A printable page of the report, with its heading, filters, summary, and table.
export const reportHtml = (report, { filtersText = '', generatedAt = '', generatedBy = '' } = {}) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 24px; }
  h1 { font-size: 18px; margin: 0; } h2 { font-size: 13px; margin: 2px 0 0; font-weight: normal; color: #334155; }
  .meta { font-size: 11px; color: #475569; margin: 10px 0; }
  .summary { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 14px; }
  .summary span { border: 1px solid #cbd5e1; border-radius: 6px; padding: 4px 8px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 5px; text-align: left; vertical-align: top; }
  th { background: #e2e8f0; }
  @page { size: landscape; margin: 12mm; }
</style></head><body>
<h1>Department of the Interior and Local Government</h1>
<h2>${escapeHtml(report.title)}</h2>
<p class="meta">${escapeHtml(filtersText)}<br>Generated ${escapeHtml(generatedAt)}${generatedBy ? ` by ${escapeHtml(generatedBy)}` : ''}</p>
<div class="summary">${report.summary.map(item => `<span>${escapeHtml(item.label)}: <b>${escapeHtml(item.value)}</b></span>`).join('')}</div>
<table><thead><tr>${report.columns.map(column => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr></thead>
<tbody>${report.rows.length
    ? report.rows.map(row => `<tr>${report.columns.map(column => `<td>${escapeHtml(row[column.key])}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${report.columns.length}">No records match these filters.</td></tr>`}</tbody></table>
${report.note ? `<p class="meta">${escapeHtml(report.note)}</p>` : ''}
</body></html>`;
