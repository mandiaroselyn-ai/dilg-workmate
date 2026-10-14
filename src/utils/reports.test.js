import assert from 'node:assert/strict';
import test from 'node:test';
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
