import { User } from '../models/User.js';
import { Announcement } from '../models/announcementModel.js';
import { sendServerError } from '../middleware/requestSecurity.js';
import { noticeEmployee } from '../services/employeeNotices.js';
import { toSafeUser } from '../utils/passwordSecurity.js';
import {
  ACCESS_LEVELS,
  ACCOUNT_STATUSES,
  STAFF_ACCESS_LEVELS,
  checkStaffChange,
  needsAdminPassword,
  normalizeStaffInput
} from '../utils/staffRules.js';

const MIN_PASSWORD_LENGTH = 10;
const ACCESS_LABELS = { employee: 'Employee', supervisor: 'Supervisor', hr_admin: 'HR/Admin' };

const staffResponse = account => ({ ...toSafeUser(account), id: account.employeeId || String(account._id) });

const actorName = req => req.user?.name || req.user?.email || 'HR/Admin';

// Records every staff account change for HR. A failed notice never fails the change.
const recordChange = message => Announcement.createNotification({
  title: 'Staff Account Change',
  message,
  type: 'employee_management',
  recipientRole: 'hr_admin'
}).catch(error => console.error('Unable to record a staff account change:', error));

// Checks the HR user's own password for changes that involve HR/Admin access. Sends the
// error response and returns false when it is missing or wrong.
const confirmAdminPassword = async (req, res) => {
  const password = typeof req.body?.adminPassword === 'string' ? req.body.adminPassword : '';
  if (password && await User.verifyPassword(req.user, password)) return true;
  res.status(403).json({ success: false, error: 'Enter your own current password to confirm this HR/Admin change.' });
  return false;
};

const findStaffTarget = async (req, res, { staffOnly = true } = {}) => {
  const target = await User.findAccount(req.params.identifier);
  if (!target || (staffOnly && !STAFF_ACCESS_LEVELS.includes(target.accessLevel))) {
    res.status(404).json({ success: false, error: 'Account not found.' });
    return null;
  }
  return target;
};

