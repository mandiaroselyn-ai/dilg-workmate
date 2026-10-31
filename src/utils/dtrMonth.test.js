import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { fillDTR, dtrSummaryRows } from './dtrForm.js';
import { dayEntry, dtrEntry, dtrRecordsByDay, monthDeductionText, monthDtrTotals, monthUndertimeMinutes, totalUndertimeMinutes } from './dtrMonth.js';
import { markDtrDay } from './hrAttendance.js';

const october = [
  // Before lunch logs: only a Time In and a Time Out.
  { employeeId: 'E1', date: '2026-10-06', timeIn: '08:15 AM', timeOut: '05:00 PM' },
  { employeeId: 'E1', date: '2026-10-07', timeIn: '07:55 AM', timeOut: '04:30 PM' },
  { employeeId: 'E1', date: '2026-10-08', timeIn: '08:00 AM', timeOut: '06:30 PM' },
  // With lunch logs.
  { employeeId: 'E1', date: '2026-10-27', timeIn: '08:10 AM', lunchOut: '12:00 PM', lunchIn: '01:20 PM', timeOut: '04:45 PM' },
  { employeeId: 'E1', date: '2026-10-28', timeIn: '07:58 AM', lunchOut: '12:00 PM', lunchIn: '12:59 PM', timeOut: '07:15 PM' }
];
const overtimeOrders = [{ orderNumber: 'OO 14', startDate: '2026-10-01', endDate: '2026-10-31', startTime: '17:00', endTime: '19:00', employeeIds: ['E1'] }];
const marked = october.map(record => markDtrDay(record, { overtimeOrders }));

test('a day splits its UNDERTIME column into late and early, with overtime apart', () => {
  const { undertime, late, early, overtime } = dayEntry(marked[3]);
  assert.deepEqual({ undertime, late, early, overtime }, { undertime: 45, late: 30, early: 15, overtime: 0 });
  // The order ends at 7:00 PM, and the Time Out is 7:15 PM.
  const { overtime: ordered, noOrder } = dayEntry(marked[4]);
  assert.deepEqual({ ordered, noOrder }, { ordered: 120, noOrder: 15 });
  assert.deepEqual([dayEntry(october[4]).overtime, dayEntry(october[4]).noOrder], [0, 135]);
});

test('a record from before lunch logs keeps its DTR total when it is split', () => {
  const late = dayEntry(october[0]);
  assert.deepEqual([late.undertime, late.late, late.early], [15, 15, 0]);
  // Its hours are counted, so 5 minutes early in the morning lessen the 30 early at the end.
  const early = dayEntry(october[1]);
  assert.deepEqual([early.undertime, early.late, early.early], [25, 0, 25]);
  // An afternoon-only day is late against 1:00 PM.
  const afternoon = dayEntry({ date: '2026-10-09', timeIn: '01:10 PM', timeOut: '05:00 PM' });
  assert.deepEqual([afternoon.undertime, afternoon.late], [10, 10]);
  assert.equal(dayEntry(marked[2]).overtime, 90);
});

test('a rest day has its logs but no late or undertime, on the DTR and in what HR charges', () => {
  const saturday = { employeeId: 'E1', date: '2026-11-07', timeIn: '09:00 AM', lunchOut: '12:00 PM', lunchIn: '01:00 PM', timeOut: '03:00 PM' };
  const entry = dayEntry(saturday);
  assert.deepEqual([entry.amArr, entry.amDep, entry.pmArr, entry.pmDep], ['9:00', '12:00', '1:00', '3:00']);
  assert.deepEqual([entry.undertime, entry.late, entry.early], [0, 0, 0]);

  // Before lunch logs too, and on a weekday HR set as a holiday.
  const oldSaturday = { date: '2026-10-10', timeIn: '09:00 AM', timeOut: '03:00 PM' };
  assert.equal(dayEntry(oldSaturday).undertime, 0);
  assert.notEqual(dayEntry({ ...oldSaturday, date: '2026-10-09' }).undertime, 0);

  const holidays = [{ date: '2026-11-30', name: 'Bonifacio Day' }];
  const holiday = { employeeId: 'E1', date: '2026-11-30', timeIn: '09:00 AM', timeOut: '03:00 PM' };
  assert.equal(monthUndertimeMinutes([markDtrDay(holiday, { holidays })], 2026, 11), 0);
  // A weekday that is not a holiday is still counted.
  assert.notEqual(monthUndertimeMinutes([markDtrDay(holiday)], 2026, 11), 0);
});

