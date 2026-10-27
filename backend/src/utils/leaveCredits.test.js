import assert from 'node:assert/strict';
import test from 'node:test';
import { leaveCreditDeduction, leaveCreditField, minutesText, monthLabel, normalizeTardinessDeductions, tardinessCharge } from './leaveCredits.js';

test('charges vacation, forced, and sick leave to the right balance', () => {
  assert.equal(leaveCreditField('Vacation Leave'), 'vacationLeaveCredits');
  assert.equal(leaveCreditField('Mandatory / Forced Leave'), 'vacationLeaveCredits');
  assert.equal(leaveCreditField('Sick Leave'), 'sickLeaveCredits');
  assert.equal(leaveCreditField('Maternity Leave'), null);
});

test('deducts credits only when a leave request first becomes Approved', () => {
  const approved = { type: 'Leave Request', status: 'Approved', leaveType: 'Vacation Leave', workingDays: 3 };
  assert.deepEqual(leaveCreditDeduction({ status: 'Pending' }, approved), { field: 'vacationLeaveCredits', days: 3 });
  assert.equal(leaveCreditDeduction({ status: 'Approved' }, approved), null);
  assert.equal(leaveCreditDeduction({ status: 'Pending' }, { ...approved, status: 'Rejected' }), null);
  assert.equal(leaveCreditDeduction({ status: 'Pending' }, { ...approved, type: 'Travel Order' }), null);
  assert.equal(leaveCreditDeduction({ status: 'Pending' }, { ...approved, workingDays: 0 }), null);
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
