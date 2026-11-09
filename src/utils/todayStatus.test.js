import assert from 'node:assert/strict';
import test from 'node:test';
import { todayStatus } from './todayStatus.js';

const leave = (startDate, endDate, status = 'Approved') => ({ type: 'Leave Request', status, startDate, endDate });
const travel = (startDate, endDate) => ({ type: 'Travel Order', status: 'Approved', startDate, endDate });

test('a leave says the day it ends, counting the leaves right after it', () => {
  const requests = [leave('2026-11-06', '2026-11-09'), leave('2026-11-10', '2026-11-10'), leave('2026-11-13', '2026-11-16')];
  assert.deepEqual(todayStatus({ requests, today: '2026-11-09' }), { kind: 'on-leave', text: 'On Leave · until Nov 10' });
  assert.deepEqual(todayStatus({ requests, today: '2026-11-10' }), { kind: 'on-leave', text: 'On Leave today' });
  assert.equal(todayStatus({ requests, today: '2026-11-11' }), null);
});

test('a leave goes on across a weekend or holiday when another leave follows it', () => {
  assert.equal(todayStatus({ requests: [leave('2026-11-06', '2026-11-06'), leave('2026-11-09', '2026-11-09')], today: '2026-11-06' }).text, 'On Leave · until Nov 9');
  assert.equal(todayStatus({ requests: [leave('2026-11-06', '2026-11-06')], today: '2026-11-06' }).text, 'On Leave today');
  const holidays = [{ date: '2026-11-02' }];
  assert.equal(todayStatus({ requests: [leave('2026-10-30', '2026-10-30'), leave('2026-11-03', '2026-11-04')], today: '2026-10-30', holidays }).text, 'On Leave · until Nov 4');
});

test('only an approved leave counts', () => {
  for (const status of ['Pending', 'For Supervisor', 'Returned', 'Rejected', 'Withdrawn']) {
    assert.equal(todayStatus({ requests: [leave('2026-11-09', '2026-11-09', status)], today: '2026-11-09' }), null);
  }
});

test('a leave no longer shows once the employee timed in that day', () => {
  const requests = [leave('2026-11-10', '2026-11-12')];
  const onTime = { date: '2026-11-10', timeIn: '08:30 AM' };
  assert.equal(todayStatus({ requests, attendanceHistory: [onTime], today: '2026-11-10' }), null);
  assert.deepEqual(todayStatus({ requests, attendanceHistory: [{ ...onTime, timeIn: '09:12 AM', late: true }], today: '2026-11-10' }), { kind: 'late', text: 'Late today · 12 min' });
  // A Time In HR refused, or a day HR set to Absent, is not a return to work.
  assert.equal(todayStatus({ requests, attendanceHistory: [{ ...onTime, offlineTimeIn: { reviewReasons: ['gps'], decision: 'rejected' } }], today: '2026-11-10' }).kind, 'on-leave');
  assert.equal(todayStatus({ requests, attendanceHistory: [{ ...onTime, status: 'Absent' }], today: '2026-11-10' }).kind, 'on-leave');
});

test('a Travel Order says the day it ends, and a leave comes first', () => {
  assert.deepEqual(todayStatus({ requests: [travel('2026-11-10', '2026-11-12')], today: '2026-11-10' }), { kind: 'on-travel', text: 'On Travel · until Nov 12' });
  assert.equal(todayStatus({ requests: [travel('2026-11-10', '2026-11-12'), leave('2026-11-10', '2026-11-10')], today: '2026-11-10' }).kind, 'on-leave');
});

test('a late day says how late, or just Late today when HR set it', () => {
  assert.equal(todayStatus({ attendanceHistory: [{ date: '2026-11-10', timeIn: '08:30 AM', status: 'Late' }], today: '2026-11-10' }).text, 'Late today');
  assert.equal(todayStatus({ attendanceHistory: [{ date: '2026-11-09', timeIn: '07:40 AM', late: true }], today: '2026-11-10' }), null);
});
