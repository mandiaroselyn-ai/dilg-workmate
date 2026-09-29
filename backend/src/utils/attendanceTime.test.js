import assert from 'node:assert/strict';
import test from 'node:test';
import { isLateClockIn } from './attendanceTime.js';

// Manila is UTC+8, so 00:00Z is 8:00 AM in Manila.
test('a Time In at or before 8:00 AM Manila time is on time', () => {
  assert.equal(isLateClockIn(new Date('2026-09-28T23:45:00Z'), '08:00'), false);
  assert.equal(isLateClockIn(new Date('2026-09-29T00:00:00Z'), '08:00'), false);
});

test('a Time In after 8:00 AM Manila time is late', () => {
  assert.equal(isLateClockIn(new Date('2026-09-29T00:01:00Z'), '08:00'), true);
});

test('uses the configured office start time and falls back to 08:00 when it is invalid', () => {
  assert.equal(isLateClockIn(new Date('2026-09-29T00:30:00Z'), '09:00'), false);
  assert.equal(isLateClockIn(new Date('2026-09-29T00:30:00Z'), 'nine'), true);
});
