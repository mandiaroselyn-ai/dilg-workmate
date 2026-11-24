import assert from 'node:assert/strict';
import test from 'node:test';
import { markDtrDay } from './hrAttendance.js';
import { buildReport, describeFilters, employeeKey, reportCsv, reportHtml } from './reports.js';

const juan = { employeeId: 'E1', email: 'juan@dilg.gov.ph', name: 'Juan Dela Cruz', office: 'Boac Municipal Operations Office' };
const maria = { employeeId: 'E2', email: 'maria@dilg.gov.ph', name: 'Maria Santos', office: 'Provincial Administrative Section' };
const employees = [juan, maria];

const records = [
  { id: 'a1', employeeId: 'E1', employeeName: 'Juan Dela Cruz', date: '2026-10-05', timeIn: '08:00 AM', timeOut: '05:00 PM', location: 'Brgy. Tanza, Boac' },
  { id: 'a2', employeeId: 'E1', employeeName: 'Juan Dela Cruz', date: '2026-10-06', timeIn: '08:30 AM', timeOut: '05:00 PM', late: true },
  { id: 'a3', employeeId: 'E2', employeeName: 'Maria Santos', date: '2026-10-06', timeIn: '07:55 AM', timeOut: null },
  // No current employee account: left out.
  { id: 'a4', employeeId: 'GONE', employeeName: 'Former Employee', date: '2026-10-06', timeIn: '08:00 AM', timeOut: '05:00 PM' }
];

const requests = [
  { id: 'LV-1', type: 'Leave Request', employeeId: 'E1', leaveType: 'Vacation Leave', startDate: '2026-10-12', endDate: '2026-10-14', workingDays: 3, submissionDate: '2026-10-01', status: 'Approved', supervisorRemarks: 'Enjoy.' },
  { id: 'LV-2', type: 'Leave Request', employeeId: 'E2', leaveType: 'Sick Leave', startDate: '2026-10-20', endDate: '2026-10-20', workingDays: 1, status: 'For Supervisor' },
  { id: 'LV-3', type: 'Leave Request', employeeId: 'E2', leaveType: 'Sick Leave', startDate: '2026-10-21', endDate: '2026-10-21', status: 'Draft' },
  { id: 'TO-1', type: 'Travel Order', employeeId: 'E1', travelActivity: 'Barangay monitoring', travelVenue: 'Brgy. Tanza', startDate: '2026-10-07', endDate: '2026-10-09', travelTime: '8:00 AM - 5:00 PM', status: 'Approved' },
  { id: 'TO-2', type: 'Travel Order', employeeId: 'E2', purpose: 'Official Travel. Provincial meeting', travelVenue: 'Boac', startDate: '2026-11-03', endDate: '2026-11-03', status: 'Rejected' }
];

const valueOf = (report, label) => report.summary.find(item => item.label === label)?.value;

test('the attendance report lists current employees\' records with their DTR status', () => {
  const report = buildReport({ type: 'attendance', records, employees, today: '2026-10-14' });
  assert.equal(report.title, 'Attendance Report');
  assert.deepEqual(report.rows.map(row => [row.date, row.employee, row.status]), [
    ['2026-10-06', 'Juan Dela Cruz', 'Late'],
    ['2026-10-06', 'Maria Santos', 'Incomplete'],
    ['2026-10-05', 'Juan Dela Cruz', 'Complete']
  ]);
  assert.equal(report.rows[2].hours, '9h 00m');
  assert.equal(report.rows[2].office, 'Boac Municipal Operations Office');
  assert.equal(valueOf(report, 'Records'), 3);
  assert.equal(valueOf(report, 'Employees'), 2);
  assert.equal(valueOf(report, 'Late'), 1);
});

