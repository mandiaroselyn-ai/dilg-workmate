import assert from 'node:assert/strict';
import test from 'node:test';
import { asOfLabel, beforeStartProblem, needsStartingBalance, readStartingBalance, startingBalanceAsOf, startMonthProblem } from './leaveStart.js';

const longTime = { employeeId: 'DILG-2015-1', accountStatus: 'Active', appointmentStatus: 'Permanent', dateHired: '2015-06-01' };

test('a starting balance is as of the last day of the month before the start', () => {
  assert.equal(startingBalanceAsOf('2026-11'), '2026-10-31');
  assert.equal(startingBalanceAsOf('2027-01'), '2026-12-31');
  assert.equal(startingBalanceAsOf('2028-03'), '2028-02-29');
  assert.equal(asOfLabel('2026-10-31'), 'October 31, 2026');
});

test('active employees hired before the start who earn leave need a starting balance', () => {
  assert.equal(needsStartingBalance(longTime, '2026-11'), true);
  assert.equal(needsStartingBalance({ ...longTime, dateHired: '' }, '2026-11'), true);
  // Entered for this start.
  assert.equal(needsStartingBalance({ ...longTime, startingLeaveBalance: { start: '2026-11' } }, '2026-11'), false);
  // Hired from the start month on: starts with none, like any new employee.
  assert.equal(needsStartingBalance({ ...longTime, dateHired: '2026-11-03' }, '2026-11'), false);
  // Not active, or no leave credits (COS/JO), or no start set.
  assert.equal(needsStartingBalance({ ...longTime, accountStatus: 'Pending' }, '2026-11'), false);
  assert.equal(needsStartingBalance({ ...longTime, accountStatus: 'Inactive' }, '2026-11'), false);
  assert.equal(needsStartingBalance({ ...longTime, appointmentStatus: 'Job Order' }, '2026-11'), false);
  assert.equal(needsStartingBalance(longTime, ''), false);
  // A balance entered when the account was made, before the start was set, is entered again.
  assert.equal(needsStartingBalance({ ...longTime, startingLeaveBalance: { start: '' } }, '2026-11'), true);
});

test('the start is a month within the next year, after any month already counted in WorkMate', () => {
  const currentMonth = '2026-11';
  assert.match(startMonthProblem('2026-13', { currentMonth }), /like 2026-11/);
  assert.match(startMonthProblem('2027-12', { currentMonth }), /within the next year/);
  assert.equal(startMonthProblem('2027-11', { currentMonth }), '');
  assert.equal(startMonthProblem('2020-01', { currentMonth }), '');
  const credited = [{ ...longTime, leaveEarnings: [{ month: '2026-09' }], tardinessDeductions: [{ month: '2026-10' }] }];
  assert.equal(startMonthProblem('2026-10', { currentMonth, employees: credited }), 'October 2026 is already credited or charged in WorkMate, so start from November 2026 or later.');
  assert.equal(startMonthProblem('2026-11', { currentMonth, employees: credited }), '');
});

test('the start stays once a starting balance is entered for it', () => {
  const entered = [{ ...longTime, startingLeaveBalance: { start: '2026-11' } }];
  assert.equal(startMonthProblem('2027-01', { currentMonth: '2026-11', current: '2026-11', employees: entered }), 'Starting balances as of October 31, 2026 are already entered, so the start stays November 2026.');
  assert.equal(startMonthProblem('2026-11', { currentMonth: '2026-11', current: '2026-11', employees: entered }), '');
  assert.equal(startMonthProblem('2027-01', { currentMonth: '2026-11', current: '2026-11', employees: [longTime] }), '');
});

test('months before the start are not credited or charged in WorkMate', () => {
  assert.equal(beforeStartProblem('2026-10', '2026-11'), 'WorkMate starts counting leave credits in November 2026. October 2026 is on the leave card, in the starting balance.');
  assert.equal(beforeStartProblem('2026-11', '2026-11'), '');
  assert.equal(beforeStartProblem('2026-10', ''), '');
});

test('a starting balance is two numbers of days, blank as 0', () => {
  assert.deepEqual(readStartingBalance({ vacationLeaveCredits: '45.125', sickLeaveCredits: 60 }), { value: { vacationLeaveCredits: 45.125, sickLeaveCredits: 60 } });
  assert.deepEqual(readStartingBalance({ vacationLeaveCredits: '', sickLeaveCredits: undefined }), { value: { vacationLeaveCredits: 0, sickLeaveCredits: 0 } });
  assert.match(readStartingBalance({ vacationLeaveCredits: -1 }).error, /vacation leave/);
  assert.match(readStartingBalance({ sickLeaveCredits: 'many' }).error, /sick leave/);
});