export const listStaff = async (req, res) => {
  try {
    const staff = await User.findStaff();
    res.status(200).json({ success: true, staff: staff.map(staffResponse) });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const createStaff = async (req, res) => {
  try {
    const { value, error } = normalizeStaffInput(req.body);
    if (error) return res.status(400).json({ success: false, error });
    const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
    if (password.length < MIN_PASSWORD_LENGTH || password.length > 256) {
      return res.status(400).json({ success: false, error: `Set an initial password of ${MIN_PASSWORD_LENGTH} to 256 characters.` });
    }
    if (needsAdminPassword({ accessLevel: value.accessLevel }) && !(await confirmAdminPassword(req, res))) return;

    const created = await User.createStaffAccount({ ...value, password });
    if (created?.conflict) {
      return res.status(409).json({
        success: false,
        error: created.conflict === 'email' ? 'An account already uses this email address.' : 'An account already uses this employee ID.'
      });
    }
    if (!created) return res.status(500).json({ success: false, error: 'Unable to create the account.' });
    await recordChange(`${actorName(req)} created the ${ACCESS_LABELS[created.accessLevel]} account for ${created.name} (${created.email}).`);
    res.status(201).json({ success: true, account: staffResponse(created) });
  } catch (error) {
    sendServerError(res, error);
  }
};

// Edits a staff member's profile details (not their email, access, or status).
export const updateStaff = async (req, res) => {
  try {
    const target = await findStaffTarget(req, res);
    if (!target) return;
    const { value, error } = normalizeStaffInput(req.body, { partial: true });
    if (error) return res.status(400).json({ success: false, error });
    if (value.employeeId && value.employeeId !== target.employeeId) {
      const taken = await User.findByEmployeeId(value.employeeId);
      if (taken && String(taken._id) !== String(target._id)) {
        return res.status(409).json({ success: false, error: 'An account already uses this employee ID.' });
      }
    }
    target.set(value);
    await target.save();
    res.status(200).json({ success: true, account: staffResponse(target.toObject()) });
  } catch (error) {
    sendServerError(res, error);
  }
};

// Promotes or demotes any account between Employee, Supervisor, and HR/Admin.
export const changeAccess = async (req, res) => {
  try {
    const target = await findStaffTarget(req, res, { staffOnly: false });
    if (!target) return;
    const accessLevel = req.body?.accessLevel;
    if (!ACCESS_LEVELS.includes(accessLevel)) {
      return res.status(400).json({ success: false, error: 'Choose Employee, Supervisor, or HR/Admin access.' });
    }
    if ((target.accessLevel || 'employee') === accessLevel) {
      return res.status(400).json({ success: false, error: `This account already has ${ACCESS_LABELS[accessLevel]} access.` });
    }
    const ruleError = checkStaffChange({ actor: req.user, target, change: { accessLevel }, activeAdminCount: await User.countActiveAdmins() });
    if (ruleError) return res.status(409).json({ success: false, error: ruleError });
    if (needsAdminPassword({ target, accessLevel }) && !(await confirmAdminPassword(req, res))) return;

    const previous = ACCESS_LABELS[target.accessLevel || 'employee'];
    target.accessLevel = accessLevel;
    await target.save();
    await recordChange(`${actorName(req)} changed ${target.name} (${target.email}) from ${previous} to ${ACCESS_LABELS[accessLevel]}.`);
    await Announcement.createNotification({
      title: 'Access Changed',
      message: `Your WorkMate access is now ${ACCESS_LABELS[accessLevel]}. Log in again and choose the ${ACCESS_LABELS[accessLevel]} role.`,
      type: 'system',
      employeeId: target.employeeId || '',
      employeeEmail: target.email || ''
    }).catch(error => console.error('Unable to notify the user about their access change:', error));
    res.status(200).json({ success: true, account: staffResponse(target.toObject()) });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const changeStaffStatus = async (req, res) => {
  try {
    const target = await findStaffTarget(req, res);
    if (!target) return;
    const { accountStatus } = req.body || {};
    if (!ACCOUNT_STATUSES.includes(accountStatus)) {
      return res.status(400).json({ success: false, error: 'Choose Active, Inactive, or Suspended.' });
    }
    const ruleError = checkStaffChange({ actor: req.user, target, change: { accountStatus }, activeAdminCount: await User.countActiveAdmins() });
    if (ruleError) return res.status(409).json({ success: false, error: ruleError });
    if (needsAdminPassword({ target }) && !(await confirmAdminPassword(req, res))) return;

    target.accountStatus = accountStatus;
    await target.save();
    await recordChange(`${actorName(req)} set the ${ACCESS_LABELS[target.accessLevel]} account of ${target.name} (${target.email}) to ${accountStatus}.`);
    res.status(200).json({ success: true, account: staffResponse(target.toObject()) });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const deleteStaff = async (req, res) => {
  try {
    const target = await findStaffTarget(req, res);
    if (!target) return;
    const ruleError = checkStaffChange({ actor: req.user, target, change: { deleting: true }, activeAdminCount: await User.countActiveAdmins() });
    if (ruleError) return res.status(409).json({ success: false, error: ruleError });
    if (needsAdminPassword({ target }) && !(await confirmAdminPassword(req, res))) return;

    await target.deleteOne();
    await recordChange(`${actorName(req)} deleted the ${ACCESS_LABELS[target.accessLevel]} account of ${target.name} (${target.email}).`);
    res.status(200).json({ success: true });
  } catch (error) {
    sendServerError(res, error);
  }
};

// HR sets a temporary password for someone who cannot reset their own by email (DILG
// email accounts are told to contact HR). Their other sessions end, and they should change
// it in Settings after signing in. Resetting an HR/Admin's password also needs HR's own
// password; HR changes their own password in Settings instead.
export const resetAccountPassword = async (req, res) => {
  try {
    const target = await findStaffTarget(req, res, { staffOnly: false });
    if (!target) return;
    if (String(target._id) === String(req.user?._id)) {
      return res.status(400).json({ success: false, error: 'Change your own password in Settings.' });
    }
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword.trim() : '';
    if (newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > 256) {
      return res.status(400).json({ success: false, error: `The temporary password must be ${MIN_PASSWORD_LENGTH} to 256 characters.` });
    }
    if (target.accessLevel === 'hr_admin' && !(await confirmAdminPassword(req, res))) return;
    await User.changePassword(target, newPassword);
    await recordChange(`${actorName(req)} reset the password of ${target.name || target.email}.`);
    // The person learns of it even before they next log in. The password itself is never sent.
    await noticeEmployee(target, {
      title: 'Password Reset by HR',
      message: 'HR reset your WorkMate password. Log in with the temporary password HR gave you, then change it in Settings. If you did not ask for this, contact HR right away.',
      view: 'settings',
      sms: 'DILG WorkMate: HR reset your password. Log in with the temporary password HR gives you, then change it. If you did not ask for this, contact HR right away.'
    });
    res.status(200).json({ success: true });
  } catch (error) {
    sendServerError(res, error);
  }
};
