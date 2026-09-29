import assert from 'node:assert/strict';
import test from 'node:test';
import { isQueuedForOwner, shouldDiscardQueuedAttendance } from './offlineAttendance.js';

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
