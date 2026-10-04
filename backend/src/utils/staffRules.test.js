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

test('validates new staff accounts', () => {
  const { value } = normalizeStaffInput({ name: 'Ana Cruz', email: 'Ana@DILG.gov.ph', role: 'Provincial Director', office: 'Boac', accessLevel: 'supervisor' });
  assert.equal(value.email, 'ana@dilg.gov.ph');
  assert.match(normalizeStaffInput({ name: 'A', email: 'a@dilg.gov.ph', role: 'R', office: 'O', accessLevel: 'employee' }).error, /Supervisor or HR/);
  assert.match(normalizeStaffInput({ name: 'A', email: 'not-an-email', role: 'R', office: 'O', accessLevel: 'supervisor' }).error, /valid email/);
  assert.equal(normalizeStaffInput({ email: 'x@y.z', office: 'New office' }, { partial: true }).value.email, undefined);
});

test('HR keeps a staff member\'s region and employment details, not their personal details', () => {
  const { value } = normalizeStaffInput({ region: ' MIMAROPA ', dateHired: '2019-02-01', salaryGrade: 'SG 26', immediateSupervisor: 'Regional Director', gsisNumber: '123' }, { partial: true });
  assert.deepEqual(value, { region: 'MIMAROPA', dateHired: '2019-02-01', salaryGrade: 'SG 26', immediateSupervisor: 'Regional Director' });
  assert.match(normalizeStaffInput({ division: 42 }, { partial: true }).error, /must be text/);
});
