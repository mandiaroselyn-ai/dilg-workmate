import assert from 'node:assert/strict';
import test from 'node:test';
import { DILG_OFFICE_GROUPS, DILG_OFFICES, DESIGNATIONS, POSITION_TITLES, isPhilippineMobile, isSignUpApproval, missingApprovalDetails, officeError } from './dilgAssignments.js';

test('the offices are the provincial office\'s sections and units and the MLGOO of each town, by cluster', () => {
  const group = label => DILG_OFFICE_GROUPS.find(item => item.label === label).offices;
  for (const unit of ['Office of the Provincial Director', 'LGCDS', 'LGMES', 'FAS', 'ICT Unit', 'PPDMU']) {
    assert.ok(group('Provincial Office').some(office => office.includes(unit)), unit);
  }
  assert.deepEqual(group('Cluster 1'), ['Office of the MLGOO - Boac', 'Office of the MLGOO - Gasan', 'Office of the MLGOO - Mogpog']);
  assert.deepEqual(group('Cluster 2'), ['Office of the MLGOO - Buenavista', 'Office of the MLGOO - Santa Cruz', 'Office of the MLGOO - Torrijos']);
  assert.equal(DILG_OFFICES.length, 12);
});

test('the staff list\'s positions are offered in full, and designations are not position titles', () => {
  for (const title of ['Local Government Operations Officer II', 'Local Government Operations Officer VII', 'Administrative Assistant II', 'Information Systems Analyst I', 'Engineer III']) {
    assert.ok(POSITION_TITLES.includes(title), title);
  }
  for (const designation of DESIGNATIONS) assert.equal(POSITION_TITLES.includes(designation), false, designation);
});

test('a new office must be listed, but an account keeps the office it was saved with', () => {
  assert.equal(officeError('Office of the MLGOO - Gasan'), '');
  assert.match(officeError('Gasan'), /from the list/);
  assert.equal(officeError('Gasan', 'Gasan'), '');
  // A blank office is reported as required elsewhere.
  assert.equal(officeError(''), '');
});

test('mobile numbers are 09XXXXXXXXX or +639XXXXXXXXX, with spaces or dashes', () => {
  for (const number of ['09171234567', '0917 123 4567', '+63 917-123-4567', '639171234567']) assert.equal(isPhilippineMobile(number), true, number);
  for (const number of ['', '(042) 332 1234', '0917123456', '9171234567']) assert.equal(isPhilippineMobile(number), false, number);
});

test('a sign-up lists what HR must fill in before approving it', () => {
  assert.deepEqual(missingApprovalDetails({}), ['position title', 'office', 'mobile number', 'date hired', 'status of appointment']);
  assert.deepEqual(missingApprovalDetails({
    role: 'Administrative Aide IV', office: 'Office of the MLGOO - Boac', phoneNumber: '0917 123 4567', dateHired: '2026-10-16', appointmentStatus: 'Job Order'
  }), []);
  assert.deepEqual(missingApprovalDetails({
    role: 'Administrative Aide IV', office: 'Office of the MLGOO - Boac', phoneNumber: '0917 123 4567', dateHired: '2026-02-30', appointmentStatus: 'Casual'
  }), ['date hired']);
});

test('only a Pending or Rejected sign-up saved as Active is an approval', () => {
  assert.equal(isSignUpApproval({ accountStatus: 'Pending' }, 'Active'), true);
  assert.equal(isSignUpApproval({ accountStatus: 'Rejected' }, 'Active'), true);
  assert.equal(isSignUpApproval({ accountStatus: 'Inactive' }, 'Active'), false);
  assert.equal(isSignUpApproval({ accountStatus: 'Pending' }, 'Rejected'), false);
  assert.equal(isSignUpApproval(null, 'Active'), false);
});
