import { minutesToLeaveDays } from '../../shared/leaveConversion.js';
import { matchesAttendanceEmployee } from './attendanceIdentity.js';
import { durationText } from './dtrDay.js';
import { dtrEntry } from './dtrMonth.js';
import { absentDays, dtrStatusOf, totalHoursWorked } from './hrAttendance.js';
import { travelDayCount } from './travelDuration.js';
import { separationText } from '../../shared/separation.js';

// HR's reports: attendance, leave, travel orders, absences, and the employee masterlist,
// filtered by employee, date range, office (department), and status, shown on screen and
// exported as CSV or printed.

export const REPORT_TYPES = [
  { id: 'attendance', label: 'Attendance' },
  { id: 'leave', label: 'Leave' },
  { id: 'travel', label: 'Travel Order' },
  { id: 'absence', label: 'Absences' },
  { id: 'masterlist', label: 'Employee Masterlist' }
];

export const ATTENDANCE_STATUSES = ['Complete', 'Late', 'Incomplete', 'On Duty'];
// The masterlist is filtered by account status.
export const ACCOUNT_STATUSES = ['Active', 'Inactive', 'Pending', 'Rejected'];
export const REQUEST_STATUSES = ['Pending', 'Pending Review', 'For Pre-approval', 'For Supervisor', 'Returned', 'Approved', 'Rejected', 'Withdrawn'];
// A draft the employee has not submitted, or one they discarded, is not a transaction.
const UNSUBMITTED = ['Draft', 'Cancelled'];
const AWAITING_DECISION = ['Pending', 'Pending Review', 'For Supervisor'];

// An employee's key in the employee filter: the account's own (its database ID, else its email),
// as old accounts can share the default Employee ID (DILG-2026-7689). Their records are told
// apart by the ID and the name (matchesAttendanceEmployee).
export const employeeKey = employee => String(employee?._id || employee?.email || employee?.employeeId || '');
// An employee as the filters and lists name them.
export const employeeLabel = employee => employee?.name || employee?.employeeId || employee?.email || 'Unnamed employee';

const accountFor = (item, employees) => employees.find(employee => matchesAttendanceEmployee(item, employee)) || null;
const nameOf = (item, account) => account?.name || item.employeeName || item.employee?.name || 'Unknown employee';
const officeOf = (item, account) => account?.office || item.employeeOffice || item.employee?.office || '';

// True when a record or request passes the employee and office filters.
// An account itself (an absence, a masterlist line) is the chosen one by its key; a record or
// request, by its Employee ID and name.
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

// True when start..end (YYYY-MM-DD; end defaults to start) overlaps from..to (either may be empty).
const overlaps = (start, end, from, to) => {
  const first = String(start || '').slice(0, 10);
  const last = String(end || '').slice(0, 10) || first;
  return Boolean(first) && (!from || last >= from) && (!to || first <= to);
};

const byDateThenName = (a, b) => String(b.sortDate).localeCompare(String(a.sortDate)) || a.employee.localeCompare(b.employee);
const countOf = (rows, status) => rows.filter(row => row.status === status).length;

const minutesCell = minutes => (minutes ? durationText(minutes) : '');
const NO_DTR_TIME = { late: 0, early: 0, undertime: 0, overtime: 0, noOrder: 0 };
const totalOf = (rows, field) => rows.reduce((total, row) => total + row.dtr[field], 0);

// The days the rows' tardiness and undertime convert to. The CSC table rounds each value, so
// each employee's month is converted as a whole, as HR charges it, and this total can differ by
// a little from adding up the days of the rows.
const deductionDays = rows => {
  const months = {};
  for (const row of rows) {
    const key = `${row.employeeId || row.employee} ${row.date.slice(0, 7)}`;
    months[key] = (months[key] || 0) + row.dtr.undertime;
  }
  return Object.values(months).reduce((total, minutes) => total + minutesToLeaveDays(minutes), 0);
};

