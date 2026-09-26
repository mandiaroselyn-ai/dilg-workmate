import crypto from 'crypto';
import nodemailer from 'nodemailer';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Announcement } from '../models/announcementModel.js';
import { DtrLog } from '../models/dtrLogModel.js';
import { Leave } from '../models/leaveModel.js';
import { isConnected } from '../config/db.js';
import { toSafeUser } from '../utils/passwordSecurity.js';
import { createAuthToken } from '../utils/authToken.js';

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
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateUserProfile = async (req, res) => {
  try {
    const allowedFields = ['name', 'role', 'office', 'region', 'phoneNumber', 'profilePicture'];
    const profileData = allowedFields.reduce((data, field) => {
      if (req.body[field] !== undefined) data[field] = req.body[field];
      return data;
    }, { lookupEmail: req.user.email });
    const updated = await User.update(profileData);
    res.status(200).json({ success: true, user: toSafeUser(updated) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const registerUser = async (req, res) => {
  try {
    const profileData = {
      ...req.body,
      email: req.body.email?.toLowerCase(),
      accessLevel: 'employee'
    };
    const created = await User.create(profileData);
    res.status(201).json({ success: true, user: toSafeUser(created) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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
    res.status(200).json({ success: true, user: toSafeUser(updated) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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

    const user = await User.findByEmail(normalizedEmail);
    if (!user) {
      return res.status(404).json({ success: false, error: 'No account found with that email.' });
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

    if (!(await User.verifyPassword(user, normalizedPassword))) {
      return res.status(401).json({ success: false, error: 'Invalid password. Please verify your credentials.' });
    }

    res.status(200).json({ success: true, token: createAuthToken(user), user: toSafeUser(user) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getEmployees = async (req, res) => {
  try {
    const employees = await User.findByAccessLevel('employee');
    const users = employees.map((emp) => {
      const plain = toSafeUser(emp);
      return {
        ...plain,
        id: plain.employeeId || String(plain._id),
        vacationLeaveCredits: plain.vacationLeaveCredits ?? 15.0,
        sickLeaveCredits: plain.sickLeaveCredits ?? 15.0,
        lastActive: plain.lastActive || (plain.createdAt ? new Date(plain.createdAt).toISOString().split('T')[0] : '')
      };
    });
    res.status(200).json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getFullState = async (req, res) => {
  try {
    ensureConnected();

    const [user, attendanceHistory, rawRequests, events, notifications, smsAlerts, acknowledged] = await Promise.all([
      req.user || User.get(),
      DtrLog.find(),
      Leave.findAllRequests(),
      Announcement.findEvents(),
      Announcement.findNotifications(),
      Announcement.findSmsAlerts(),
      Announcement.getAcknowledged()
    ]);
    const visibleAttendance = req.user?.accessLevel === 'employee'
      ? attendanceHistory.filter(record => record.employeeId === req.user.employeeId || record.employeeEmail === req.user.email)
      : attendanceHistory;
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
    res.status(500).json({ success: false, error: error.message });
  }
};

export const seedDefaultUsers = async (req, res) => {
  try {
    await User.seedDefaultAccounts();
    res.status(200).json({ success: true, message: 'Default supervisor and HR accounts have been seeded.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/?resetToken=${encodeURIComponent(token)}`;
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

    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(200).json({ success: true, message: 'If that email exists, the reset link has been sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000);
    await User.setPasswordResetToken(email, token, expiry);

    let transporter;
    try {
      transporter = createTransporter();
    } catch (err) {
      console.error('SMTP configuration error:', err.message);
      return res.status(500).json({ success: false, error: 'Email service is not configured. Contact administrator.' });
    }

    try {
      await sendPasswordResetEmail(transporter, email, token);
    } catch (err) {
      console.error('Password reset email send failed:', err);
      return res.status(500).json({ success: false, error: 'Unable to send reset email at this time.' });
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
    res.status(500).json({ success: false, error: error.message });
  }
};
