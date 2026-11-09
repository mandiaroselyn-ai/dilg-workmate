import assert from 'node:assert/strict';
import test from 'node:test';
import { attendanceWindowStart, formatManilaClockTime, getManilaDateString, msUntilManilaMidnight } from './localDate.js';

test('counts the time left until midnight in Manila', () => {
  // 11:59 PM in Manila is 15:59 UTC: one minute to go.
  assert.equal(msUntilManilaMidnight(Date.parse('2026-11-09T15:59:00Z')), 60 * 1000);
  // Midnight in Manila itself: a whole day until the next one.
  assert.equal(msUntilManilaMidnight(Date.parse('2026-11-09T16:00:00Z')), 24 * 60 * 60 * 1000);
  // 8:00 AM in Manila: 16 hours to go.
  assert.equal(msUntilManilaMidnight(Date.parse('2026-11-10T00:00:00Z')), 16 * 60 * 60 * 1000);
});

test('uses the Manila date for early-morning clock-ins', () => {
  // 7:45 AM on Sept 29 in Manila is still Sept 28 in UTC.
  assert.equal(getManilaDateString(new Date('2026-09-28T23:45:00Z')), '2026-09-29');
});

test('changes date at Manila midnight, not UTC midnight', () => {
  assert.equal(getManilaDateString(new Date('2026-09-29T15:59:59Z')), '2026-09-29');
  assert.equal(getManilaDateString(new Date('2026-09-29T16:00:00Z')), '2026-09-30');
});

test('formats DTR clock times in Manila time', () => {
  assert.equal(formatManilaClockTime(new Date('2026-09-29T00:05:00Z')), '08:05 AM');
  assert.equal(formatManilaClockTime(new Date('2026-09-29T04:30:00Z')), '12:30 PM');
  assert.equal(formatManilaClockTime(new Date('2026-09-29T09:45:00Z')), '05:45 PM');
  assert.equal(formatManilaClockTime(new Date('2026-09-28T16:10:00Z')), '12:10 AM');
});

test("HR's attendance starts on the first day of the previous month", () => {
  assert.equal(attendanceWindowStart('2026-10-01'), '2026-09-01');
  assert.equal(attendanceWindowStart('2026-10-31'), '2026-09-01');
  assert.equal(attendanceWindowStart('2027-01-15'), '2026-12-01');
});
