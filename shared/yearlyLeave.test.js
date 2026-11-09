import assert from 'node:assert/strict';
import test from 'node:test';
import { yearlyLeaveLeft, yearlyLeaveProblem, yearlyLeaveUsed } from './yearlyLeave.js';

const leave = (leaveType, startDate, endDate, status = 'Approved', id = '') => ({ id, type: 'Leave Request', leaveType, startDate, endDate, status });
// Mon Nov 9 to Fri Nov 13, 2026.
const spl = 'Special Privilege Leave';
const wellness = 'Wellness Leave';

test('special privilege leave is 3 days a year, counting what is filed or approved', () => {
  const taken = [leave(spl, '2026-03-02', '2026-03-03'), leave(spl, '2026-06-01', '2026-06-01', 'Rejected'), leave('Vacation Leave', '2026-07-06', '2026-07-10')];
  assert.equal(yearlyLeaveUsed(taken, spl, 2026), 2);
  assert.equal(yearlyLeaveLeft(taken, spl, 2026), 1);
  assert.equal(yearlyLeaveProblem(leave(spl, '2026-11-09', '2026-11-09', 'Pending'), taken), null);
  assert.match(yearlyLeaveProblem(leave(spl, '2026-11-09', '2026-11-10', 'Pending'), taken), /3 days a year and does not carry over\. You have 1 day left in 2026, and this asks for 2/);
  // A pending one counts too, so the days cannot be filed twice.
  assert.equal(yearlyLeaveLeft([...taken, leave(spl, '2026-11-09', '2026-11-09', 'For Supervisor')], spl, 2026), 0);
});

test('unused days do not carry over: each year starts again', () => {
  const lastYear = [leave(spl, '2025-12-01', '2025-12-03')];
  assert.equal(yearlyLeaveLeft(lastYear, spl, 2026), 3);
  assert.equal(yearlyLeaveLeft([], wellness, 2026), 5);
});

test('wellness leave is 5 days a year, at most 3 days at a time', () => {
  assert.match(yearlyLeaveProblem(leave(wellness, '2026-11-09', '2026-11-12', 'Pending')), /at most 3 days at a time/);
  // A weekend in between does not count: Fri to Tue is 3 working days.
  assert.equal(yearlyLeaveProblem(leave(wellness, '2026-11-13', '2026-11-17', 'Pending')), null);
  const taken = [leave(wellness, '2026-02-02', '2026-02-04')];
  assert.equal(yearlyLeaveProblem(leave(wellness, '2026-11-09', '2026-11-10', 'Pending'), taken), null);
  assert.match(yearlyLeaveProblem(leave(wellness, '2026-11-09', '2026-11-11', 'Pending'), taken), /2 days left in 2026, and this asks for 3/);
});

test('a request submitted again does not count against itself', () => {
  const returned = leave(spl, '2026-11-09', '2026-11-11', 'Pending', 'REQ-1');
  assert.equal(yearlyLeaveProblem(returned, [returned]), null);
});

test('other leave has no yearly limit here', () => {
  assert.equal(yearlyLeaveProblem(leave('Vacation Leave', '2026-11-09', '2026-11-30', 'Pending')), null);
  assert.equal(yearlyLeaveLeft([], 'Sick Leave', 2026), null);
});
