import crypto from 'crypto';
import { attendanceWindowStart, getManilaDateString } from '../../../shared/localDate.js';
import { sendServerError } from '../middleware/requestSecurity.js';
import {
  accountStatusLabel,
  announceAccountApproved,
  approvalNoticeDestination,
  inactiveAccountMessage,
  isAccountApproval,
  notifyHrOfNewAccount
} from '../services/accountNotifications.js';
import { createTransporter, sendGoogleAccountRecoveryEmail } from '../services/emailService.js';
import { isSmsConfigured, toPhilippineMobile } from '../services/smsService.js';
import { normalizeLeaveCreditInput } from '../utils/leaveCredits.js';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Announcement } from '../models/announcementModel.js';
import { DtrLog } from '../models/dtrLogModel.js';
import { Leave } from '../models/leaveModel.js';
import { EmployeeDocument } from '../models/employeeDocumentModel.js';
import { isConnected } from '../config/db.js';
import { toSafeUser } from '../utils/passwordSecurity.js';
import { createAuthToken } from '../utils/authToken.js';
import { getFrontendOrigin } from '../utils/frontendOrigin.js';
import { normalizeApprovedWfhLocation } from '../utils/attendanceAssignment.js';
import { isAgencyEmailAddress } from '../utils/agencyEmail.js';

const MIN_PASSWORD_LENGTH = 10;
const INVALID_LOGIN_MESSAGE = 'Invalid email or password. Please verify your credentials.';

function ensureConnected() {
  if (!isConnected()) {
    throw new Error('MongoDB is not connected.');
  }
}

export const getUserProfile = async (req, res) => {
  try {
    const profile = req.user || await User.get();
    res.status(200).json({ success: true, user: toSafeUser(profile) });
  } catch (error) {
    sendServerError(res, error);
  }
};

