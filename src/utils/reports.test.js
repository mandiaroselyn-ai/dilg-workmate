import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { provincialDirectorName } from './consolidatedAttendance.js';
import { consolidatedHtml, fillConsolidatedXlsx } from './consolidatedReportFiles.js';
import { markDtrDay } from './hrAttendance.js';
import { REPORT_TYPES, buildReport, describeFilters, employeeKey, reportCsv, reportHtml } from './reports.js';

const juan = { employeeId: 'E1', email: 'juan@dilg.gov.ph', name: 'Juan Dela Cruz', office: 'Boac Municipal Operations Office' };

const valueOf = (report, label) => report.summary.find(item => item.label === label)?.value;

test('HR has two reports: attendance and the employee masterlist', () => {
  assert.deepEqual(REPORT_TYPES.map(option => option.id), ['attendance', 'masterlist']);
});

// October 2026: Thursday the 1st; Mondays the 5th, 12th, 19th, and 26th.
const ana = { _id: 'u1', employeeId: 'E3', email: 'ana@dilg.gov.ph', name: 'Ana Reyes', firstName: 'Ana', middleName: 'Santos', lastName: 'Reyes', gender: 'Female', office: 'Finance and Administrative Section (FAS)', role: 'ADAS II', appointmentStatus: 'Permanent', dateHired: '2020-01-06', accountStatus: 'Active' };
const ben = { _id: 'u2', employeeId: 'E4', email: 'ben@dilg.gov.ph', name: 'Ben Cruz', gender: 'Male', office: 'Office of the MLGOO - Santa Cruz', role: 'MLGOO / Cluster Team Leader', designation: 'Cluster Team Leader', appointmentStatus: 'Permanent', dateHired: '2019-03-01', accountStatus: 'Active' };
// Not organic personnel, and hired after October: neither is listed.
const driver = { _id: 'u3', employeeId: 'E5', email: 'driver@dilg.gov.ph', name: 'Dan Driver', gender: 'Male', office: 'Finance and Administrative Section (FAS)', role: 'Job Order (Driver)', appointmentStatus: 'Job Order', accountStatus: 'Active' };
const newcomer = { _id: 'u4', employeeId: 'E6', email: 'new@dilg.gov.ph', name: 'Nina New', gender: 'Female', office: 'Finance and Administrative Section (FAS)', appointmentStatus: 'Permanent', dateHired: '2026-11-02', accountStatus: 'Active' };
const staff = [ana, ben, driver, newcomer];

const leave = (employeeId, leaveType, startDate, endDate, extra = {}) => ({ type: 'Leave Request', employeeId, leaveType, startDate, endDate, status: 'Approved', ...extra });
const octoberRequests = [
  // Thursday the 8th to Tuesday the 13th: the weekend is not leave.
  leave('E3', 'Vacation Leave', '2026-10-08', '2026-10-13'),
  leave('E3', 'Special Privilege Leave', '2026-10-21', '2026-10-21'),
  leave('E3', 'Others', '2026-10-27', '2026-10-28', { detailsSpecify: 'Compensatory Time Off for the Oct 10 seminar' }),
  leave('E4', 'Sick Leave', '2026-10-16', '2026-10-16'),
  leave('E4', 'Wellness Leave', '2026-10-22', '2026-10-23'),
  // Not approved: left out.
  leave('E4', 'Wellness Leave', '2026-10-06', '2026-10-06', { status: 'Pending' })
];
const octoberRecords = [
  // A Monday (7:00 AM to 4:00 PM): 10 minutes late in the morning and 20 after lunch, and 15 early.
  { id: 'r1', employeeId: 'E3', employeeName: 'Ana Reyes', date: '2026-10-26', timeIn: '07:10 AM', lunchOut: '12:00 PM', lunchIn: '01:20 PM', timeOut: '03:45 PM' },
  // A morning missed: a half day, not tardiness.
  { id: 'r2', employeeId: 'E4', employeeName: 'Ben Cruz', date: '2026-10-20', timeIn: '01:00 PM', timeOut: '06:00 PM' }
].map(record => markDtrDay(record, { requests: octoberRequests }));

