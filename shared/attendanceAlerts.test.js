import assert from 'node:assert/strict';
import test from 'node:test';
import { MISMATCH_ALERT_COUNT, mismatchesOn, shouldAlertOutside } from './attendanceAlerts.js';

const now = new Date('2026-11-24T02:00:00Z'); // 10:00 AM in Manila
const minutesAgo = minutes => new Date(now.getTime() - minutes * 60 * 1000);

test('HR is told once an employee on duty has been outside their area for 30 minutes', () => {
  const shift = { timeIn: '08:00 AM', outsideSince: minutesAgo(31), outsideAlertSentAt: null };
  assert.equal(shouldAlertOutside(shift, now), true);
  assert.equal(shouldAlertOutside({ ...shift, outsideSince: minutesAgo(10) }, now), false);
  // Told already, inside the area, out for lunch, or timed out: not again.
  assert.equal(shouldAlertOutside({ ...shift, outsideAlertSentAt: minutesAgo(1) }, now), false);
  assert.equal(shouldAlertOutside({ ...shift, outsideSince: null }, now), false);
  assert.equal(shouldAlertOutside({ ...shift, lunchOut: '12:01 PM', lunchIn: null }, now), false);
  assert.equal(shouldAlertOutside({ ...shift, lunchOut: '12:01 PM', lunchIn: '12:58 PM' }, now), true);
  assert.equal(shouldAlertOutside({ ...shift, timeOut: '04:00 PM' }, now), false);
});

test('selfie mismatches are counted for one Manila day', () => {
  const mismatch = at => ({ outcome: 'attendance-face-mismatch', timestamp: at });
  const audit = [
    mismatch('2026-11-23T15:30:00Z'), // 11:30 PM on Nov 23 in Manila
    mismatch('2026-11-23T16:30:00Z'), // 12:30 AM on Nov 24
    mismatch('2026-11-24T01:00:00Z'),
    { outcome: 'hr-approved-liveness-not-configured', timestamp: '2026-11-24T01:10:00Z' },
    mismatch('2026-11-24T01:20:00Z')
  ];
  assert.equal(mismatchesOn(audit, '2026-11-24'), MISMATCH_ALERT_COUNT);
  assert.equal(mismatchesOn(audit, '2026-11-23'), 1);
  assert.equal(mismatchesOn(undefined, '2026-11-24'), 0);
});