const attendanceReport = ({ records, employees, filters, today }) => {
  const rows = records
    .map(record => ({ record, account: accountFor(record, employees) }))
    .filter(({ record, account }) => account && isFor(record, account, filters, employees)
      && overlaps(record.date, record.date, filters.from, filters.to))
    .map(({ record, account }) => {
      const dtr = dtrEntry(record) || NO_DTR_TIME;
      const { status, label, lateToo } = dtrStatusOf(record, today);
      return {
        sortDate: record.date || '',
        date: record.date || '',
        employee: nameOf(record, account),
        employeeId: account.employeeId || record.employeeId || '',
        office: officeOf(record, account),
        timeIn: record.timeIn || '',
        lunchOut: record.lunchOut || '',
        lunchIn: record.lunchIn || '',
        timeOut: record.timeOut || '',
        hours: totalHoursWorked(record),
        dtr,
        late: minutesCell(dtr.late),
        undertime: minutesCell(dtr.early),
        deduction: dtr.undertime ? minutesToLeaveDays(dtr.undertime).toFixed(3) : '',
        overtime: minutesCell(dtr.overtime),
        // `status` is what the filter and counts go by; `statusText` is what the report shows: the
        // log an incomplete record lacks, and Late when it is late too.
        status,
        lateToo,
        statusText: lateToo ? `${label}, Late` : label,
        location: record.location || ''
      };
    })
    // Late lists every late record, an incomplete or open one too.
    .filter(row => !filters.status || row.status === filters.status || (filters.status === 'Late' && row.lateToo))
    .sort(byDateThenName);
  return {
    title: 'Attendance Report',
    note: 'Late and undertime are charged to vacation leave by the CSC table (1 min = 0.002 day, 1 hour = 0.125 day), and without pay when there is no vacation leave to charge. Saturdays, Sundays, and holidays have none. Overtime is work outside office hours or on those days, within the hours of an office order: it is not deducted and cannot offset late or undertime. Work from home and days on a Travel Order earn no overtime.',
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'employee', label: 'Employee' },
      { key: 'employeeId', label: 'Employee ID' },
      { key: 'office', label: 'Office' },
      { key: 'timeIn', label: 'Time In' },
      { key: 'lunchOut', label: 'Lunch Out' },
      { key: 'lunchIn', label: 'Lunch In' },
      { key: 'timeOut', label: 'Time Out' },
      { key: 'hours', label: 'Hours' },
      { key: 'late', label: 'Late' },
      { key: 'undertime', label: 'Undertime' },
      { key: 'deduction', label: 'Deduction (day)' },
      { key: 'overtime', label: 'Overtime' },
      { key: 'statusText', label: 'Status' },
      { key: 'location', label: 'Location' }
    ],
    rows,
    summary: [
      { label: 'Records', value: rows.length },
      { label: 'Employees', value: new Set(rows.map(row => row.employeeId || row.employee)).size },
      ...ATTENDANCE_STATUSES.map(status => ({ label: status, value: status === 'Late' ? rows.filter(row => row.status === 'Late' || row.lateToo).length : countOf(rows, status) })),
      { label: 'Total late', value: durationText(totalOf(rows, 'late')) },
      { label: 'Total undertime', value: durationText(totalOf(rows, 'early')) },
      { label: 'Total deduction', value: `${deductionDays(rows).toFixed(3)} day` },
      { label: 'Total overtime', value: durationText(totalOf(rows, 'overtime')) },
      { label: 'After hours, no office order', value: durationText(totalOf(rows, 'noOrder')) }
    ]
  };
};

const requestSummary = (rows, noun, dayLabel) => [
  { label: noun, value: rows.length },
  { label: 'Approved', value: countOf(rows, 'Approved') },
  { label: 'Awaiting decision', value: rows.filter(row => AWAITING_DECISION.includes(row.status)).length },
  { label: 'Returned', value: countOf(rows, 'Returned') },
  { label: 'Rejected', value: countOf(rows, 'Rejected') },
  { label: 'Withdrawn', value: countOf(rows, 'Withdrawn') },
  { label: dayLabel, value: rows.filter(row => row.status === 'Approved').reduce((total, row) => total + (Number(row.days) || 0), 0) }
];

const requestRows = ({ requests, employees, filters, type, toRow }) => requests
  .filter(request => request.type === type && !UNSUBMITTED.includes(request.status))
  .map(request => ({ request, account: accountFor(request, employees) }))
  .filter(({ request, account }) => account && isFor(request, account, filters, employees)
    && overlaps(request.startDate, request.endDate, filters.from, filters.to)
    && (!filters.status || request.status === filters.status))
  .map(({ request, account }) => ({
    sortDate: request.startDate || '',
    id: request.id || '',
    employee: nameOf(request, account),
    employeeId: account.employeeId || request.employeeId || '',
    office: officeOf(request, account),
    startDate: request.startDate || '',
    endDate: request.endDate || request.startDate || '',
    filed: request.submissionDate || '',
    status: request.status || 'Pending',
    ...toRow(request)
  }))
  .sort(byDateThenName);

const leaveReport = ({ requests, employees, filters }) => {
  const rows = requestRows({
    requests,
    employees,
    filters,
    type: 'Leave Request',
    toRow: request => ({
      leaveType: request.leaveType || 'Leave',
      days: Number(request.workingDays) || 0,
      remarks: request.supervisorRemarks || request.remarks || ''
    })
  });
  return {
    title: 'Leave Report',
    columns: [
      { key: 'id', label: 'Request ID' },
      { key: 'employee', label: 'Employee' },
      { key: 'employeeId', label: 'Employee ID' },
      { key: 'office', label: 'Office' },
      { key: 'leaveType', label: 'Leave Type' },
      { key: 'startDate', label: 'Start Date' },
      { key: 'endDate', label: 'End Date' },
      { key: 'days', label: 'Working Days' },
      { key: 'filed', label: 'Date Filed' },
      { key: 'status', label: 'Status' },
      { key: 'remarks', label: 'Remarks' }
    ],
    rows,
    summary: requestSummary(rows, 'Applications', 'Approved leave days')
  };
};

