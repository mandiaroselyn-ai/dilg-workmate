import assert from 'node:assert/strict';
import test from 'node:test';
import { isLateClockIn, resolveTimeOutMoment } from './attendanceTime.js';

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

test('an online Time Out uses the server clock, not the phone', () => {
  const now = new Date('2026-09-29T09:00:00Z');
  assert.equal(resolveTimeOutMoment({ now, timeInAt: '2026-09-29T00:00:00Z' }).toISOString(), now.toISOString());
});

test('an offline Time Out keeps its recorded time within the shift', () => {
  const now = new Date('2026-09-29T11:00:00Z');
  const timeInAt = '2026-09-29T00:00:00Z';
  assert.equal(resolveTimeOutMoment({ now, timeInAt, recordedOfflineAt: '2026-09-29T09:00:00Z' }).toISOString(), '2026-09-29T09:00:00.000Z');
  assert.equal(resolveTimeOutMoment({ now, timeInAt, recordedOfflineAt: '2026-09-29T15:00:00Z' }).toISOString(), now.toISOString());
  assert.equal(resolveTimeOutMoment({ now, timeInAt, recordedOfflineAt: '2026-09-28T20:00:00Z' }).toISOString(), '2026-09-29T00:00:00.000Z');
  assert.equal(resolveTimeOutMoment({ now, timeInAt, recordedOfflineAt: 'not a date' }).toISOString(), now.toISOString());
});
