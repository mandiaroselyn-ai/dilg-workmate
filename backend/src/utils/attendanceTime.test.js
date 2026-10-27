import assert from 'node:assert/strict';
import test from 'node:test';
import { clockTextMinutes, isLateClockIn, isLateLunchIn, isLateTimeText, resolveTimeOutMoment } from './attendanceTime.js';

// Manila is UTC+8, so 00:00Z is 8:00 AM in Manila.
test('a Time In at or before 8:00 AM Manila time is on time', () => {
  assert.equal(isLateClockIn(new Date('2026-09-28T23:45:00Z'), '08:00'), false);
  assert.equal(isLateClockIn(new Date('2026-09-29T00:00:00Z'), '08:00'), false);
});

test('a Time In after 8:00 AM Manila time is late', () => {
  assert.equal(isLateClockIn(new Date('2026-09-29T00:01:00Z'), '08:00'), true);
});

test('uses the given office start time and falls back to the office hours\' 7:00 AM when it is invalid', () => {
  assert.equal(isLateClockIn(new Date('2026-09-29T00:30:00Z'), '09:00'), false);
  assert.equal(isLateClockIn(new Date('2026-09-29T00:30:00Z'), 'nine'), true);
});

test('a Time In from noon on starts a half day, late only after 1:00 PM', () => {
  // 04:50Z is 12:50 PM in Manila; 05:20Z is 1:20 PM.
  assert.equal(isLateClockIn(new Date('2026-09-29T04:50:00Z')), false);
  assert.equal(isLateClockIn(new Date('2026-09-29T05:20:00Z')), true);
  assert.equal(isLateTimeText('12:50 PM'), false);
  assert.equal(isLateTimeText('01:00 PM'), false);
  assert.equal(isLateTimeText('01:20 PM'), true);
});

test('back from lunch after 1:00 PM is late', () => {
  assert.equal(isLateLunchIn('12:58 PM'), false);
  assert.equal(isLateLunchIn('01:00 PM'), false);
  assert.equal(isLateLunchIn('01:15 PM'), true);
  assert.equal(isLateLunchIn('soon'), null);
});

test('by default, a Time In is late after 7:00 AM, the start of the office hours', () => {
  // 23:00Z is 7:00 AM in Manila.
  assert.equal(isLateClockIn(new Date('2026-09-28T23:00:00Z')), false);
  assert.equal(isLateClockIn(new Date('2026-09-28T23:01:00Z')), true);
  assert.equal(isLateTimeText('07:00 AM'), false);
  assert.equal(isLateTimeText('07:05 AM'), true);
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
