import assert from 'node:assert/strict';
import test from 'node:test';
import { checkStaffChange, needsAdminPassword, normalizeStaffInput } from './staffRules.js';

const me = { _id: 'hr-1', accessLevel: 'hr_admin', accountStatus: 'Active' };
const otherAdmin = { _id: 'hr-2', accessLevel: 'hr_admin', accountStatus: 'Active' };
const supervisor = { _id: 'sup-1', accessLevel: 'supervisor', accountStatus: 'Active' };

test('HR cannot change their own access, status, or delete themselves', () => {
  assert.match(checkStaffChange({ actor: me, target: me, change: { accessLevel: 'employee' }, activeAdminCount: 2 }), /own access/);
  assert.match(checkStaffChange({ actor: me, target: me, change: { deleting: true }, activeAdminCount: 2 }), /own access/);
});

test('the last active HR/Admin cannot be demoted or deactivated', () => {
  assert.match(checkStaffChange({ actor: me, target: otherAdmin, change: { accessLevel: 'supervisor' }, activeAdminCount: 1 }), /At least one/);
  assert.match(checkStaffChange({ actor: me, target: otherAdmin, change: { accountStatus: 'Inactive' }, activeAdminCount: 1 }), /At least one/);
  assert.equal(checkStaffChange({ actor: me, target: otherAdmin, change: { accountStatus: 'Inactive' }, activeAdminCount: 2 }), null);
});

test('active accounts must be deactivated before they are deleted', () => {
  assert.match(checkStaffChange({ actor: me, target: supervisor, change: { deleting: true }, activeAdminCount: 2 }), /Deactivate/);
  assert.equal(checkStaffChange({ actor: me, target: { ...supervisor, accountStatus: 'Inactive' }, change: { deleting: true }, activeAdminCount: 2 }), null);
});

test('supervisor changes are allowed without affecting admins', () => {
  assert.equal(checkStaffChange({ actor: me, target: supervisor, change: { accessLevel: 'employee' }, activeAdminCount: 1 }), null);
});

test('asks for the HR password whenever HR/Admin access is involved', () => {
  assert.equal(needsAdminPassword({ accessLevel: 'hr_admin' }), true);
  assert.equal(needsAdminPassword({ target: otherAdmin, accessLevel: 'supervisor' }), true);
  assert.equal(needsAdminPassword({ target: supervisor, accessLevel: 'employee' }), false);
});

// What HR fills in for a new Supervisor or HR/Admin account.
const newStaff = {
  name: 'Ana M. Cruz', firstName: 'Ana', middleName: 'M.', lastName: 'Cruz', email: 'Ana@DILG.gov.ph',
  role: 'Local Government Operations Officer VII', designation: 'Provincial Director', office: 'Office of the Provincial Director',
  phoneNumber: '0917 123 4567', dateHired: '2019-02-01', appointmentStatus: 'Permanent', accessLevel: 'supervisor'
};

test('validates new staff accounts', () => {
  const { value } = normalizeStaffInput(newStaff);
  assert.equal(value.email, 'ana@dilg.gov.ph');
  assert.equal(value.lastName, 'Cruz');
  assert.equal(value.designation, 'Provincial Director');
  // Every account is in the region.
  assert.equal(value.region, 'DILG Region IV-B - MIMAROPA');
  assert.match(normalizeStaffInput({ ...newStaff, accessLevel: 'employee' }).error, /Supervisor or HR/);
  assert.match(normalizeStaffInput({ ...newStaff, email: 'not-an-email' }).error, /valid email/);
  assert.equal(normalizeStaffInput({ email: 'x@y.z', office: 'Office of the MLGOO - Gasan' }, { partial: true }).value.email, undefined);
});

test('a new staff account needs a listed office, a mobile number, the date hired, and the status of appointment', () => {
  assert.match(normalizeStaffInput({ ...newStaff, office: 'Boac' }).error, /office from the list/);
  assert.match(normalizeStaffInput({ ...newStaff, phoneNumber: undefined }).error, /mobile number/);
  assert.match(normalizeStaffInput({ ...newStaff, phoneNumber: '(042) 332 1234' }).error, /mobile number/);
  assert.match(normalizeStaffInput({ ...newStaff, dateHired: '' }).error, /date hired/);
  assert.match(normalizeStaffInput({ ...newStaff, dateHired: '2019-02-30' }).error, /date hired/);
  assert.match(normalizeStaffInput({ ...newStaff, appointmentStatus: '' }).error, /status of appointment/);
});

test('an edit keeps an office saved before the office list, but a new one must be listed', () => {
  const previous = { office: 'DILG Marinduque' };
  assert.equal(normalizeStaffInput({ office: 'DILG Marinduque' }, { partial: true, previous }).error, undefined);
  assert.match(normalizeStaffInput({ office: 'Somewhere else' }, { partial: true, previous }).error, /office from the list/);
  assert.match(normalizeStaffInput({ phoneNumber: '' }, { partial: true, previous }).error, /mobile number/);
});

test('HR keeps a staff member\'s region and employment details, not their personal details', () => {
  const { value } = normalizeStaffInput({ region: ' MIMAROPA ', dateHired: '2019-02-01', salaryGrade: 'SG 26', immediateSupervisor: 'Regional Director', gsisNumber: '123' }, { partial: true });
  // The monthly salary comes from the salary schedule (SG 26, Step 1), never typed.
  assert.deepEqual(value, { region: 'MIMAROPA', dateHired: '2019-02-01', salaryGrade: 'SG 26', salaryStep: 'Step 1', salary: 'PHP 131,807', immediateSupervisor: 'Regional Director' });
  assert.match(normalizeStaffInput({ division: 42 }, { partial: true }).error, /must be text/);
});
