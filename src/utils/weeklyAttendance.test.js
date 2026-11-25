import assert from 'node:assert/strict';
import test from 'node:test';
import { markDtrDay } from './hrAttendance.js';
import { recentWorkdays, weeklyAttendance } from './weeklyAttendance.js';

test('the last five working days skip weekends and office-wide holidays, not a town\'s', () => {
  // Thursday, Nov 26, 2026.
  assert.deepEqual(recentWorkdays('2026-11-26'), ['2026-11-20', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26']);
  assert.deepEqual(recentWorkdays('2026-11-26', [{ date: '2026-11-24' }]), ['2026-11-19', '2026-11-20', '2026-11-23', '2026-11-25', '2026-11-26']);
  assert.deepEqual(recentWorkdays('2026-11-26', [{ date: '2026-11-24', place: 'Boac' }]), ['2026-11-20', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26']);
  // A Sunday counts back from the Friday.
  assert.deepEqual(recentWorkdays('2026-11-29').at(-1), '2026-11-27');
});

test('each day counts the employees by how the day went, and today\'s not-yet-in apart', () => {
  const ana = { employeeId: 'E1', name: 'Ana Reyes', accountStatus: 'Active', dateHired: '2020-01-06' };
  const ben = { employeeId: 'E2', name: 'Ben Cruz', accountStatus: 'Active', dateHired: '2020-01-06' };
  const cy = { employeeId: 'E3', name: 'Cy Santos', accountStatus: 'Active', dateHired: '2026-11-25' };
  const requests = [{ type: 'Leave Request', employeeId: 'E2', startDate: '2026-11-23', endDate: '2026-11-23', status: 'Approved' }];
  const records = [
    // Monday Nov 23 (7:00 AM to 4:00 PM): Ana on time; Ben on leave.
    { employeeId: 'E1', employeeName: 'Ana Reyes', date: '2026-11-23', timeIn: '06:55 AM', timeOut: '04:00 PM' },
    // Tuesday: Ana late; Ben none (absent).
    { employeeId: 'E1', employeeName: 'Ana Reyes', date: '2026-11-24', timeIn: '09:20 AM', timeOut: '06:20 PM', late: true },
    // Thursday (today): Ana in.
    { employeeId: 'E1', employeeName: 'Ana Reyes', date: '2026-11-26', timeIn: '08:00 AM' }
  ].map(record => markDtrDay(record, { requests }));
  const days = weeklyAttendance({ employees: [ana, ben, cy], records, requests, today: '2026-11-26', minutes: 10 * 60 });
  const of = date => days.find(day => day.date === date);
  assert.deepEqual(days.map(day => day.date), ['2026-11-20', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26']);
  assert.deepEqual(of('2026-11-23'), { date: '2026-11-23', onTime: 1, late: 0, absent: 0, away: 1, notIn: 0, total: 2 });
  assert.deepEqual(of('2026-11-24'), { date: '2026-11-24', onTime: 0, late: 1, absent: 1, away: 0, notIn: 0, total: 2 });
  // Cy was hired on the 25th: counted from then.
  assert.equal(of('2026-11-25').total, 3);
  // Today at 10:00 AM, those not in yet are not absent.
  assert.deepEqual(of('2026-11-26'), { date: '2026-11-26', onTime: 1, late: 0, absent: 0, away: 0, notIn: 2, total: 3 });
});
