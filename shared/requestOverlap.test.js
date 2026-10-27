import assert from 'node:assert/strict';
import test from 'node:test';
import { overlapMessage, overlappingRequest } from './requestOverlap.js';

const request = (type, id, startDate, endDate, status = 'Pending', employeeId = 'EMP-1') => ({ id, type, startDate, endDate, status, employeeId });
const leave = (...args) => request('Leave Request', ...args);
const travel = (...args) => request('Travel Order', ...args);
const filed = [
  leave('req-1', '2026-11-03', '2026-11-05'),
  leave('req-2', '2026-11-16', '2026-11-16', 'Approved'),
  leave('req-3', '2026-11-20', '2026-11-21', 'Rejected'),
  leave('req-4', '2026-11-24', '2026-11-25', 'Draft'),
  leave('req-5', '2026-11-26', '2026-11-27', 'Pending', 'EMP-2'),
  travel('req-6', '2026-11-10', '2026-11-11', 'Approved'),
  travel('req-7', '2026-11-30', '2026-11-30', 'Withdrawn')
];

test('a leave may not share a day with another submitted or approved leave of the same employee', () => {
  assert.equal(overlappingRequest(leave(undefined, '2026-11-05', '2026-11-06'), filed)?.id, 'req-1');
  assert.equal(overlappingRequest(leave(undefined, '2026-11-01', '2026-11-03'), filed)?.id, 'req-1');
  assert.equal(overlappingRequest(leave(undefined, '2026-11-04', '2026-11-04'), filed)?.id, 'req-1');
  assert.equal(overlappingRequest(leave(undefined, '2026-11-16', '2026-11-16'), filed)?.id, 'req-2');
  // The day after, or before, is free.
  assert.equal(overlappingRequest(leave(undefined, '2026-11-06', '2026-11-09'), filed), null);
  assert.equal(overlappingRequest(leave(undefined, '2026-11-02', '2026-11-02'), filed), null);
});

test('travel orders may not overlap each other or a leave', () => {
  assert.equal(overlappingRequest(travel(undefined, '2026-11-11', '2026-11-12'), filed)?.id, 'req-6');
  assert.equal(overlappingRequest(travel(undefined, '2026-11-05', '2026-11-05'), filed)?.id, 'req-1');
  assert.equal(overlappingRequest(leave(undefined, '2026-11-10', '2026-11-10'), filed)?.id, 'req-6');
  assert.equal(overlappingRequest(travel(undefined, '2026-11-12', '2026-11-13'), filed), null);
});

test('rejected, withdrawn, and draft requests, other employees\' requests, and the request itself do not count', () => {
  assert.equal(overlappingRequest(leave(undefined, '2026-11-20', '2026-11-20'), filed), null);
  assert.equal(overlappingRequest(leave(undefined, '2026-11-24', '2026-11-24'), filed), null);
  assert.equal(overlappingRequest(leave(undefined, '2026-11-26', '2026-11-26'), filed), null);
  assert.equal(overlappingRequest(travel(undefined, '2026-11-30', '2026-11-30'), filed), null);
  // Resubmitting req-1 itself is not an overlap with req-1.
  assert.equal(overlappingRequest(leave('req-1', '2026-11-03', '2026-11-04'), filed), null);
  // Other request types are not checked.
  assert.equal(overlappingRequest({ ...leave(undefined, '2026-11-04', '2026-11-04'), type: 'Certified Copy Request' }, filed), null);
});

test('the message names the request in the way, and how to fix it', () => {
  assert.match(overlapMessage(filed[0]), /a leave for Nov 3, 2026 to Nov 5, 2026 \(Ref req-1, Pending\).*withdraw that request first/);
  assert.match(overlapMessage(filed[1]), /a leave for Nov 16, 2026 \(Ref req-2, Approved\).*Choose other dates/);
  assert.match(overlapMessage(filed[5]), /a travel order for Nov 10, 2026 to Nov 11, 2026 \(Ref req-6, Approved\)/);
});