const travelReport = ({ requests, employees, filters }) => {
  const rows = requestRows({
    requests,
    employees,
    filters,
    type: 'Travel Order',
    toRow: request => ({
      subject: request.travelActivity || String(request.purpose || '').replace(/^Official Travel\.\s*/, ''),
      destination: request.travelVenue || '',
      days: travelDayCount(request.startDate, request.endDate),
      time: request.travelTime || ''
    })
  });
  return {
    title: 'Travel Order Report',
    columns: [
      { key: 'id', label: 'Request ID' },
      { key: 'employee', label: 'Employee' },
      { key: 'employeeId', label: 'Employee ID' },
      { key: 'office', label: 'Office' },
      { key: 'subject', label: 'Subject / Purpose' },
      { key: 'destination', label: 'Destination' },
      { key: 'startDate', label: 'Activity Date' },
      { key: 'endDate', label: 'Return Date' },
      { key: 'days', label: 'Days' },
      { key: 'time', label: 'Activity Time' },
      { key: 'filed', label: 'Date Filed' },
      { key: 'status', label: 'Status' }
    ],
    rows,
    summary: requestSummary(rows, 'Travel orders', 'Approved travel days')
  };
};

// Every working day an employee was absent: no Time In, and no approved leave or Travel Order
// (see absentDays). `from` is the first loaded day of attendance, and `minutes` the time now.
const absenceReport = ({ records, requests, employees, holidays, filters, from, today, minutes }) => {
  const rows = absentDays({ employees, records, requests, holidays, from, today, minutes })
    .filter(({ date, employee }) => isFor(employee, employee, filters, employees) && overlaps(date, date, filters.from, filters.to))
    .map(({ date, employee }) => ({
      sortDate: date,
      date,
      employee: employee.name || 'Unnamed employee',
      employeeId: employee.employeeId || '',
      office: employee.office || '',
      note: 'No Time In, and no approved leave or Travel Order'
    }))
    .sort(byDateThenName);
  return {
    title: 'Absence Report',
    note: 'Working days (not Saturdays, Sundays, or holidays) with no Time In and no approved leave or Travel Order, today once its office hours end. A half day missed is not an absence: the DTR counts a missed morning as tardiness and a missed afternoon as undertime (CSC MC No. 17, s. 2010). Counted from the first day attendance was recorded in WorkMate and from each employee\'s hiring. Days before the loaded months are not included.',
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'employee', label: 'Employee' },
      { key: 'employeeId', label: 'Employee ID' },
      { key: 'office', label: 'Office' },
      { key: 'note', label: 'Remarks' }
    ],
    rows,
    summary: [
      { label: 'Absent days', value: rows.length },
      { label: 'Employees', value: new Set(rows.map(row => row.employeeId || row.employee)).size }
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

// The report of `type` ('attendance', 'leave', 'travel', 'absence', or 'masterlist') for these filters:
// { employee (employeeKey), from, to (YYYY-MM-DD), office, status }, any of them empty.
// Only records and requests of current employee accounts are included.
export const buildReport = ({ type, records = [], requests = [], employees = [], filters = {}, today = '', holidays = [], from = '', minutes = 24 * 60 }) => {
  if (type === 'masterlist') return masterlistReport({ employees, filters });
  if (type === 'absence') return absenceReport({ records, requests, employees, holidays, filters, from, today, minutes });
  if (type === 'leave') return leaveReport({ requests, employees, filters });
  if (type === 'travel') return travelReport({ requests, employees, filters });
  return attendanceReport({ records, employees, filters, today });
};

// The filters in words, for the report's heading. Without `dates` (the masterlist), it says
// the day it is `asOf` instead of the date range.
export const describeFilters = (filters = {}, employees = [], { dates: byDates = true, asOf = '' } = {}) => {
  const chosen = filters.employee ? employees.find(employee => employeeKey(employee) === filters.employee) : null;
  const dates = filters.from && filters.to ? `${filters.from} to ${filters.to}`
    : filters.from ? `From ${filters.from}` : filters.to ? `Up to ${filters.to}` : 'All dates';
  return [
    chosen ? `Employee: ${employeeLabel(chosen)}` : 'All employees',
    byDates ? dates : asOf ? `As of ${asOf}` : '',
    filters.office ? `Office: ${filters.office}` : 'All offices',
    filters.status ? `Status: ${filters.status}` : 'All statuses'
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