test('the attendance report says which log a record lacks, and keeps Late on an incomplete late record', () => {
  const lateNoTimeOut = { id: 'a5', employeeId: 'E1', employeeName: 'Juan Dela Cruz', date: '2026-10-07', timeIn: '09:30 AM', timeOut: null, late: true };
  const report = buildReport({ type: 'attendance', records: [...records, lateNoTimeOut], employees, today: '2026-10-14' });
  const shown = Object.fromEntries(report.rows.map(row => [row.date + ' ' + row.employee, row.statusText]));
  assert.equal(shown['2026-10-07 Juan Dela Cruz'], 'Missing Time Out, Late');
  assert.equal(shown['2026-10-06 Maria Santos'], 'Missing Time Out');
  assert.equal(shown['2026-10-06 Juan Dela Cruz'], 'Late');
  assert.equal(report.columns.find(column => column.label === 'Status').key, 'statusText');
  // Late counts and lists every late record; Incomplete every incomplete one.
  assert.equal(valueOf(report, 'Late'), 2);
  assert.equal(valueOf(report, 'Incomplete'), 2);
  const lateOnly = buildReport({ type: 'attendance', records: [...records, lateNoTimeOut], employees, today: '2026-10-14', filters: { status: 'Late' } });
  assert.deepEqual(lateOnly.rows.map(row => row.date), ['2026-10-07', '2026-10-06']);
});

test('the attendance report shows each day\'s late, undertime, deduction, and overtime', () => {
  const overtimeOrders = [{ orderNumber: 'OO 14', startDate: '2026-10-28', endDate: '2026-10-28', startTime: '17:00', endTime: '18:30', employeeIds: ['E1'] }];
  const report = buildReport({
    type: 'attendance',
    employees,
    today: '2026-11-14',
    records: [
      // A Monday (7:00 AM to 4:00 PM); the other weekdays are flexitime days.
      { id: 'b1', employeeId: 'E1', date: '2026-10-26', timeIn: '07:10 AM', lunchOut: '12:00 PM', lunchIn: '01:20 PM', timeOut: '03:45 PM' },
      { id: 'b2', employeeId: 'E1', date: '2026-10-28', timeIn: '08:00 AM', lunchOut: '12:00 PM', lunchIn: '01:00 PM', timeOut: '06:30 PM' },
      { id: 'b3', employeeId: 'E2', date: '2026-10-26', timeIn: '07:03 AM', lunchOut: '12:00 PM', lunchIn: '01:00 PM', timeOut: '04:45 PM' },
      // Waiting for HR, so left out of the numbers as it is left out of the DTR.
      { id: 'b4', employeeId: 'E2', date: '2026-10-29', timeIn: '09:00 AM', timeOut: '05:00 PM', offlineTimeIn: { reviewReasons: ['No GPS'] } },
      // A Saturday: no late or undertime, and no office order for it.
      { id: 'b5', employeeId: 'E2', date: '2026-10-31', timeIn: '09:30 AM', lunchOut: '12:00 PM', lunchIn: '01:00 PM', timeOut: '02:00 PM', late: true }
    ].map(record => markDtrDay(record, { overtimeOrders }))
  });
  const row = id => report.rows.find(item => item.timeIn === id);
  assert.deepEqual([row('07:10 AM').late, row('07:10 AM').undertime, row('07:10 AM').deduction, row('07:10 AM').overtime], ['30 min', '15 min', '0.094', '']);
  assert.deepEqual([row('08:00 AM').late, row('08:00 AM').undertime, row('08:00 AM').deduction, row('08:00 AM').overtime], ['', '', '', '1h 30m']);
  assert.deepEqual([row('09:00 AM').late, row('09:00 AM').deduction], ['', '']);
  assert.deepEqual([row('09:30 AM').late, row('09:30 AM').undertime, row('09:30 AM').deduction, row('09:30 AM').overtime, row('09:30 AM').status], ['', '', '', '', 'Complete']);
  assert.equal(valueOf(report, 'Total late'), '33 min');
  assert.equal(valueOf(report, 'Total undertime'), '15 min');
  // Each employee's month by the CSC table: 45 minutes is 0.094, and 3 minutes 0.006.
  assert.equal(valueOf(report, 'Total deduction'), '0.100 day');
  assert.equal(valueOf(report, 'Total overtime'), '1h 30m');
  // 45 minutes after 4:00 PM on Oct 26 and 3h 30m on the Saturday had no office order.
  assert.equal(valueOf(report, 'After hours, no office order'), '4h 15m');

  assert.match(reportCsv(report), /Hours,Late,Undertime,Deduction \(day\),Overtime,Status/);
  const html = reportHtml(report);
  assert.match(html, /<th>Deduction \(day\)<\/th>/);
  assert.match(html, /within the hours of an office order: it is not deducted and cannot offset late or undertime\. Work from home and days on a Travel Order earn no overtime\./);
});

