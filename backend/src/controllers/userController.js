import crypto from 'crypto';
import { getManilaDateString } from '../../../shared/localDate.js';
import { sendServerError } from '../middleware/requestSecurity.js';
import { notifyHrOfNewAccount } from '../services/accountNotifications.js';
import nodemailer from 'nodemailer';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Announcement } from '../models/announcementModel.js';
import { DtrLog } from '../models/dtrLogModel.js';
import { Leave } from '../models/leaveModel.js';
import { isConnected } from '../config/db.js';
import { toSafeUser } from '../utils/passwordSecurity.js';
import { createAuthToken } from '../utils/authToken.js';
import { getFrontendOrigin } from '../utils/frontendOrigin.js';
import { normalizeApprovedWfhLocation } from '../utils/attendanceAssignment.js';

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
    const password = typeof body.password === 'string' ? body.password.trim() : '';
    if (password.length < MIN_PASSWORD_LENGTH || password.length > 256) {
      return res.status(400).json({ success: false, error: `Password must be ${MIN_PASSWORD_LENGTH} to 256 characters.` });
    }
    if (await User.findByEmail(profile.email)) {
      return res.status(409).json({ success: false, error: 'An account already uses this email address.' });
    }

    const created = await User.createSelfServiceEmployee({ ...profile, password, accountStatus: 'Pending' });
    if (!created) {
      return res.status(409).json({ success: false, error: 'Unable to register this account. Contact the HR Administrator.' });
    }
    await notifyHrOfNewAccount(created, 'the sign-up form');
    res.status(201).json({
      success: true,
      message: 'Account created. The HR Administrator must activate it before you can log in.',
      user: toSafeUser(created)
    });
  } catch (error) {
    console.error('Registration failed:', error);
    res.status(500).json({ success: false, error: 'Unable to register this account.' });
  }
};

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
  if (!['Active', 'Inactive', 'Pending', 'Suspended'].includes(employee.accountStatus)) {
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
    const updated = await User.updateEmployee(req.params.identifier, employee);
    if (updated?.conflict) {
      return res.status(409).json({ success: false, error: 'An employee already uses this email address or employee ID.' });
    }
    if (!updated) return res.status(404).json({ success: false, error: 'Employee account not found.' });
    res.status(200).json({ success: true, employee: employeeResponse(updated) });
  } catch (error) {
    console.error('Unable to update employee account:', error);
    res.status(500).json({ success: false, error: 'Unable to update employee account.' });
  }
};

export const updateEmployeeAccountStatus = async (req, res) => {
  try {
    const { identifier } = req.params;
    const { accountStatus } = req.body;
    if (!['Active', 'Inactive', 'Pending', 'Suspended'].includes(accountStatus)) {
      return res.status(400).json({ success: false, error: 'Invalid account status.' });
    }
    const updated = await User.updateAccountStatus(identifier, accountStatus);
    if (!updated) return res.status(404).json({ success: false, error: 'Employee account not found.' });
    if (accountStatus === 'Active') {
      // The employee sees this after their first login. A failed notification never
      // fails the approval.
      await Announcement.createNotification({
        title: 'Account Approved',
        message: 'Your DILG WorkMate account is now active. Complete your profile and biometric enrollment before your first Time In.',
        type: 'system',
        employeeId: updated.employeeId || '',
        employeeEmail: updated.email || ''
      }).catch(error => console.error('Unable to notify the employee about account approval:', error));
    }
    res.status(200).json({ success: true, user: toSafeUser(updated) });
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
      return res.status(403).json({ success: false, error: `This account is ${user.accountStatus.toLowerCase()}. Please contact HR Administrator.` });
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

export const getFullState = async (req, res) => {
  try {
    ensureConnected();

    // Employees only load their own attendance, filtered in the database rather than
    // loading every record (with selfies) and filtering here.
    const [user, visibleAttendance, rawRequests, events, notifications, smsAlerts, acknowledged] = await Promise.all([
      req.user || User.get(),
      req.user?.accessLevel === 'employee' ? DtrLog.findForEmployee(req.user) : DtrLog.find(),
      Leave.findAllRequests(),
      Announcement.findEvents(),
      Announcement.findNotifications(),
      Announcement.findSmsAlerts(),
      Announcement.getAcknowledged(req.user)
    ]);
    const visibleRawRequests = req.user?.accessLevel === 'employee'
      ? rawRequests.filter(request => request.employeeId === req.user.employeeId || request.employeeEmail === req.user.email)
      : rawRequests;
    const visibleNotifications = req.user?.accessLevel === 'employee'
      ? notifications.filter(item => (
        (!item.employeeId && !item.employeeEmail && !item.recipientRole)
        || item.employeeId === req.user.employeeId
        || item.employeeEmail === req.user.email
      ))
      : notifications;
    const visibleSmsAlerts = req.user?.accessLevel === 'employee'
      ? smsAlerts.filter(item => item.employeeId === req.user.employeeId || item.employeeEmail === req.user.email)
      : smsAlerts;
    const requests = await Promise.all(visibleRawRequests.map(async request => {
      const employee = request.employeeId
        ? await User.findByEmployeeId(request.employeeId)
        : request.employeeEmail
          ? await User.findByEmail(request.employeeEmail)
          : null;
      if (!employee) return request;
      const safeProfile = toSafeUser(employee);
      return { ...request, employee: safeProfile, employeeName: request.employeeName || safeProfile.name };
    }));

    res.status(200).json({
      user: toSafeUser(user),
      attendanceHistory: visibleAttendance,
      requests,
      events,
      notifications: visibleNotifications,
      smsAlerts: visibleSmsAlerts,
      acknowledged
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

const createTransporter = () => {
  const missing = [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'EMAIL_FROM'
  ].filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`SMTP configuration incomplete: missing ${missing.join(', ')}`);
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

const sendPasswordResetEmail = async (transporter, email, token) => {
  const resetUrl = `${getFrontendOrigin()}/?resetToken=${encodeURIComponent(token)}`;
  const message = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: 'DILG WorkMate Password Reset',
    text: `You requested a password reset. Click here to reset your password:\n\n${resetUrl}\n\nIf you did not request this, please ignore this message.`,
    html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Reset your password</a></p><p>If you did not request this, please ignore this message.</p>`
  };

  const info = await transporter.sendMail(message);
  console.log('Password reset email sent:', info.messageId, 'to', email);
};

export const requestPasswordReset = async (req, res) => {
  try {
    const email = req.body.email?.toLowerCase?.().trim();
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required.' });
    }

    // Check the email configuration first so the response does not differ between known and unknown emails.
    let transporter;
    try {
      transporter = createTransporter();
    } catch (err) {
      console.error('SMTP configuration error:', err.message);
      return res.status(500).json({ success: false, error: 'Email service is not configured. Contact administrator.' });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(200).json({ success: true, message: 'If that email exists, the reset link has been sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000);
    await User.setPasswordResetToken(email, token, expiry);

    try {
      await sendPasswordResetEmail(transporter, email, token);
    } catch (err) {
      console.error('Password reset email send failed:', err);
    }

    res.status(200).json({ success: true, message: 'If that email exists, the reset link has been sent.' });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ success: false, error: 'Unable to process reset request at this time.' });
  }
};

export const completePasswordReset = async (req, res) => {
  try {
    const token = req.body.token?.toString?.().trim();
    const password = req.body.password?.toString?.trim();

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

    res.status(200).json({ success: true, message: 'Password has been reset successfully.' });
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
