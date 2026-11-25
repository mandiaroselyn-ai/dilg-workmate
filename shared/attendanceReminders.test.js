import assert from 'node:assert/strict';
import test from 'node:test';
import { attendanceReminderFor, clockLabel, reminderWindowOpen } from './attendanceReminders.js';

// 2026-11-30 is a Monday, 2026-12-01 a Tuesday, 2026-11-28 a Saturday.
const MONDAY = '2026-11-30';
const TUESDAY = '2026-12-01';
const SATURDAY = '2026-11-28';
const at = (hour, minute = 0) => hour * 60 + minute;
const kindAt = (date, minutes, log = null) => attendanceReminderFor({ date, minutes, log })?.kind || null;
const inAt = (hour, minute = 0, punches = {}) => ({ arrival: at(hour, minute), lunchOut: false, lunchIn: false, timeOut: false, ...punches });

test('Time In: from 6:30 to 7:00 AM on Monday, from 8:30 to 9:00 AM on Tuesday to Friday', () => {
  assert.equal(kindAt(MONDAY, at(6, 29)), null);
  assert.equal(kindAt(MONDAY, at(6, 30)), 'time-in');
  assert.equal(kindAt(MONDAY, at(7, 0)), 'time-in');
  assert.equal(kindAt(MONDAY, at(7, 1)), null);
  assert.match(attendanceReminderFor({ date: MONDAY, minutes: at(6, 40) }).message, /7:00 AM/);

  assert.equal(kindAt(TUESDAY, at(6, 30)), null);
  assert.equal(kindAt(TUESDAY, at(8, 30)), 'time-in');
  assert.equal(kindAt(TUESDAY, at(9, 0)), 'time-in');
  assert.equal(kindAt(TUESDAY, at(9, 5)), null);
  assert.match(attendanceReminderFor({ date: TUESDAY, minutes: at(8, 40) }).message, /9:00 AM/);
});

test('no Time In reminder once timed in, and nothing on a rest day', () => {
  assert.equal(kindAt(TUESDAY, at(8, 40), inAt(7, 50)), null);
  assert.equal(kindAt(SATURDAY, at(8, 40)), null);
  assert.equal(reminderWindowOpen(SATURDAY, at(12, 0)), false);
});

test('Lunch Out from 12:00 NN, Lunch In from 12:45 PM, each only while still due', () => {
  assert.equal(kindAt(TUESDAY, at(12, 0), inAt(8)), 'lunch-out');
  assert.equal(kindAt(TUESDAY, at(12, 10), inAt(8, 0, { lunchOut: true })), null);
  assert.equal(kindAt(TUESDAY, at(11, 59), inAt(8)), null);
  // An afternoon-only shift has no lunch break.
  assert.equal(kindAt(TUESDAY, at(12, 5), inAt(12, 3)), null);

  assert.equal(kindAt(TUESDAY, at(12, 45), inAt(8, 0, { lunchOut: true })), 'lunch-in');
  assert.equal(kindAt(TUESDAY, at(13, 0), inAt(8, 0, { lunchOut: true })), 'lunch-in');
  assert.equal(kindAt(TUESDAY, at(13, 1), inAt(8, 0, { lunchOut: true })), null);
  assert.equal(kindAt(TUESDAY, at(12, 50), inAt(8, 0, { lunchOut: true, lunchIn: true })), null);
  // Not yet out for lunch at 12:45: no Lunch In reminder, and the Lunch Out one has passed.
  assert.equal(kindAt(TUESDAY, at(12, 50), inAt(8)), null);
});

test('Time Out from 15 minutes before the eight hours end, up to an hour after', () => {
  const done = { lunchOut: true, lunchIn: true };
  // Tuesday, in at 7:23 AM: the day ends at 4:23 PM.
  assert.equal(kindAt(TUESDAY, at(16, 7), inAt(7, 23, done)), null);
  assert.equal(kindAt(TUESDAY, at(16, 8), inAt(7, 23, done)), 'time-out');
  assert.match(attendanceReminderFor({ date: TUESDAY, minutes: at(16, 15), log: inAt(7, 23, done) }).message, /4:23 PM/);
  assert.equal(kindAt(TUESDAY, at(17, 23), inAt(7, 23, done)), 'time-out');
  assert.equal(kindAt(TUESDAY, at(17, 24), inAt(7, 23, done)), null);
  // Monday ends at 4:00 PM whatever the arrival; a late Tuesday ends at 6:00 PM.
  assert.match(attendanceReminderFor({ date: MONDAY, minutes: at(15, 50), log: inAt(6, 50, done) }).message, /4:00 PM/);
  assert.match(attendanceReminderFor({ date: TUESDAY, minutes: at(17, 50), log: inAt(9, 30, done) }).message, /6:00 PM/);
  // Already timed out.
  assert.equal(kindAt(TUESDAY, at(16, 15), inAt(7, 23, { ...done, timeOut: true })), null);
});

test('the scheduled runs fall inside the reminder windows', () => {
  assert.equal(reminderWindowOpen(MONDAY, at(6, 30)), true);
  assert.equal(reminderWindowOpen(TUESDAY, at(8, 30)), true);
  assert.equal(reminderWindowOpen(TUESDAY, at(10, 0)), false);
  assert.equal(reminderWindowOpen(TUESDAY, at(12, 0)), true);
  assert.equal(reminderWindowOpen(TUESDAY, at(12, 45)), true);
  assert.equal(reminderWindowOpen(TUESDAY, at(15, 45)), true);
  assert.equal(reminderWindowOpen(TUESDAY, at(18, 45)), true);
  assert.equal(reminderWindowOpen(TUESDAY, at(19, 5)), false);
  assert.equal(clockLabel(at(16, 5)), '4:05 PM');
  assert.equal(clockLabel(at(12, 0)), '12:00 PM');
});
