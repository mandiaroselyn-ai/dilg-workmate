import assert from 'node:assert/strict';
import test from 'node:test';
import { employeesInServiceOn, employeesInServiceSince, inServiceOn, inServiceSince, normalizeSeparation, separationText } from './separation.js';

const active = { name: 'Ana', accountStatus: 'Active' };
const left = { name: 'Ben', accountStatus: 'Inactive', separationDate: '2026-11-15', separationReason: 'Resignation' };
const inactive = { name: 'Cora', accountStatus: 'Inactive' };
const pending = { name: 'Dan', accountStatus: 'Pending' };

test('an employee is in the service up to the day of separation', () => {
  assert.equal(inServiceOn(active, '2026-11-20'), true);
  assert.equal(inServiceOn(left, '2026-11-15'), true);
  assert.equal(inServiceOn(left, '2026-11-16'), false);
  // An Inactive account with no separation date, or one not yet approved, is not.
  assert.equal(inServiceOn(inactive, '2026-11-01'), false);
  assert.equal(inServiceOn(pending, '2026-11-01'), false);
  // In the service at some time from a day on.
  assert.equal(inServiceSince(left, '2026-11-01'), true);
  assert.equal(inServiceSince(left, '2026-12-01'), false);
  assert.deepEqual(employeesInServiceOn([active, left, inactive, pending], '2026-11-10').map(person => person.name), ['Ana', 'Ben']);
  assert.deepEqual(employeesInServiceSince([active, left, inactive, pending], '2026-12-01').map(person => person.name), ['Ana']);
});

test('the separation needs a real date from the hiring on and a cause from the list', () => {
  assert.deepEqual(normalizeSeparation({ separationDate: '2026-11-15', separationReason: 'Resignation' }, '2020-01-06').value,
    { separationDate: '2026-11-15', separationReason: 'Resignation' });
  // Both empty clears it.
  assert.deepEqual(normalizeSeparation({ separationDate: '', separationReason: '' }, '2020-01-06').value, { separationDate: '', separationReason: '' });
  assert.ok(normalizeSeparation({ separationDate: '2026-11-15', separationReason: '' }).error);
  assert.ok(normalizeSeparation({ separationDate: '', separationReason: 'Resignation' }).error);
  assert.ok(normalizeSeparation({ separationDate: '2026-02-30', separationReason: 'Resignation' }).error);
  assert.ok(normalizeSeparation({ separationDate: '2019-12-31', separationReason: 'Resignation' }, '2020-01-06').error);
  assert.ok(normalizeSeparation({ separationDate: '2026-11-15', separationReason: 'Went home' }).error);
  assert.equal(separationText(left), 'Nov 15, 2026 · Resignation');
  assert.equal(separationText(active), '');
});
