import assert from 'node:assert/strict';
import test from 'node:test';
import { getManilaDateString } from './localDate.js';

test('uses the Manila date for early-morning clock-ins', () => {
  // 7:45 AM on Sept 29 in Manila is still Sept 28 in UTC.
  assert.equal(getManilaDateString(new Date('2026-09-28T23:45:00Z')), '2026-09-29');
});

test('changes date at Manila midnight, not UTC midnight', () => {
  assert.equal(getManilaDateString(new Date('2026-09-29T15:59:59Z')), '2026-09-29');
  assert.equal(getManilaDateString(new Date('2026-09-29T16:00:00Z')), '2026-09-30');
});
