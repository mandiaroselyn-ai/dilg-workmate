import assert from 'node:assert/strict';
import test from 'node:test';
import { clockTextMinutes, isLateClockIn, isLateTimeText, resolveTimeOutMoment } from './attendanceTime.js';

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

test('reads a saved clock time such as "08:05 AM"', () => {
  assert.equal(clockTextMinutes('08:05 AM'), 485);
  assert.equal(clockTextMinutes('12:00 AM'), 0);
  assert.equal(clockTextMinutes('12:30 PM'), 750);
  assert.equal(clockTextMinutes('5:00 pm'), 1020);
  assert.equal(clockTextMinutes('13:00 PM'), null);
  assert.equal(clockTextMinutes('00:10 AM'), null);
  assert.equal(clockTextMinutes('08:05'), null);
});

test('a corrected Time In is late after the office start time', () => {
  assert.equal(isLateTimeText('08:00 AM', '08:00'), false);
  assert.equal(isLateTimeText('08:01 AM', '08:00'), true);
  assert.equal(isLateTimeText('08:30 AM', '09:00'), false);
  assert.equal(isLateTimeText('not a time', '08:00'), null);
});
