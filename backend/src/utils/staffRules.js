// Rules for HR managing Supervisor and HR/Admin accounts. They keep the system from
// ending up without an active HR/Admin and stop HR from locking themselves out.

import { EMPLOYMENT_FIELDS, readProfileFields } from '../../../shared/profileFields.js';

export const ACCESS_LEVELS = ['employee', 'supervisor', 'hr_admin'];
export const STAFF_ACCESS_LEVELS = ['supervisor', 'hr_admin'];
export const ACCOUNT_STATUSES = ['Active', 'Inactive', 'Suspended'];

const FIELD_LIMITS = { name: 160, email: 254, role: 120, office: 160, phoneNumber: 250, employeeId: 64, region: 250, dateHired: 40 };

const isActive = account => !account?.accountStatus || account.accountStatus.toString().toLowerCase() === 'active';
export const isActiveAdmin = account => account?.accessLevel === 'hr_admin' && isActive(account);
const sameAccount = (a, b) => Boolean(a?._id && b?._id && String(a._id) === String(b._id));

// Cleans the fields of a staff account form. On create, name, email, job designation,
// office, and access level are required; on edit (`partial`), only sent fields change.
export const normalizeStaffInput = (body, { partial = false } = {}) => {
  const value = {};
  for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
    if (partial && field === 'email') continue; // The login email is not changed here.
    const raw = body?.[field];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== 'string') return { error: `${field} must be text.` };
    const text = raw.trim();
    if (text.length > limit) return { error: `${field} exceeds the maximum length.` };
    value[field] = field === 'email' ? text.toLowerCase() : text;
  }
  // HR also keeps the staff member's employment details; their personal details are
  // their own to fill in on their profile.
  const details = readProfileFields(body, EMPLOYMENT_FIELDS);
  if (details.error) return { error: details.error };
  Object.assign(value, details.value);
  if (!partial) {
    if (!value.name || !value.email || !value.role || !value.office) {
      return { error: 'Name, email, job designation, and office are required.' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) return { error: 'Enter a valid email address.' };
    if (!STAFF_ACCESS_LEVELS.includes(body?.accessLevel)) return { error: 'Choose Supervisor or HR/Admin access.' };
    value.accessLevel = body.accessLevel;
  } else if (Object.keys(value).length === 0) {
    return { error: 'No changes were sent.' };
  }
  return { value };
};

// Returns an error message when HR may not make this change, otherwise null.
// `change` is { accessLevel } for an access change, { accountStatus } for a status
// change, or { deleting: true }.
export const checkStaffChange = ({ actor, target, change, activeAdminCount }) => {
  if (sameAccount(actor, target)) {
    return 'You cannot change your own access or status. Ask another HR/Admin to do it.';
  }
  if (change.deleting && isActive(target)) return 'Deactivate this account before deleting it.';
  const removesActiveAdmin = isActiveAdmin(target) && (
    (change.accessLevel && change.accessLevel !== 'hr_admin')
    || (change.accountStatus && change.accountStatus.toLowerCase() !== 'active')
    || change.deleting
  );
  if (removesActiveAdmin && activeAdminCount <= 1) return 'At least one active HR/Admin account must remain.';
  return null;
};

// HR must retype their own password for anything that creates, grants, or changes
// HR/Admin access.
export const needsAdminPassword = ({ target, accessLevel }) => accessLevel === 'hr_admin' || target?.accessLevel === 'hr_admin';
