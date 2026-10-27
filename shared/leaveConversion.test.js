import assert from 'node:assert/strict';
import test from 'node:test';
import { minutesToLeaveDays } from './leaveConversion.js';

test('minutes convert to days as the CSC table writes them', () => {
  // Values from the CSC conversion table (8-hour day).
  const table = { 1: 0.002, 5: 0.010, 6: 0.012, 7: 0.015, 10: 0.021, 15: 0.031, 18: 0.037, 20: 0.042, 30: 0.062, 45: 0.094, 59: 0.123, 60: 0.125 };
  for (const [minutes, days] of Object.entries(table)) {
    assert.equal(minutesToLeaveDays(Number(minutes)), days, `${minutes} minutes`);
  }
});

test('hours and minutes add up, and nothing is charged for no minutes', () => {
  assert.equal(minutesToLeaveDays(135), 0.281); // 2 hours (0.250) and 15 minutes (0.031)
  assert.equal(minutesToLeaveDays(480), 1);
  assert.equal(minutesToLeaveDays(0), 0);
  assert.equal(minutesToLeaveDays(-5), 0);
});