test('reports filter by employee, date, office, and status', () => {
  const byEmployee = buildReport({ type: 'attendance', records, employees, filters: { employee: employeeKey(maria) }, today: '2026-10-14' });
  assert.deepEqual(byEmployee.rows.map(row => row.employee), ['Maria Santos']);

  const byDate = buildReport({ type: 'attendance', records, employees, filters: { from: '2026-10-05', to: '2026-10-05' }, today: '2026-10-14' });
  assert.deepEqual(byDate.rows.map(row => row.date), ['2026-10-05']);

  const byOffice = buildReport({ type: 'leave', requests, employees, filters: { office: 'Provincial Administrative Section' } });
  assert.deepEqual(byOffice.rows.map(row => row.id), ['LV-2']);

  const byStatus = buildReport({ type: 'travel', requests, employees, filters: { status: 'Approved' } });
  assert.deepEqual(byStatus.rows.map(row => row.id), ['TO-1']);
});

test('a leave or travel request is in a date range when its dates overlap it', () => {
  // TO-1 runs Oct 7 to 9; a range from Oct 9 includes it, one ending Oct 6 does not.
  assert.deepEqual(buildReport({ type: 'travel', requests, employees, filters: { from: '2026-10-09', to: '2026-10-31' } }).rows.map(row => row.id), ['TO-1']);
  assert.deepEqual(buildReport({ type: 'travel', requests, employees, filters: { to: '2026-10-06' } }).rows, []);
});

test('the leave report leaves out drafts and counts approved leave days', () => {
  const report = buildReport({ type: 'leave', requests, employees });
  assert.deepEqual(report.rows.map(row => row.id), ['LV-2', 'LV-1']);
  assert.equal(report.rows[1].remarks, 'Enjoy.');
  assert.equal(valueOf(report, 'Applications'), 2);
  assert.equal(valueOf(report, 'Approved'), 1);
  assert.equal(valueOf(report, 'Awaiting decision'), 1);
  assert.equal(valueOf(report, 'Approved leave days'), 3);
});

test('the travel order report shows destination, duration, and subject', () => {
  const report = buildReport({ type: 'travel', requests, employees });
  const [rejected, approved] = report.rows;
  assert.equal(approved.subject, 'Barangay monitoring');
  assert.equal(approved.destination, 'Brgy. Tanza');
  assert.equal(approved.days, 3);
  assert.equal(rejected.subject, 'Provincial meeting');
  assert.equal(valueOf(report, 'Approved travel days'), 3);
});

test('the CSV opens in a spreadsheet as text, quoted where needed', () => {
  const report = {
    columns: [{ key: 'name', label: 'Employee' }, { key: 'note', label: 'Remarks' }],
    rows: [{ name: 'Dela Cruz, Juan', note: '=HYPERLINK("x")' }, { name: 'Peña', note: 'said "ok"' }]
  };
  assert.equal(reportCsv(report), '﻿Employee,Remarks\r\n"Dela Cruz, Juan","\'=HYPERLINK(""x"")"\r\nPeña,"said ""ok"""\r\n');
});

test('the printable report shows the filters and escapes what employees typed', () => {
  const report = buildReport({ type: 'leave', requests: [{ ...requests[0], supervisorRemarks: '<b>ok</b>' }], employees });
  const html = reportHtml(report, { filtersText: describeFilters({ from: '2026-10-01', to: '2026-10-31' }, employees), generatedAt: 'Oct 14, 2026' });
  assert.match(html, /Leave Report/);
  assert.match(html, /All employees · 2026-10-01 to 2026-10-31 · All offices · All statuses/);
  assert.match(html, /&lt;b&gt;ok&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>ok<\/b>/);
});

