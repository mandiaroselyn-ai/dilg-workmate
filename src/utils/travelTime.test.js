import assert from 'node:assert/strict';
import test from 'node:test';
import { readTravelTime, travelTimeProblem, travelTimeText } from './travelTime.js';
import { formatTravelTime } from './travelOrderForm.js';

test('the two clocks make the activity time the Travel Order prints', () => {
  assert.equal(travelTimeText('08:00', '17:00'), '8:00 AM - 5:00 PM');
  assert.equal(travelTimeText('12:00', '13:30'), '12:00 PM - 1:30 PM');
  assert.equal(travelTimeText('00:15', ''), '12:15 AM -');
  assert.equal(travelTimeText('', ''), '');
  assert.equal(formatTravelTime(travelTimeText('08:00', '17:00')), '8:00 a.m. to 5:00 p.m.');
});

test('an activity time already written is read back into the clocks', () => {
  assert.deepEqual(readTravelTime('8:00 AM - 5:00 PM'), { from: '08:00', to: '17:00' });
  assert.deepEqual(readTravelTime('8:00 a.m. to 5:00 p.m.'), { from: '08:00', to: '17:00' });
  assert.deepEqual(readTravelTime('9 am - 12 nn'), { from: '09:00', to: '' });
  assert.deepEqual(readTravelTime('8:00 AM -'), { from: '08:00', to: '' });
  assert.deepEqual(readTravelTime('whole day'), { from: '', to: '' });
});

test('an activity time needs a start and a later end', () => {
  assert.equal(travelTimeProblem('8:00 AM - 5:00 PM'), '');
  assert.match(travelTimeProblem('8:00 AM -'), /starts and ends/);
  assert.match(travelTimeProblem('whole day'), /starts and ends/);
  assert.equal(travelTimeProblem('5:00 PM - 8:00 AM'), 'The Activity Time must end after it starts.');
  assert.equal(travelTimeProblem('8:00 AM - 8:00 AM'), 'The Activity Time must end after it starts.');
});