// Profile photos are sent with a user's details in many responses (for example, on every
// request they filed), so only small embedded images or linked images (such as a Google
// avatar) are accepted. The app resizes photos to about 200 KB before uploading.
const MAX_PROFILE_PICTURE_LENGTH = 300 * 1024;
export const isValidProfilePicture = value => typeof value === 'string' && (
  value === ''
  || (/^data:image\/(jpeg|png|webp);base64,/.test(value) && value.length <= MAX_PROFILE_PICTURE_LENGTH)
  || (/^https:\/\//.test(value) && value.length <= 2048)
);

export const updateUserProfile = async (req, res) => {
  try {
    const allowedFields = ['name', 'role', 'office', 'region', 'phoneNumber', 'profilePicture'];
    const profileData = allowedFields.reduce((data, field) => {
      if (req.body[field] !== undefined) data[field] = req.body[field];
      return data;
    }, { lookupEmail: req.user.email });
    // Only a new photo is checked; the app re-sends the current photo with every profile save.
    if (profileData.profilePicture !== undefined
      && profileData.profilePicture !== req.user.profilePicture
      && !isValidProfilePicture(profileData.profilePicture)) {
      return res.status(400).json({ success: false, error: 'Profile photo must be an image under 300 KB. Choose or take the photo again.' });
    }
    const updated = await User.update(profileData);
    res.status(200).json({ success: true, user: toSafeUser(updated) });
  } catch (error) {
    sendServerError(res, error);
  }
};

const REGISTRATION_FIELD_LIMITS = {
  name: 160,
  email: 254,
  role: 120,
  office: 160,
  region: 250,
  phoneNumber: 250
};

// Self-registration only accepts basic profile fields. The account stays Pending
// until HR activates it, and the server assigns a unique employee ID.
export const registerUser = async (req, res) => {
  try {
    const body = req.body || {};
    const profile = {};
    for (const [field, limit] of Object.entries(REGISTRATION_FIELD_LIMITS)) {
      const value = body[field] ?? '';
      if (typeof value !== 'string') {
        return res.status(400).json({ success: false, error: `${field} must be text.` });
      }
      profile[field] = value.trim();
      if (profile[field].length > limit) {
        return res.status(400).json({ success: false, error: `${field} exceeds the maximum length.` });
      }
    }
    profile.email = profile.email.toLowerCase();
    if (!profile.name || !profile.email || !profile.role || !profile.office) {
      return res.status(400).json({ success: false, error: 'Name, email, job designation, and office are required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
      return res.status(400).json({ success: false, error: 'Enter a valid email address.' });
    }
    // The approval SMS goes to this number, so it must be a Philippine mobile number.
    if (!toPhilippineMobile(profile.phoneNumber)) {
      return res.status(400).json({ success: false, error: 'Enter your mobile number, such as 0917 123 4567. HR will text you there when your account is approved.' });
    }
    const password = typeof body.password === 'string' ? body.password.trim() : '';
    if (password.length < MIN_PASSWORD_LENGTH || password.length > 256) {
      return res.status(400).json({ success: false, error: `Password must be ${MIN_PASSWORD_LENGTH} to 256 characters.` });
    }
    if (await User.findByEmail(profile.email)) {
      return res.status(409).json({ success: false, error: 'An account already uses this email address.' });
    }

    const created = await User.createSelfServiceEmployee({ ...profile, password, accountStatus: 'Pending', signUpMethod: 'form' });
    if (!created) {
      return res.status(409).json({ success: false, error: 'Unable to register this account. Contact the HR Administrator.' });
    }
    await notifyHrOfNewAccount(created, 'the sign-up form');
    const destination = approvalNoticeDestination(created);
    res.status(201).json({
      success: true,
      message: `Account created. The HR Administrator must activate it before you can log in.${destination ? ` You will get ${destination} once it is approved.` : ''}`,
      user: toSafeUser(created)
    });
  } catch (error) {
    console.error('Registration failed:', error);
    res.status(500).json({ success: false, error: 'Unable to register this account.' });
  }
};

// Only Active accounts can log in. Self-service sign-ups start Pending until HR approves
// (Active) or rejects (Rejected) them; HR deactivates an account with Inactive or Suspended.
const ACCOUNT_STATUSES = ['Active', 'Inactive', 'Pending', 'Suspended', 'Rejected'];

const normalizeEmployeeInput = (body, reviewer) => {
  const stringFields = [
    'name',
    'email',
    'employeeId',
    'role',
    'office',
    'region',
    'phoneNumber',
    'address',
    'dateOfBirth',
    'gender',
    'employmentStatus',
    'dateHired',
    'assignedStation',
    'assignedLGU'
  ];
  const employee = {};
  for (const field of stringFields) {
    const value = body[field] ?? '';
    if (typeof value !== 'string') {
      return { error: `${field} must be text.` };
    }
    employee[field] = value.trim();
  }
  employee.email = employee.email.toLowerCase();
  employee.accessLevel = 'employee';
  employee.accountStatus = body.accountStatus || 'Pending';

  if (!employee.name || !employee.email || !employee.employeeId || !employee.role || !employee.office) {
    return { error: 'Name, email, employee ID, job designation, and office are required.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employee.email)) {
    return { error: 'Enter a valid employee email address.' };
  }
  if (employee.employeeId.length > 64 || employee.name.length > 160 || employee.role.length > 120 || employee.office.length > 160) {
    return { error: 'One or more employee fields exceed the maximum length.' };
  }
  if (!ACCOUNT_STATUSES.includes(employee.accountStatus)) {
    return { error: 'Invalid employee account status.' };
  }
  if (!['ACTIVE', 'INACTIVE', 'ON LEAVE'].includes(employee.employmentStatus)) {
    return { error: 'Invalid employment status.' };
  }
  for (const field of ['region', 'phoneNumber', 'address', 'dateOfBirth', 'gender', 'dateHired', 'assignedStation', 'assignedLGU']) {
    if (employee[field].length > 250) {
      return { error: `${field} exceeds the maximum length.` };
    }
  }
  if (body.approvedWfhLocation !== undefined) {
    try {
      employee.approvedWfhLocation = normalizeApprovedWfhLocation(body.approvedWfhLocation, reviewer);
    } catch (error) {
      return { error: error.message };
    }
  }
  return { employee };
};

const employeeResponse = employee => ({
  ...toSafeUser(employee),
  hasDilgIdPhoto: Boolean(employee.dilgIdPhoto),
  hasDilgIdBackPhoto: Boolean(employee.dilgIdBackPhoto),
  hasFaceEnrollmentImage: Boolean(employee.faceEnrollmentImage),
  biometricEnrollmentStatus: employee.biometricEnrollmentStatus || 'not-submitted',
  biometricEnrollmentIsDemo: Boolean(employee.biometricEnrollmentIsDemo),
  biometricEnrollmentVersion: employee.biometricEnrollmentVersion || 1,
  biometricEnrollmentSubmittedAt: employee.biometricEnrollmentSubmittedAt || null,
  biometricEnrollmentReviewedAt: employee.biometricEnrollmentReviewedAt || null,
  biometricEnrollmentReviewedBy: employee.biometricEnrollmentReviewedBy || '',
  biometricEnrollmentReviewNote: employee.biometricEnrollmentReviewNote || '',
  faceLivenessStatus: 'not-configured',
  faceVerificationAudit: (employee.faceVerificationAudit || []).map(event => ({
    timestamp: event.timestamp,
    outcome: event.outcome,
    reviewedBy: event.reviewedBy,
    provider: event.provider
  })),
  id: employee.employeeId || String(employee._id)
});

export const createEmployee = async (req, res) => {
  try {
    const reviewer = req.user?.employeeId || req.user?.email || String(req.user?._id || '');
    const { employee, error } = normalizeEmployeeInput(req.body || {}, reviewer);
    if (error) return res.status(400).json({ success: false, error });
    const password = req.body.password;
    if (typeof password !== 'string' || password.trim().length < 10 || password.length > 256) {
      return res.status(400).json({ success: false, error: 'Set an initial employee password of 10 to 256 characters.' });
    }

    const created = await User.createEmployee({ ...employee, password: password.trim() });
    if (created?.conflict) {
      return res.status(409).json({ success: false, error: 'An employee already uses this email address or employee ID.' });
    }
    res.status(201).json({ success: true, employee: employeeResponse(created) });
  } catch (error) {
    console.error('Unable to create employee account:', error);
    res.status(500).json({ success: false, error: 'Unable to create employee account.' });
  }
};

export const updateEmployee = async (req, res) => {
  try {
    const reviewer = req.user?.employeeId || req.user?.email || String(req.user?._id || '');
    const { employee, error } = normalizeEmployeeInput(req.body || {}, reviewer);
    if (error) return res.status(400).json({ success: false, error });
    const before = await User.findAccount(req.params.identifier);
    const updated = await User.updateEmployee(req.params.identifier, employee);
    if (updated?.conflict) {
      return res.status(409).json({ success: false, error: 'An employee already uses this email address or employee ID.' });
    }
    if (!updated) return res.status(404).json({ success: false, error: 'Employee account not found.' });
    // HR can also approve an account by saving it as Active from the edit form.
    const approvalNotice = isAccountApproval(before, employee.accountStatus) ? await announceAccountApproved(updated) : undefined;
    res.status(200).json({ success: true, employee: employeeResponse(updated), ...(approvalNotice ? { approvalNotice } : {}) });
  } catch (error) {
    console.error('Unable to update employee account:', error);
    res.status(500).json({ success: false, error: 'Unable to update employee account.' });
  }
};

export const updateEmployeeLeaveCredits = async (req, res) => {
  try {
    const { value, reason, error } = normalizeLeaveCreditInput(req.body);
    if (error) return res.status(400).json({ success: false, error });
    const changedBy = req.user?.name || req.user?.email || 'HR/Admin';
    const updated = await User.setLeaveCredits(req.params.identifier, value, { reason, changedBy });
    if (!updated) return res.status(404).json({ success: false, error: 'Employee account not found.' });
    await Announcement.createNotification({
      title: 'Leave Credits Updated',
      message: `HR updated your leave credits: ${value.vacationLeaveCredits} days vacation leave and ${value.sickLeaveCredits} days sick leave. Reason: ${reason}`,
      type: 'system',
      employeeId: updated.employeeId || '',
      employeeEmail: updated.email || ''
    }).catch(notifyError => console.error('Unable to notify the employee about leave credits:', notifyError));
    res.status(200).json({ success: true, employee: employeeResponse(updated) });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const deleteEmployee = async (req, res) => {
  try {
    const result = await User.deleteEmployee(req.params.identifier);
    if (!result) return res.status(404).json({ success: false, error: 'Employee account not found.' });
    if (result.active) {
      return res.status(409).json({ success: false, error: 'Deactivate this account before deleting it.' });
    }
    const { deleted } = result;
    const reviewer = req.user?.name || req.user?.email || 'HR/Admin';
    await Announcement.createNotification({
      title: 'Employee Account Deleted',
      message: `${deleted.name || deleted.email} (${deleted.employeeId || deleted.email}) was deleted by ${reviewer}. Their attendance and request records were kept.`,
      type: 'employee_management',
      recipientRole: 'hr_admin'
    }).catch(error => console.error('Unable to record the employee deletion notice:', error));
    res.status(200).json({ success: true, employeeId: deleted.employeeId || '', email: deleted.email || '' });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const updateEmployeeAccountStatus = async (req, res) => {
  try {
    const { identifier } = req.params;
    const { accountStatus } = req.body;
    if (!ACCOUNT_STATUSES.includes(accountStatus)) {
      return res.status(400).json({ success: false, error: 'Invalid account status.' });
    }
    const before = await User.findAccount(identifier);
    const updated = await User.updateAccountStatus(identifier, accountStatus);
    if (!updated) return res.status(404).json({ success: false, error: 'Employee account not found.' });
    // When an account becomes active, the employee is told by SMS or email that they can
    // log in. HR's response says whether that worked.
    const approvalNotice = isAccountApproval(before, accountStatus) ? await announceAccountApproved(updated) : undefined;
    res.status(200).json({ success: true, user: toSafeUser(updated), ...(approvalNotice ? { approvalNotice } : {}) });
  } catch (error) {
    sendServerError(res, error);
  }
};

// Changes the signed-in user's password. The current password is required unless the
// account has none yet (for example, one created with Google sign-in). Other sessions
// end, and this session gets a new token.
export const changePassword = async (req, res) => {
  try {
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword.trim() : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword.trim() : '';
    if (newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > 256) {
      return res.status(400).json({ success: false, error: `New password must be ${MIN_PASSWORD_LENGTH} to 256 characters.` });
    }
    const user = req.user;
    if (user.password) {
      if (!currentPassword || !(await User.verifyPassword(user, currentPassword))) {
        return res.status(400).json({ success: false, error: 'Your current password is incorrect.' });
      }
      if (currentPassword === newPassword) {
        return res.status(400).json({ success: false, error: 'Choose a new password that is different from your current one.' });
      }
    }
    await User.changePassword(user, newPassword);
    res.status(200).json({ success: true, message: 'Password changed. You were signed out on your other devices.', token: createAuthToken(user) });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password, role, platform } = req.body;
    const normalizedEmail = email?.toString().trim().toLowerCase();
    const normalizedPassword = password?.toString().trim();
    const normalizedRole = role?.toString().trim().toLowerCase();

    if (!normalizedEmail || !normalizedPassword || !normalizedRole) {
      return res.status(400).json({ success: false, error: 'Email, password, and role are required.' });
    }

    // Verify the password before revealing anything about the account, and use the
    // same response for unknown emails so the login form cannot enumerate accounts.
    const user = await User.findByEmail(normalizedEmail);
    if (!(await User.verifyPassword(user, normalizedPassword))) {
      return res.status(401).json({ success: false, error: INVALID_LOGIN_MESSAGE });
    }

    if (user.accountStatus && user.accountStatus.toLowerCase() !== 'active') {
      return res.status(403).json({ success: false, error: inactiveAccountMessage(user) });
    }

    const storedRole = (user.accessLevel || 'employee').toString().trim().toLowerCase();
    if (platform?.toString().trim().toLowerCase() === 'mobile' && storedRole !== 'employee') {
      return res.status(403).json({
        success: false,
        error: 'Only employee accounts can use the mobile app.'
      });
    }

    if (normalizedRole !== storedRole) {
      return res.status(403).json({
        success: false,
        error: `This account is registered as ${storedRole.replace('_', ' ')}. Please select the correct role.`
      });
    }

    res.status(200).json({ success: true, token: createAuthToken(user), user: toSafeUser(user) });
  } catch (error) {
    sendServerError(res, error);
  }
};

// Lets someone who signed up with the form see whether HR approved their account without
// logging in. Like logging in, it needs the password, so nobody can look up someone else's
// account by email, and failed attempts count toward the same limit as failed logins.
export const checkAccountStatus = async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }
    const user = await User.findByEmail(email);
    if (!(await User.verifyPassword(user, password))) {
      return res.status(401).json({ success: false, error: INVALID_LOGIN_MESSAGE });
    }
    const status = accountStatusLabel(user);
    res.status(200).json({
      success: true,
      status,
      message: status === 'Approved' ? 'Your account has been approved. You can now log in.' : inactiveAccountMessage(user)
    });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const getEmployees = async (req, res) => {
  try {
    const employees = await User.findByAccessLevel('employee');
    const users = employees.map((emp) => {
      const plain = toSafeUser(emp);
      return {
        ...plain,
        hasDilgIdPhoto: Boolean(emp.dilgIdPhoto),
        hasDilgIdBackPhoto: Boolean(emp.dilgIdBackPhoto),
        hasFaceEnrollmentImage: Boolean(emp.faceEnrollmentImage),
        biometricEnrollmentStatus: emp.biometricEnrollmentStatus || 'not-submitted',
        biometricEnrollmentVersion: emp.biometricEnrollmentVersion || 1,
        biometricEnrollmentSubmittedAt: emp.biometricEnrollmentSubmittedAt || null,
        biometricEnrollmentReviewedAt: emp.biometricEnrollmentReviewedAt || null,
        biometricEnrollmentReviewedBy: emp.biometricEnrollmentReviewedBy || '',
        biometricEnrollmentReviewNote: emp.biometricEnrollmentReviewNote || '',
        faceLivenessStatus: 'not-configured',
        dilgIdVerifiedAt: emp.dilgIdVerifiedAt || null,
        dilgIdVerifiedBy: emp.dilgIdVerifiedBy || '',
        dilgIdVerifiedDetails: emp.dilgIdVerifiedDetails || null,
        faceVerificationAudit: (emp.faceVerificationAudit || []).map(event => ({
          timestamp: event.timestamp,
          outcome: event.outcome,
          reviewedBy: event.reviewedBy,
          provider: event.provider
        })),
        id: plain.employeeId || String(plain._id),
        vacationLeaveCredits: plain.vacationLeaveCredits ?? 15.0,
        sickLeaveCredits: plain.sickLeaveCredits ?? 15.0,
        lastActive: plain.lastActive || (plain.createdAt ? getManilaDateString(new Date(plain.createdAt)) : '')
      };
    });
    res.status(200).json({ success: true, users });
  } catch (error) {
    sendServerError(res, error);
  }
};

// Fingerprints of the lists this person sees. The app asks every few seconds and downloads
// only the lists whose fingerprint changed, so updates show up quickly without reloading
// everything. Attendance and the SMS log are included for HR/Admins only.
export const getUpdateStamps = async (req, res) => {
  try {
    const isHr = req.user?.accessLevel === 'hr_admin';
    const [bulletins, requests, documents, attendance, sms] = await Promise.all([
      Announcement.updateStamps(req.user),
      Leave.updateStamp(req.user),
      EmployeeDocument.updateStamp(req.user),
      isHr ? DtrLog.updateStamp() : null,
      isHr ? Announcement.smsStamp() : null
    ]);
    res.status(200).json({ success: true, stamps: { ...bulletins, requests, documents, ...(attendance ? { attendance } : {}), ...(sms ? { sms } : {}) } });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const getFullState = async (req, res) => {
  try {
    ensureConnected();

    // Employees only load their own attendance, filtered in the database. HR/Admins load
    // everyone's from the start of the previous month (earlier months on request). Either
    // way the lists leave out selfies and GPS history; a selfie loads with its record.
    // Supervisors only decide requests, so they get no attendance.
    const accessLevel = req.user?.accessLevel;
    const [user, visibleAttendance, rawRequests, events, notifications, smsAlerts, acknowledged, announcements] = await Promise.all([
      req.user || User.get(),
      accessLevel === 'employee' ? DtrLog.findListForEmployee(req.user) : accessLevel === 'hr_admin' ? DtrLog.findForHrList({ since: attendanceWindowStart() }) : [],
      Leave.findAllRequests(),
      Announcement.findEvents(),
      Announcement.findNotificationsFor(req.user),
      Announcement.findSmsAlerts(),
      Announcement.getAcknowledged(req.user),
      Announcement.findAnnouncementPosts()
    ]);
    // Supervisors do not load the employee list, only how many employees can log in.
    const activeEmployeeCount = accessLevel === 'supervisor' ? await User.countActiveEmployees() : undefined;
    // A draft is the employee's own until they submit it.
    const visibleRawRequests = req.user?.accessLevel === 'employee'
      ? rawRequests.filter(request => request.employeeId === req.user.employeeId || request.employeeEmail === req.user.email)
      : rawRequests.filter(request => request.status !== 'Draft');
    const visibleNotifications = notifications;
    // Employees see their own messages and HR the whole log. Supervisors only decide
    // requests, so they get no SMS log.
    const visibleSmsAlerts = accessLevel === 'employee'
      ? smsAlerts.filter(item => item.employeeId === req.user.employeeId || item.employeeEmail === req.user.email)
      : accessLevel === 'hr_admin' ? smsAlerts : [];
    const requests = await Promise.all(visibleRawRequests.map(async request => {
      const employee = request.employeeId
        ? await User.findByEmployeeId(request.employeeId)
        : request.employeeEmail
          ? await User.findByEmail(request.employeeEmail)
          : null;
      if (!employee) return request;
      // The profile photo is left out: it would be repeated in every request.
      const { profilePicture, ...safeProfile } = toSafeUser(employee);
      return { ...request, employee: safeProfile, employeeName: request.employeeName || safeProfile.name };
    }));

    res.status(200).json({
      user: toSafeUser(user),
      attendanceHistory: visibleAttendance,
      requests,
      events,
      notifications: visibleNotifications,
      smsAlerts: visibleSmsAlerts,
      acknowledged,
      announcements,
      activeEmployeeCount,
      // HR's SMS panel says whether texts can be sent at all.
      ...(accessLevel === 'hr_admin' ? { smsConfigured: isSmsConfigured() } : {})
    });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const seedDefaultUsers = async (req, res) => {
  try {
    await User.seedDefaultAccounts();
    res.status(200).json({ success: true, message: 'Default supervisor and HR accounts have been seeded.' });
  } catch (error) {
    sendServerError(res, error);
  }
};

const sendPasswordResetEmail = async (transporter, email, token) => {
  const resetUrl = `${getFrontendOrigin()}/?resetToken=${encodeURIComponent(token)}`;
  const message = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: 'DILG WorkMate Password Reset',
    text: `You requested a password reset. Click here to reset your password:\n\n${resetUrl}\n\nThis link works once and expires in 1 hour. If you did not request this, please ignore this message.`,
    html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link works once and expires in 1 hour. If you did not request this, please ignore this message.</p>`
  };

  const info = await transporter.sendMail(message);
  console.log('Password reset email sent:', info.messageId, 'to', email);
};

// The same answer for every email, whether it has no account, an account with a password,
// or one that uses Google sign-in, so the form cannot be used to find out which it is.
const RESET_REQUEST_MESSAGE = 'If that email has an account, we sent it an email. An account with a password gets a reset link that works once and expires in 1 hour. An account that uses Google Sign-In gets a link to Google Account Recovery instead.';

export const requestPasswordReset = async (req, res) => {
  try {
    const email = req.body.email?.toLowerCase?.().trim();
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required.' });
    }

    // DILG email accounts reset their password through HR, who sets a temporary one. The
    // answer depends only on the email's domain, not on whether the account exists.
    if (isAgencyEmailAddress(email)) {
      return res.status(200).json({ success: true, contactHr: true, message: 'DILG email accounts are reset by HR. Please contact your HR Administrator, or tap "Request password reset from HR" below to let them know.' });
    }

    // Check the email service first, so the response does not differ between known and
    // unknown emails. Signing in to the mail server here means a wrong server name or
    // password is reported, instead of the page saying a link was sent when none was.
    let transporter;
    try {
      transporter = createTransporter();
      await transporter.verify();
    } catch (err) {
      console.error('Password reset email service is not available:', err.message);
      return res.status(503).json({
        success: false,
        error: 'Password reset emails cannot be sent right now because the email service is not set up correctly. Please contact the HR Administrator.'
      });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(200).json({ success: true, message: RESET_REQUEST_MESSAGE });
    }

    // An account made with Google sign-in has no WorkMate password; Google manages it. It
    // gets Google's account recovery page instead of a reset link, so no password is added.
    if (!user.password) {
      try {
        await sendGoogleAccountRecoveryEmail(transporter, email);
      } catch (err) {
        console.error('Google account recovery email send failed:', err);
      }
      return res.status(200).json({ success: true, message: RESET_REQUEST_MESSAGE });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000);
    await User.setPasswordResetToken(email, token, expiry);

    try {
      await sendPasswordResetEmail(transporter, email, token);
    } catch (err) {
      console.error('Password reset email send failed:', err);
    }

    res.status(200).json({ success: true, message: RESET_REQUEST_MESSAGE });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ success: false, error: 'Unable to process reset request at this time.' });
  }
};

// The same answer whether or not the email has an account, so the form does not reveal it.
const HR_RESET_REQUEST_MESSAGE = 'Your request was sent to the HR Administrator. Visit or call the HR office so they can confirm it is you. HR will give you a temporary password in person or by phone; change it in Settings after you log in.';

// Lets someone who cannot use an emailed reset link (such as a DILG email account, or
// someone who cannot open their inbox) ask HR for help from the Forgot Password page. HR
// is notified only about an existing account, and must confirm the person before setting
// a temporary password, since anyone can type someone else's email here.
export const requestHrPasswordReset = async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'Enter the email address of your account.' });
    }
    const user = await User.findByEmail(email);
    if (user) {
      const who = `${user.name || user.email} (${user.email}${user.employeeId ? `, ${user.employeeId}` : ''})`;
      await Announcement.createNotification({
        title: 'Password Reset Requested',
        message: `${who} asked HR to reset their password. Before using Reset password on their profile, confirm it is really them, in person or by calling the number on file. Give the temporary password only to them, in person or by phone.`,
        type: 'employee_management',
        recipientRole: 'hr_admin',
        action: 'reset_password',
        targetId: user.employeeId || user.email
      });
    }
    res.status(200).json({ success: true, message: HR_RESET_REQUEST_MESSAGE });
  } catch (error) {
    console.error('HR password reset request error:', error);
    res.status(500).json({ success: false, error: 'Your request could not be sent. Please visit or call the HR office.' });
  }
};

export const completePasswordReset = async (req, res) => {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';

    if (!token || !password) {
      return res.status(400).json({ success: false, error: 'Reset token and password are required.' });
    }
    if (password.length < MIN_PASSWORD_LENGTH || password.length > 256) {
      return res.status(400).json({ success: false, error: `Password must be ${MIN_PASSWORD_LENGTH} to 256 characters.` });
    }

    const updatedUser = await User.resetPasswordByToken(token, password);
    if (!updatedUser) {
      return res.status(400).json({ success: false, error: 'Token has expired or is invalid.' });
    }

    res.status(200).json({ success: true, message: 'Your password has been reset. You can now log in with your new password.' });
  } catch (error) {
    console.error('Complete password reset error:', error);
    res.status(500).json({ success: false, error: 'Unable to reset password at this time.' });
  }
};

export const resetDatabase = async (req, res) => {
  try {
    ensureConnected();
    res.status(200).json({ success: true, message: 'Reset endpoint is disabled in remote MongoDB mode.' });
  } catch (error) {
    sendServerError(res, error);
  }
};