test('the employee masterlist lists every account, filtered by office and account status', () => {
  const ana = { employeeId: 'E3', email: 'ana@dilg.gov.ph', name: 'Ana Reyes', firstName: 'Ana', middleName: 'Santos', lastName: 'Reyes', office: 'Provincial Administrative Section', role: 'Administrative Aide IV', appointmentStatus: 'Permanent', salaryGrade: 'SG 4', salaryStep: 'Step 1', salary: 'PHP 16,000', dateHired: '2020-01-06', accountStatus: 'Active' };
  const ben = { employeeId: 'E4', email: 'ben@dilg.gov.ph', name: 'Ben Cruz', office: 'Boac Municipal Operations Office', appointmentStatus: 'Job Order', accountStatus: 'Inactive', separationDate: '2026-11-15', separationReason: 'End of contract or appointment' };
  const all = [ana, ben, juan];
  const report = buildReport({ type: 'masterlist', employees: all });
  assert.equal(report.title, 'Employee Masterlist');
  // Last name first when the name parts are saved; sorted by that.
  assert.deepEqual(report.rows.map(row => row.employee), ['Ben Cruz', 'Juan Dela Cruz', 'Reyes, Ana Santos']);
  const anaRow = report.rows.find(row => row.employeeId === 'E3');
  assert.equal(anaRow.grade, 'SG 4 / Step 1');
  assert.equal(anaRow.salary, 'PHP 16,000');
  // An account saved without a status is Active, as the server saves it.
  assert.equal(report.rows.find(row => row.employeeId === 'E1').accountStatus, 'Active');
  assert.equal(report.rows.find(row => row.employeeId === 'E4').separation, 'Nov 15, 2026 · End of contract or appointment');
  assert.equal(valueOf(report, 'Employees'), 3);
  assert.equal(valueOf(report, 'Active'), 2);
  assert.equal(valueOf(report, 'Inactive'), 1);
  assert.equal(valueOf(report, 'Separated'), 1);
  assert.equal(valueOf(report, 'Job Order'), 1);
  // The dates do not filter it; the office and status do.
  assert.equal(buildReport({ type: 'masterlist', employees: all, filters: { from: '2030-01-01', to: '2030-01-31' } }).rows.length, 3);
  assert.deepEqual(buildReport({ type: 'masterlist', employees: all, filters: { status: 'Inactive' } }).rows.map(row => row.employeeId), ['E4']);
  assert.deepEqual(buildReport({ type: 'masterlist', employees: all, filters: { office: 'Provincial Administrative Section' } }).rows.map(row => row.employeeId), ['E3']);
  // Its heading says the day it is as of, not a date range.
  assert.equal(describeFilters({ from: '2026-11-01', to: '2026-11-25' }, all, { dates: false, asOf: '2026-11-25' }), 'All employees · As of 2026-11-25 · All offices · All statuses');
});

test("two old accounts sharing the default Employee ID are told apart in the employee filter", () => {
  const lara = { _id: 'a1', employeeId: 'DILG-2026-7689', email: 'lara@x.test', name: 'Lara Montiano', office: 'Provincial Administrative Section', accountStatus: 'Active' };
  const rose = { _id: 'a2', employeeId: 'DILG-2026-7689', email: 'rose@x.test', name: 'Roselyn Mandia', office: 'Provincial Administrative Section', accountStatus: 'Active' };
  const both = [lara, rose];
  assert.notEqual(employeeKey(lara), employeeKey(rose));
  const shared = [
    { id: 's1', employeeId: 'DILG-2026-7689', employeeName: 'Lara Montiano', date: '2026-11-23', timeIn: '07:00 AM', timeOut: '04:00 PM' },
    { id: 's2', employeeId: 'DILG-2026-7689', employeeName: 'Roselyn Mandia', date: '2026-11-23', timeIn: '07:05 AM', timeOut: '04:00 PM' }
  ];
  const roseOnly = { employee: employeeKey(rose) };
  assert.deepEqual(buildReport({ type: 'attendance', records: shared, employees: both, filters: roseOnly, today: '2026-11-24' }).rows.map(row => row.employee), ['Roselyn Mandia']);
  assert.deepEqual(buildReport({ type: 'masterlist', employees: both, filters: roseOnly }).rows.map(row => row.employee), ['Roselyn Mandia']);
  // Monday Nov 23 logged, Tuesday Nov 24 over with no Time In: each is absent on her own row.
  const absences = buildReport({ type: 'absence', records: shared, employees: both, filters: roseOnly, today: '2026-11-24', from: '2026-11-23', minutes: 18 * 60 });
  assert.deepEqual(absences.rows.map(row => `${row.employee} ${row.date}`), ['Roselyn Mandia 2026-11-24']);
  assert.match(describeFilters(roseOnly, both), /^Employee: Roselyn Mandia/);
});
