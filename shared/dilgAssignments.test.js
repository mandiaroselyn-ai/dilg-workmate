import assert from 'node:assert/strict';
import test from 'node:test';
import { DILG_OFFICE_GROUPS, DILG_OFFICES, DESIGNATIONS, POSITION_TITLES, POSITION_TITLE_GROUPS, isPhilippineMobile, isSignUpApproval, missingApprovalDetails, officeError } from './dilgAssignments.js';

test('the offices are the provincial office\'s sections and units and the MLGOO of each town, by cluster', () => {
  const group = label => DILG_OFFICE_GROUPS.find(item => item.label === label).offices;
  for (const unit of ['Office of the Provincial Director', 'LGCDS', 'LGMES', 'FAS', 'ICT Unit', 'PPDMU']) {
    assert.ok(group('Provincial Office').some(office => office.includes(unit)), unit);
  }
  assert.deepEqual(group('Cluster 1'), ['Office of the MLGOO - Boac', 'Office of the MLGOO - Gasan', 'Office of the MLGOO - Mogpog']);
  assert.deepEqual(group('Cluster 2'), ['Office of the MLGOO - Buenavista', 'Office of the MLGOO - Santa Cruz', 'Office of the MLGOO - Torrijos']);
  assert.equal(DILG_OFFICES.length, 12);
});

test('the staff list\'s positions are offered exactly as it writes them, then the other ranks', () => {
  const [staffList, otherRanks] = POSITION_TITLE_GROUPS;
  assert.deepEqual(staffList.titles, [
    'Provincial Director', 'Assistant Provincial Director',
    'LGOO VII / Cluster Head', 'LGOO VI / Program Manager', 'LGOO V / LGCDS Chief', 'LGOO II / LGMES Chief', 'LGOO II',
    'MLGOO', 'MLGOO / Cluster Team Leader',
    'ADAS II (Chief)', 'ADAS II', 'ISA I', 'Engineer III', 'Job Order (Utility)', 'Job Order (Driver)'
  ]);
  for (const title of ['LGOO III', 'LGOO VII', 'ADAS I', 'Administrative Officer V', 'ISA III', 'Engineer II']) assert.ok(otherRanks.titles.includes(title), title);
  assert.equal(new Set(POSITION_TITLES).size, POSITION_TITLES.length);
  // A designation alone is not a position title.
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
