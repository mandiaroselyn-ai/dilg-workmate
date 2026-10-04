import assert from 'node:assert/strict';
import test from 'node:test';
import { applyQueuedAttendance, isQueuedForOwner, shouldDiscardQueuedAttendance } from './offlineAttendance.js';

test('keeps queued attendance when the session is missing or expired', () => {
  assert.equal(shouldDiscardQueuedAttendance(401), false);
  assert.equal(shouldDiscardQueuedAttendance(403), false);
  assert.equal(shouldDiscardQueuedAttendance(429), false);
  assert.equal(shouldDiscardQueuedAttendance(500), false);
});

test('discards queued attendance the server rejects as invalid', () => {
  assert.equal(shouldDiscardQueuedAttendance(400), true);
  assert.equal(shouldDiscardQueuedAttendance(409), true);
});

test('only syncs queued attendance that belongs to the signed-in employee', () => {
  const item = { payload: { record: { employeeId: 'DILG-2026-1001', employeeEmail: 'Juan@dilg.gov.ph' } } };
  assert.equal(isQueuedForOwner(item, { employeeId: 'dilg-2026-1001' }), true);
  assert.equal(isQueuedForOwner(item, { email: 'juan@dilg.gov.ph' }), true);
  assert.equal(isQueuedForOwner(item, { employeeId: 'DILG-2026-2002', email: 'maria@dilg.gov.ph' }), false);
  assert.equal(isQueuedForOwner(item, {}), false);
});

test('a Time In and Time Out still waiting on the phone stay on a list reloaded from the server', () => {
  const timeIn = { id: 3, payload: { action: 'clock-in', record: { employeeId: 'E1', date: '2026-10-05', timeIn: '08:00 AM', timeOut: null, offlineTimeIn: { nonce: 'nonce-1' } } } };
  const timeOut = { id: 4, payload: { action: 'clock-out', record: { employeeId: 'E1', date: '2026-10-05', timeOut: '05:00 PM' } } };
  const yesterday = { id: 'att-1', employeeId: 'E1', date: '2026-10-04', timeIn: '08:00 AM', timeOut: '05:00 PM' };

  // The server does not have today's Time In yet.
  const shown = applyQueuedAttendance([yesterday], [timeIn, timeOut]);
  assert.deepEqual(shown.map(record => [record.id, record.timeIn, record.timeOut]), [
    ['offline-att-3', '08:00 AM', '05:00 PM'],
    ['att-1', '08:00 AM', '05:00 PM']
  ]);

  // The server has the Time In (the phone did not get the answer), but not the Time Out.
  const saved = { id: 'att-2', employeeId: 'E1', date: '2026-10-05', timeIn: '08:00 AM', timeOut: null, offlineTimeIn: { nonce: 'nonce-1' } };
  assert.deepEqual(applyQueuedAttendance([saved, yesterday], [timeIn, timeOut]).map(record => [record.id, record.timeOut]), [
    ['att-2', '05:00 PM'],
    ['att-1', '05:00 PM']
  ]);

  // Nothing waiting: the list is unchanged.
  assert.deepEqual(applyQueuedAttendance([yesterday], []), [yesterday]);
});