const october = (filters = {}) => buildReport({
  type: 'attendance',
  records: octoberRecords,
  requests: octoberRequests,
  employees: staff,
  filters: { month: '2026-10', ...filters },
  today: '2026-10-27',
  minutes: 18 * 60
});

test('the consolidated report lists each organic employee with their leave, tardiness, undertime, and half days', () => {
  const report = october();
  assert.equal(report.title, 'Consolidated Report of Attendance');
  assert.equal(report.monthLabel, 'October 2026');
  assert.deepEqual(report.rows.map(row => [row.no, row.name, row.position, row.station]), [
    [1, 'Ben Cruz', 'MLGOO / Cluster Team Leader', 'DILG-Sta. Cruz'],
    [2, 'Reyes, Ana S.', 'ADAS II', 'Provincial Office']
  ]);
  const [benRow, anaRow] = report.rows;
  assert.equal(anaRow.vl, '8-9, 12-13');
  assert.equal(anaRow.sl, '');
  assert.equal(anaRow.tardy, '30 min - October 26');
  assert.equal(anaRow.undertime, '15 min - October 26');
  assert.equal(benRow.sl, '16');
  assert.equal(benRow.halfDay, '20 (AM)');
  assert.equal(benRow.tardy, '');
  // Other leave in the remarks, then the working days with no Time In and no approved leave,
  // counted from the first day attendance was recorded (the 20th) up to today.
  assert.equal(anaRow.remarks, 'SPL - 21\nCTO - 27-28\nABSENT - 20, 22-23');
  assert.equal(benRow.remarks, 'WELLNESS - 22-23\nABSENT - 21, 26-27');
  assert.deepEqual(report.counts, { personnel: 2, male: 1, female: 1, noGender: 0 });
  assert.equal(valueOf(report, 'Organic personnel'), 2);
  assert.equal(valueOf(report, 'Days absent'), 6);
});

test('the consolidated report is filtered by month, employee, and office', () => {
  assert.deepEqual(october({ employee: employeeKey(ben) }).rows.map(row => row.name), ['Ben Cruz']);
  assert.deepEqual(october({ office: 'Finance and Administrative Section (FAS)' }).rows.map(row => [row.no, row.name]), [[1, 'Reyes, Ana S.']]);
  // November: the newcomer is in the service, and October's leave is not.
  const november = buildReport({ type: 'attendance', requests: octoberRequests, employees: staff, filters: { month: '2026-11' }, today: '2026-11-26' });
  assert.deepEqual(november.rows.map(row => [row.name, row.vl, row.remarks]), [['Ben Cruz', '', ''], ['Nina New', '', ''], ['Reyes, Ana S.', '', '']]);
  assert.equal(describeFilters({ month: '2026-10' }, staff, { period: 'October 2026', status: false }), 'All employees · October 2026 · All offices');
});

const template = () => readFileSync(new URL('../assets/template/consolidated-attendance-template.xlsx', import.meta.url));
const sheetOf = bytes => strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']);

