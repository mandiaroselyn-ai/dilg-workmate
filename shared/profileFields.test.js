import assert from 'node:assert/strict';
import test from 'node:test';
import { APPOINTMENT_STATUS_OPTIONS, EMPLOYMENT_FIELDS, earnsLeaveCredits, readProfileFields } from './profileFields.js';

test('the status of appointment is one of the CSC statuses DILG issues, or a contract of service or job order', () => {
  assert.deepEqual(APPOINTMENT_STATUS_OPTIONS, [
    'Permanent', 'Temporary', 'Coterminous', 'Contractual', 'Casual', 'Substitute',
    'Contract of Service', 'Job Order'
  ]);
  assert.match(readProfileFields({ appointmentStatus: 'Provisional' }, EMPLOYMENT_FIELDS).error, /from the list/);
  assert.deepEqual(readProfileFields({ appointmentStatus: ' Casual ' }, EMPLOYMENT_FIELDS).value, { appointmentStatus: 'Casual' });
  assert.deepEqual(readProfileFields({ appointmentStatus: '' }, EMPLOYMENT_FIELDS).value, { appointmentStatus: '' });
  assert.match(readProfileFields({ appointmentStatus: 'Regular' }, EMPLOYMENT_FIELDS).error, /from the list/);
});

test('contract of service and job order workers earn no leave credits; everyone else does', () => {
  assert.equal(earnsLeaveCredits({ appointmentStatus: 'Contract of Service' }), false);
  assert.equal(earnsLeaveCredits({ appointmentStatus: 'Job Order' }), false);
  for (const appointmentStatus of ['Permanent', 'Temporary', 'Casual', 'Contractual', '']) {
    assert.equal(earnsLeaveCredits({ appointmentStatus }), true, appointmentStatus);
  }
  assert.equal(earnsLeaveCredits({}), true);
});
