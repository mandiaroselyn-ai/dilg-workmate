import assert from 'node:assert/strict';
import test from 'node:test';
import { leaveCreditDeduction, leaveCreditField, minutesText, monthLabel, normalizeHolidays, normalizeTardinessDeductions, tardinessCharge } from './leaveCredits.js';

test('charges vacation, forced, and sick leave to the right balance', () => {
  assert.equal(leaveCreditField('Vacation Leave'), 'vacationLeaveCredits');
  assert.equal(leaveCreditField('Mandatory / Forced Leave'), 'vacationLeaveCredits');
  assert.equal(leaveCreditField('Sick Leave'), 'sickLeaveCredits');
  assert.equal(leaveCreditField('Maternity Leave'), null);
});

test('deducts credits only when a leave request first becomes Approved', () => {
  // Wed Nov 4 to Fri Nov 6, 2026: 3 working days.
  const approved = { type: 'Leave Request', status: 'Approved', leaveType: 'Vacation Leave', startDate: '2026-11-04', endDate: '2026-11-06' };
  assert.deepEqual(leaveCreditDeduction({ status: 'Pending' }, approved), { field: 'vacationLeaveCredits', days: 3 });
  assert.equal(leaveCreditDeduction({ status: 'Approved' }, approved), null);
  assert.equal(leaveCreditDeduction({ status: 'Pending' }, { ...approved, status: 'Rejected' }), null);
  assert.equal(leaveCreditDeduction({ status: 'Pending' }, { ...approved, type: 'Travel Order' }), null);
  // A weekend-only leave has no working days.
  assert.equal(leaveCreditDeduction({ status: 'Pending' }, { ...approved, startDate: '2026-11-07', endDate: '2026-11-08' }), null);
});

test('the days charged come from the dates, not from what the request says', () => {
  const approved = { type: 'Leave Request', status: 'Approved', leaveType: 'Sick Leave', startDate: '2026-11-27', endDate: '2026-11-30', workingDays: 0 };
  // Fri Nov 27 and Mon Nov 30; Bonifacio Day is a holiday.
  assert.deepEqual(leaveCreditDeduction({ status: 'Pending' }, approved), { field: 'sickLeaveCredits', days: 2 });
  assert.deepEqual(leaveCreditDeduction({ status: 'Pending' }, approved, [{ date: '2026-11-30', name: 'Bonifacio Day' }]), { field: 'sickLeaveCredits', days: 1 });
});

test('validates HR holidays', () => {
  assert.deepEqual(normalizeHolidays({ holidays: [{ date: '2026-12-25', name: ' Christmas Day ' }] }), { holidays: [{ date: '2026-12-25', name: 'Christmas Day' }] });
  assert.match(normalizeHolidays({ holidays: [{ date: '2026-02-30', name: 'Not a day' }] }).error, /real date/);
  assert.match(normalizeHolidays({ holidays: [{ date: '2026-12-25', name: '' }] }).error, /name/);
  assert.match(normalizeHolidays({ holidays: [] }).error, /at least one/);
});

test('validates HR leave credit adjustments', async () => {
  const { normalizeLeaveCreditInput } = await import('./leaveCredits.js');
  const valid = normalizeLeaveCreditInput({ vacationLeaveCredits: '18.75', sickLeaveCredits: 20, reason: ' Leave card balance ' });
  assert.deepEqual(valid, { value: { vacationLeaveCredits: 18.75, sickLeaveCredits: 20 }, reason: 'Leave card balance' });
  assert.match(normalizeLeaveCreditInput({ vacationLeaveCredits: -1, sickLeaveCredits: 5, reason: 'x' }).error, /Vacation/);
  assert.match(normalizeLeaveCreditInput({ vacationLeaveCredits: 5, sickLeaveCredits: 'many', reason: 'x' }).error, /Sick/);
  assert.match(normalizeLeaveCreditInput({ vacationLeaveCredits: 5, sickLeaveCredits: 5 }).error, /reason/);
});

test('a month of tardiness comes out of vacation leave, and what it cannot cover is without pay', () => {
  assert.deepEqual(tardinessCharge(15, 0.281), { deductedDays: 0.281, withoutPayDays: 0, vacationLeaveCredits: 14.719 });
  assert.deepEqual(tardinessCharge(0.2, 0.281), { deductedDays: 0.2, withoutPayDays: 0.081, vacationLeaveCredits: 0 });
  assert.deepEqual(tardinessCharge(0, 0.125), { deductedDays: 0, withoutPayDays: 0.125, vacationLeaveCredits: 0 });
});

test('only an ended month can be charged, with whole minutes for each employee', () => {
  const current = '2026-11';
  assert.deepEqual(normalizeTardinessDeductions({ month: '2026-10', deductions: [{ identifier: 'EMP-1', minutes: 135 }] }, current), {
    month: '2026-10',
    deductions: [{ identifier: 'EMP-1', minutes: 135 }]
  });
  assert.match(normalizeTardinessDeductions({ month: '2026-11', deductions: [{ identifier: 'EMP-1', minutes: 5 }] }, current).error, /month that has ended/);
  assert.match(normalizeTardinessDeductions({ month: 'Oct', deductions: [] }, current).error, /written like/);
  assert.match(normalizeTardinessDeductions({ month: '2026-10', deductions: [] }, current).error, /at least one employee/);
  assert.match(normalizeTardinessDeductions({ month: '2026-10', deductions: [{ identifier: 'EMP-1', minutes: 2.5 }] }, current).error, /whole number/);
  assert.match(normalizeTardinessDeductions({ month: '2026-10', deductions: [{ minutes: 5 }] }, current).error, /employee ID or email/);
  assert.equal(monthLabel('2026-10'), 'October 2026');
  assert.equal(minutesText(135), '2h 15m');
  assert.equal(minutesText(45), '45 min');
});
