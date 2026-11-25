import assert from 'node:assert/strict';
import test from 'node:test';
import { ON_LEAVE_NO_TIME_IN, ON_TRAVEL_NO_TIME_IN, approvedLeaveOn, approvedTravelOrderOn, noTimeInOn } from './travelStatus.js';

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

test('there is no Time In on a day of an approved Travel Order or of the employee\'s own approved leave', () => {
  const person = { employeeId: 'EMP-1', email: 'juan@dilg.gov.ph' };
  const travel = { id: 'TO-1', type: 'Travel Order', status: 'Approved', employeeId: 'EMP-1', startDate: '2026-11-10', endDate: '2026-11-12' };
  const companionTravel = { ...travel, id: 'TO-2', employeeId: 'EMP-9', companions: [{ employeeId: 'EMP-1', name: 'Juan' }] };
  const leave = { id: 'LV-1', type: 'Leave Request', status: 'Approved', employeeId: 'EMP-1', startDate: '2026-11-20', endDate: '2026-11-20' };

  assert.equal(noTimeInOn([travel], person, '2026-11-11').kind, 'travel');
  assert.equal(noTimeInOn([travel], person, '2026-11-11').error, ON_TRAVEL_NO_TIME_IN);
  assert.equal(noTimeInOn([companionTravel], person, '2026-11-12').request, companionTravel);
  assert.equal(noTimeInOn([leave], person, '2026-11-20').kind, 'leave');
  assert.equal(noTimeInOn([leave], person, '2026-11-20').error, ON_LEAVE_NO_TIME_IN);
  // A leave saved without an Employee ID is matched by email.
  assert.ok(noTimeInOn([{ ...leave, employeeId: '', employeeEmail: 'JUAN@dilg.gov.ph' }], person, '2026-11-20'));

  // Not approved, another day, or someone else's: Time In as usual.
  for (const status of ['Pending', 'For Pre-approval', 'For Supervisor', 'Returned', 'Rejected', 'Withdrawn']) {
    assert.equal(noTimeInOn([{ ...leave, status }, { ...travel, status }], person, '2026-11-20'), null, status);
  }
  assert.equal(noTimeInOn([travel, leave], person, '2026-11-13'), null);
  assert.equal(noTimeInOn([{ ...leave, employeeId: 'EMP-2' }, { ...travel, employeeId: 'EMP-2' }], person, '2026-11-11'), null);
  // The server passes only the employee's own requests, so it gives no person.
  assert.equal(noTimeInOn([{ ...leave, employeeId: undefined }], null, '2026-11-20').kind, 'leave');
  assert.equal(approvedLeaveOn([leave], '2026-11-20'), leave);
  assert.equal(approvedLeaveOn([travel], '2026-11-11'), null);
});
