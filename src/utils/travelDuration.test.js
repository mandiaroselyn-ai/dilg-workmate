import assert from 'node:assert/strict';
import test from 'node:test';
import { travelDayCount, travelDurationLabel } from './travelDuration.js';

test('a travel order covers its activity date through its return date', () => {
  assert.equal(travelDayCount('2026-10-05', '2026-10-07'), 3);
  assert.equal(travelDayCount('2026-10-05', '2026-10-05'), 1);
  // Across a month end, and a weekend counts too.
  assert.equal(travelDayCount('2026-10-30', '2026-11-02'), 4);
  assert.equal(travelDurationLabel({ startDate: '2026-10-05', endDate: '2026-10-07' }), '3 days');
  assert.equal(travelDurationLabel({ startDate: '2026-10-05', endDate: '2026-10-05' }), '1 day');
});

test('a travel order without a return date covers its activity date only', () => {
  assert.equal(travelDayCount('2026-10-05', ''), 1);
  assert.equal(travelDurationLabel({ startDate: '2026-10-05' }), '1 day');
});

test('missing or reversed dates give no duration', () => {
  assert.equal(travelDayCount('', '2026-10-05'), 0);
  assert.equal(travelDayCount('2026-10-07', '2026-10-05'), 0);
  assert.equal(travelDurationLabel({}), '');
});
