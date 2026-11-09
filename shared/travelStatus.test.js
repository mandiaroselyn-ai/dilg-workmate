import assert from 'node:assert/strict';
import test from 'node:test';
import { approvedTravelOrderOn } from './travelStatus.js';

const travel = { id: 'TO-1', type: 'Travel Order', status: 'Approved', startDate: '2026-11-10', endDate: '2026-11-12' };

test('an approved Travel Order covers each of its days', () => {
  assert.equal(approvedTravelOrderOn([travel], '2026-11-10'), travel);
  assert.equal(approvedTravelOrderOn([travel], '2026-11-12'), travel);
  assert.equal(approvedTravelOrderOn([travel], '2026-11-13'), null);
  assert.equal(approvedTravelOrderOn([travel], '2026-11-09'), null);
  // A one-day order may have no end date, and dates may be saved with a time.
  const oneDay = { ...travel, endDate: '' };
  assert.equal(approvedTravelOrderOn([oneDay], '2026-11-10'), oneDay);
  assert.equal(approvedTravelOrderOn([oneDay], '2026-11-11'), null);
  assert.ok(approvedTravelOrderOn([{ ...travel, startDate: '2026-11-10T00:00:00.000Z', endDate: '2026-11-12T00:00:00.000Z' }], '2026-11-11'));
});

test('only an approved Travel Order counts, not a pending or disapproved one, or a leave', () => {
  for (const status of ['Pending', 'Returned', 'Rejected', 'Disapproved']) {
    assert.equal(approvedTravelOrderOn([{ ...travel, status }], '2026-11-11'), null, status);
  }
  assert.equal(approvedTravelOrderOn([{ ...travel, type: 'Leave Request' }], '2026-11-11'), null);
  assert.equal(approvedTravelOrderOn(undefined, '2026-11-11'), null);
});

test('a Travel Order covers the one who filed it and the employees it includes', async () => {
  const { travelOrderCovers, companionNames } = await import('./travelStatus.js');
  const order = { type: 'Travel Order', employeeId: 'E1', employeeEmail: 'juan@dilg.gov.ph', companions: [{ employeeId: 'E7', name: 'Maria Santos' }, { employeeId: 'E9', name: 'Pedro Cruz' }] };
  assert.equal(travelOrderCovers(order, { employeeId: 'E1' }), true);
  assert.equal(travelOrderCovers(order, { email: 'JUAN@dilg.gov.ph' }), true);
  assert.equal(travelOrderCovers(order, { employeeId: 'e7' }), true);
  assert.equal(travelOrderCovers(order, { employeeId: 'E8' }), false);
  // A leave covers nobody else.
  assert.equal(travelOrderCovers({ ...order, type: 'Leave Request' }, { employeeId: 'E7' }), false);
  assert.equal(companionNames(order), 'Maria Santos, Pedro Cruz');
  assert.equal(companionNames({}), '');
});