test('the month\'s late and undertime add up to the DTR\'s TOTAL row', () => {
  const byDay = dtrRecordsByDay(marked, 2026, 10);
  const totals = monthDtrTotals(byDay);
  // Overtime is 1h 30m (Oct 8) and 2h (Oct 28), within the order.
  assert.deepEqual(totals, { late: 45, early: 40, overtime: 210 });
  assert.equal(totals.late + totals.early, totalUndertimeMinutes(byDay));
});

test('an offline punch still waiting for HR stays out, as it does on the DTR', () => {
  const waiting = { reviewReasons: ['Outside the assigned area'] };
  assert.equal(dtrEntry({ ...marked[3], offlineTimeIn: waiting }), null);
  // Without its Time Out, a pending offline Time Out cannot show overtime.
  assert.equal(dtrEntry({ ...marked[4], offlineTimeOut: waiting }).overtime, 0);
  assert.equal(dtrEntry({ ...marked[4], offlineTimeOut: { ...waiting, decision: 'approved' } }).overtime, 120);
  assert.equal(dtrEntry({ date: '2026-10-29' }), null);
});

test('the deduction reads as HR charged it, or else as it will be charged', () => {
  assert.equal(monthDeductionText({}, 2026, 10, 0), 'None');
  assert.equal(monthDeductionText({}, 2026, 10, 135), '0.281 day to be charged to vacation leave');

  // Contract of service and job order workers have no leave credits.
  assert.equal(monthDeductionText({ appointmentStatus: 'Job Order' }, 2026, 10, 135), '0.281 day without pay');

  const charged = { tardinessDeductions: [{ month: '2026-10', minutes: 135, days: 0.281, deductedDays: 0.281, withoutPayDays: 0 }] };
  assert.equal(monthDeductionText(charged, 2026, 10, 135), '0.281 day charged to vacation leave');
  // Another month's charge says nothing about this one.
  assert.equal(monthDeductionText(charged, 2026, 11, 60), '0.125 day to be charged to vacation leave');

  const short = { tardinessDeductions: [{ month: '2026-10', days: 0.281, deductedDays: 0.2, withoutPayDays: 0.081 }] };
  assert.equal(monthDeductionText(short, 2026, 10, 135), '0.200 day charged to vacation leave, 0.081 day without pay');
  const none = { tardinessDeductions: [{ month: '2026-10', days: 0.281, deductedDays: 0, withoutPayDays: 0.281 }] };
  assert.equal(monthDeductionText(none, 2026, 10, 135), '0.281 day without pay');
  assert.equal(monthDeductionText({ tardinessDeductions: [{ month: '2026-10', days: 0, deductedDays: 0, withoutPayDays: 0 }] }, 2026, 10, 0), 'None');
});

test('the DTR\'s summary shows late, undertime, the deduction, and overtime as not deducted', () => {
  assert.deepEqual(dtrSummaryRows({}, 2026, 10, dtrRecordsByDay(marked, 2026, 10)), [
    ['Late (tardiness)', '45 min'],
    ['Undertime', '40 min'],
    ['Deduction', '0.177 day to be charged to vacation leave'],
    ['Overtime (office order)', '3h 30m, not deducted']
  ]);
  assert.deepEqual(dtrSummaryRows({}, 2026, 9, {}).map(([, value]) => value), ['None', 'None', 'None', 'None']);
});

test('the filled DTR keeps the template\'s pages', async () => {
  const template = fs.readFileSync(new URL('../assets/template/dtr-template.pdf', import.meta.url));
  const pdf = await PDFDocument.load(await fillDTR(template, { name: 'Juan Dela Cruz' }, 2026, 10, marked));
  assert.equal(pdf.getPageCount(), (await PDFDocument.load(template)).getPageCount());
});