test('the Excel file is DILG\'s template with the employees\' rows, and the footer moved below them', () => {
  const bytes = fillConsolidatedXlsx(template(), october(), { vacant: '1', director: 'Pedro P. Penduko' });
  const files = unzipSync(bytes);
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  const text = ref => new RegExp(`<c r="${ref}" s="\\d+" t="inlineStr"><is><t xml:space="preserve">([^<]*)</t>`).exec(sheet)?.[1];
  assert.equal(text('A15'), 'Month/Year : OCTOBER 2026');
  assert.equal(text('B19'), 'Ben Cruz');
  assert.equal(text('I19'), '20 (AM)');
  assert.equal(text('B20'), 'Reyes, Ana S.');
  assert.equal(text('J20'), 'SPL - 21\nCTO - 27-28\nABSENT - 20, 22-23');
  // The last row closes the table with the template's heavy line.
  assert.match(sheet, /<c r="B20" s="60"/);
  assert.match(sheet, /<c r="B19" s="55"/);
  assert.match(text('A22'), /^I hereby certify that the foregoing is a true report of attendance/);
  // The PD's name is from WorkMate's accounts; the template has no names of its own.
  assert.equal(text('H28'), 'PEDRO P. PENDUKO');
  assert.doesNotMatch(Object.values(files).map(part => strFromU8(part)).join(''), /FADRI|Buenaventura/i);
  assert.equal(text('A32'), 'No. organic personnel : 2');
  assert.equal(text('A33'), 'No. of Filled Positions: 2');
  assert.equal(text('A34'), 'No. of Vacant Positions: 1');
  assert.equal(text('A35'), 'No. of Male Employees: 1');
  assert.equal(text('A36'), 'No. of Female Employees: 1');
  assert.match(sheet, /<mergeCell ref="A22:J22"\/>/);
  assert.match(sheet, /<mergeCell ref="A39:J39"\/>/);
  assert.match(sheet, /<mergeCell ref="A17:A18"\/>/);
  assert.doesNotMatch(sheet, /\{\{/);
  const rowNumbers = [...sheet.matchAll(/<row r="(\d+)"/g)].map(match => Number(match[1]));
  assert.deepEqual(rowNumbers, [...rowNumbers].sort((a, b) => a - b));
  assert.equal(new Set(rowNumbers).size, rowNumbers.length);
  assert.match(strFromU8(files['xl/workbook.xml']), /<sheet name="OCTOBER 2026"/);
  // The logos are kept; there is no signature picture.
  assert.deepEqual(Object.keys(files).filter(name => name.startsWith('xl/media/')).sort(), ['xl/media/image1.png', 'xl/media/image2.png']);
  assert.equal((strFromU8(files['xl/drawings/drawing1.xml']).match(/<xdr:oneCellAnchor>/g) || []).length, 2);
  // Every part is whole: it closes the element it opens (Excel does not open a file with a part cut short).
  for (const [name, part] of Object.entries(files)) {
    if (name.endsWith('.png')) continue;
    const xml = strFromU8(part).replace(/^<\?xml[^>]*\?>\s*/, '').trim();
    const root = /^<([\w:.-]+)/.exec(xml)?.[1];
    assert.ok(root && (xml.endsWith(`</${root}>`) || /^<[^>]*\/>$/.test(xml)), `${name} is not whole`);
  }
});

test('the Excel file keeps what employees typed as text, and has a row when no one is listed', () => {
  const typed = { monthLabel: 'October 2026', counts: { personnel: 1, male: 0, female: 0 }, rows: [{ no: 1, name: 'Ana & <Ben>', remarks: '=1+1' }] };
  const sheet = sheetOf(fillConsolidatedXlsx(template(), typed));
  assert.match(sheet, /<t xml:space="preserve">Ana &amp; &lt;Ben&gt;<\/t>/);
  assert.match(sheet, /<c r="J19" s="80" t="inlineStr"><is><t xml:space="preserve">=1\+1<\/t>/);
  assert.match(sheet, /No. of Vacant Positions: <\/t>/);
  // No Provincial Director account: the name is left blank.
  assert.match(sheet, /<c r="H27" s="42" t="inlineStr"><is><t xml:space="preserve"><\/t>/);

  const empty = sheetOf(fillConsolidatedXlsx(template(), { monthLabel: 'October 2026', counts: {}, rows: [] }));
  assert.match(empty, /<row r="19"[^>]*><c r="A19" s="49"\/>/);
  assert.match(empty, /<c r="A21" s="88" t="inlineStr"><is><t xml:space="preserve">I hereby certify/);
});

test('the printed consolidated report is laid out like the template', () => {
  const html = consolidatedHtml(october(), { vacant: '1', director: 'Pedro P. Penduko', logos: ['https://workmate.test/dilg.png'] });
  assert.match(html, /Month\/Year : OCTOBER 2026/);
  assert.match(html, /<td>Reyes, Ana S\.<\/td>/);
  assert.match(html, /<td class="c">30 min - October 26<\/td>/);
  assert.match(html, /No. of Vacant Positions: 1/);
  assert.match(html, /<b>PEDRO P. PENDUKO<\/b>Provincial Director/);
  assert.match(consolidatedHtml(october()), /<b>&nbsp;<\/b>Provincial Director/);
  assert.equal((html.match(/<img /g) || []).length, 1);
  assert.match(consolidatedHtml({ monthLabel: 'October 2026', rows: [{ no: 1, name: '<b>x</b>' }] }), /&lt;b&gt;x&lt;\/b&gt;/);
});

test('the Provincial Director who signs is the active account with that position title', () => {
  const assistant = { name: 'Ana Assistant', role: 'Assistant Provincial Director', accountStatus: 'Active' };
  const former = { name: 'Fe Former', role: 'Provincial Director', accountStatus: 'Inactive' };
  const director = { name: 'Pedro P. Penduko', role: 'Provincial Director', accountStatus: 'Active' };
  assert.equal(provincialDirectorName([assistant, former, ana, director]), 'Pedro P. Penduko');
  assert.equal(provincialDirectorName([assistant, former, ana]), '');
});

test('the CSV opens in a spreadsheet as text, quoted where needed', () => {
  const report = {
    columns: [{ key: 'name', label: 'Employee' }, { key: 'note', label: 'Remarks' }],
    rows: [{ name: 'Dela Cruz, Juan', note: '=HYPERLINK("x")' }, { name: 'Peña', note: 'said "ok"' }]
  };
  assert.equal(reportCsv(report), '﻿Employee,Remarks\r\n"Dela Cruz, Juan","\'=HYPERLINK(""x"")"\r\nPeña,"said ""ok"""\r\n');
});

test('the printable masterlist shows the filters and escapes what employees typed', () => {
  const report = buildReport({ type: 'masterlist', employees: [{ ...juan, role: '<b>ok</b>' }] });
  const html = reportHtml(report, { filtersText: describeFilters({}, [juan], { period: 'As of 2026-11-25' }), generatedAt: 'Nov 25, 2026' });
  assert.match(html, /Employee Masterlist/);
  assert.match(html, /All employees · As of 2026-11-25 · All offices · All statuses/);
  assert.match(html, /&lt;b&gt;ok&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>ok<\/b>/);
});

test('the employee masterlist lists every account, filtered by office and account status', () => {
  const anaAccount = { employeeId: 'E3', email: 'ana@dilg.gov.ph', name: 'Ana Reyes', firstName: 'Ana', middleName: 'Santos', lastName: 'Reyes', office: 'Provincial Administrative Section', role: 'Administrative Aide IV', appointmentStatus: 'Permanent', salaryGrade: 'SG 4', salaryStep: 'Step 1', salary: 'PHP 16,000', dateHired: '2020-01-06', accountStatus: 'Active' };
  const benAccount = { employeeId: 'E4', email: 'ben@dilg.gov.ph', name: 'Ben Cruz', office: 'Boac Municipal Operations Office', appointmentStatus: 'Job Order', accountStatus: 'Inactive', separationDate: '2026-11-15', separationReason: 'End of contract or appointment' };
  const all = [anaAccount, benAccount, juan];
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
  // The month does not filter it; the office and status do.
  assert.equal(buildReport({ type: 'masterlist', employees: all, filters: { month: '2030-01' } }).rows.length, 3);
  assert.deepEqual(buildReport({ type: 'masterlist', employees: all, filters: { status: 'Inactive' } }).rows.map(row => row.employeeId), ['E4']);
  assert.deepEqual(buildReport({ type: 'masterlist', employees: all, filters: { office: 'Provincial Administrative Section' } }).rows.map(row => row.employeeId), ['E3']);
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
  // Monday Nov 23 logged, Tuesday Nov 24 over with no Time In: each is counted on her own row.
  const attendance = buildReport({ type: 'attendance', records: shared, employees: both, filters: { ...roseOnly, month: '2026-11' }, today: '2026-11-24', minutes: 18 * 60 });
  assert.deepEqual(attendance.rows.map(row => [row.name, row.tardy, row.remarks]), [['Roselyn Mandia', '5 min - November 23', 'ABSENT - 24']]);
  assert.deepEqual(buildReport({ type: 'masterlist', employees: both, filters: roseOnly }).rows.map(row => row.employee), ['Roselyn Mandia']);
  assert.match(describeFilters(roseOnly, both), /^Employee: Roselyn Mandia/);
});
