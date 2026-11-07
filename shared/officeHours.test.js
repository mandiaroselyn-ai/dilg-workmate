import assert from 'node:assert/strict';
import test from 'node:test';
import { daySchedule, isFixedHoursDay, workdayEnd } from './officeHours.js';

const MONDAY = '2026-11-09';
const TUESDAY = '2026-11-10';
const FRIDAY = '2026-11-13';
const at = (hour, minute = 0) => hour * 60 + minute;

test('Monday has fixed hours: in by 7:00 AM, out at 4:00 PM', () => {
  assert.equal(isFixedHoursDay(MONDAY), true);
  assert.equal(isFixedHoursDay(TUESDAY), false);
  for (const arrival of [null, at(6, 45), at(7), at(7, 30)]) {
    assert.deepEqual(daySchedule(MONDAY, arrival), { lateAfter: at(7), start: at(7), end: at(16) }, String(arrival));
  }
});

test('Tuesday to Friday, the eight hours count from the arrival between 7:00 and 9:00 AM', () => {
  assert.deepEqual(daySchedule(TUESDAY, at(8, 15)), { lateAfter: at(9), start: at(8, 15), end: at(17, 15) });
  assert.deepEqual(daySchedule(FRIDAY, at(9)), { lateAfter: at(9), start: at(9), end: at(18) });
  // Coming before 7:00 AM counts from 7:00; after 9:00 AM is late, and the day still ends at 6:00 PM.
  assert.deepEqual(daySchedule(TUESDAY, at(6, 30)), { lateAfter: at(9), start: at(7), end: at(16) });
  assert.deepEqual(daySchedule(TUESDAY, at(9, 40)), { lateAfter: at(9), start: at(9), end: at(18) });
  // Before Time In, the day can still end as early as 4:00 PM.
  assert.equal(daySchedule(TUESDAY).end, at(16));
});

test('an afternoon-only half day starts at 1:00 PM', () => {
  assert.deepEqual(daySchedule(TUESDAY, at(12, 50)), { lateAfter: at(13), start: at(13), end: at(17) });
  assert.deepEqual(daySchedule(MONDAY, at(13, 10)), { lateAfter: at(13), start: at(13), end: at(16) });
});

test('eight working hours end after the lunch break', () => {
  assert.equal(workdayEnd(at(7)), at(16));
  assert.equal(workdayEnd(at(9)), at(18));
});
