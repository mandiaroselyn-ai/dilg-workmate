import mongoose from 'mongoose';
import crypto from 'crypto';
import { isConnected } from '../config/db.js';
import fs from 'fs/promises';
import path from 'path';
import { hashPassword, isPasswordHash, verifyPassword as checkPassword } from '../utils/passwordSecurity.js';
import { resubmittableEnrollmentFilter } from '../utils/biometricEnrollment.js';
import { DEFAULT_LEAVE_CREDITS } from '../utils/leaveCredits.js';

const UserSchema = new mongoose.Schema({
  name: { type: String, default: 'Lara Montiano' },
  email: { type: String, default: 'laramontiano@dilg.gov.ph' },
  password: { type: String, default: '' },
  role: { type: String, default: 'Local Government Operations Officer II' },
  office: { type: String, default: 'Marinduque Provincial Office' },
  region: { type: String, default: 'DILG Region IV-B - MIMAROPA' },
  phoneNumber: { type: String, default: '0939 374 9823' },
  employeeId: { type: String, default: 'DILG-2026-7689' },
  accessLevel: { type: String, default: 'employee' },
  accountStatus: { type: String, default: 'Active' },
  googleId: { type: String, default: '' },
  // How a self-service account was made: 'form' (the sign-up form) or 'google' (Google
  // sign-in). Empty for accounts HR created.
  signUpMethod: { type: String, default: '' },
  profilePicture: { type: String, default: '' },
  address: { type: String, default: '' },
  dateOfBirth: { type: String, default: '' },
  gender: { type: String, default: '' },
  employmentStatus: { type: String, default: 'ACTIVE' },
  dateHired: { type: String, default: '' },
  assignedStation: { type: String, default: '' },
  assignedLGU: { type: String, default: '' },
  approvedWfhLocation: {
    municipality: { type: String, default: '' },
    barangay: { type: String, default: '' },
    street: { type: String, default: '' },
    landmark: { type: String, default: '' },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: String, default: '' }
  },
  fingerprintHash: { type: String, default: '' },
  faceProvider: { type: String, default: '' },
  faceId: { type: String, default: '' },
  faceEnrolledAt: { type: Date, default: null },
  faceEnrollmentImage: { type: String, default: '' },
  faceEnrollmentDescriptor: { type: [Number], default: undefined, select: false },
  dilgIdPhoto: { type: String, default: '' },
  dilgIdBackPhoto: { type: String, default: '' },
  biometricEnrollmentIsDemo: { type: Boolean, default: false },
  biometricEnrollmentStatus: {
    type: String,
    enum: ['not-submitted', 'pending', 'hr-approved', 'rejected'],
    default: 'not-submitted'
  },
  biometricEnrollmentVersion: { type: Number, default: 1 },
  biometricEnrollmentSubmittedAt: { type: Date, default: null },
  biometricEnrollmentReviewedAt: { type: Date, default: null },
  biometricEnrollmentReviewedBy: { type: String, default: '' },
  biometricEnrollmentReviewNote: { type: String, default: '' },
  faceLivenessStatus: { type: String, default: 'not-configured' },
  dilgIdMatchConfidence: { type: Number, default: null },
  dilgIdVerifiedAt: { type: Date, default: null },
  dilgIdVerifiedBy: { type: String, default: '' },
  dilgIdVerifiedDetails: {
    name: { type: String, default: '' },
    employeeId: { type: String, default: '' },
    office: { type: String, default: '' }
  },
  faceVerificationAudit: [{
    timestamp: { type: Date, default: Date.now },
    outcome: { type: String, default: '' },
    deviceId: { type: String, default: '' },
    reviewedBy: { type: String, default: '' },
    provider: { type: String, default: 'manual-hr-review' }
  }],
  webauthnCredentialId: { type: String, default: '' },
  webauthnPublicKey: { type: String, default: '' },
  webauthnCounter: { type: Number, default: 0 },
  // How the phone reaches the registered fingerprint (for example "internal" for its
  // built-in sensor), reported when it was registered.
  webauthnTransports: { type: [String], default: [] },
  // When each Time In fingerprint was registered, shown to HR.
  webauthnRegisteredAt: { type: Date, default: null },
  webauthnChallenges: {
    type: [{
      challenge: { type: String, required: true },
      purpose: { type: String, enum: ['registration', 'authentication'], required: true },
      expiresAt: { type: Date, required: true }
    }],
    default: []
  },
  nativeBiometricPublicKey: { type: String, default: '' },
  nativeBiometricRegisteredAt: { type: Date, default: null },
  nativeBiometricChallenge: { type: String, default: '' },
  nativeBiometricChallengeExpiry: { type: Date, default: null },
  // Set when the employee asked to register this phone's fingerprint in place of the old one.
  nativeBiometricChallengeReplacesKey: { type: Boolean, default: false },
  webauthnChallenge: { type: String, default: '' },
  webauthnChallengeExpiry: { type: Date, default: null },
  resetToken: { type: String, default: '' },
  resetTokenExpiry: { type: Date, default: null },
  // Sessions issued before this time are no longer accepted.
  passwordChangedAt: { type: Date, default: null },
  // Notifications created before this are hidden ("Clear all").
  notificationsClearedAt: { type: Date, default: null },
  vacationLeaveCredits: { type: Number, default: DEFAULT_LEAVE_CREDITS },
  sickLeaveCredits: { type: Number, default: DEFAULT_LEAVE_CREDITS },
  // Record of HR's manual balance adjustments (latest 50).
  leaveCreditHistory: {
    type: [{
      changedAt: { type: Date, default: Date.now },
      changedBy: { type: String, default: '' },
      reason: { type: String, default: '' },
      vacationLeaveCredits: Number,
      sickLeaveCredits: Number,
      previousVacationLeaveCredits: Number,
      previousSickLeaveCredits: Number
    }],
    default: []
  },
  // IDs of fingerprint proofs already used for a Time In, so each proof works only once.
  usedVerificationProofIds: { type: [String], default: [], select: false }
}, { timestamps: true });

UserSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password || isPasswordHash(this.password)) return;
  this.password = await hashPassword(this.password);
});

const MongoUser = mongoose.models.User || mongoose.model('User', UserSchema);

function ensureConnected() {
  if (!isConnected()) {
    throw new Error('MongoDB is not connected.');
  }
}

// Adds a fingerprint registration to the enrollment activity HR sees.
const fingerprintRegisteredEvent = (outcome, provider) => ({ $each: [{ timestamp: new Date(), outcome, provider }], $slice: -50 });

// Rounded down to the second, like token issue times, so the new session token issued
// right after a change is still accepted.
const passwordChangeTime = () => new Date(Math.floor(Date.now() / 1000) * 1000);

// Reset tokens are stored as SHA-256 hashes so a database leak cannot be used to reset passwords.
export const hashResetToken = token => crypto.createHash('sha256').update(token).digest('hex');

let dummyPasswordHash;
const getDummyPasswordHash = () => {
  dummyPasswordHash ||= hashPassword(crypto.randomBytes(16).toString('hex'));
  return dummyPasswordHash;
};

export const User = {
  get: async (profileData = {}) => {
    ensureConnected();

    const lookup = profileData.email
      ? { email: profileData.email.toString().trim().toLowerCase() }
      : profileData.employeeId
        ? { employeeId: profileData.employeeId.toString().trim() }
        : {};
    let user = await MongoUser.findOne(lookup);
    if (!user && Object.keys(lookup).length > 0) {
      user = await MongoUser.findOne();
    }
    if (!user) {
      user = await MongoUser.create({
        name: 'Lara Montiano',
        email: 'laramontiano@dilg.gov.ph',
        role: 'Local Government Operations Officer II',
        office: 'Marinduque Provincial Office',
        region: 'DILG Region IV-B - MIMAROPA',
        phoneNumber: '0939 374 9823',
        employeeId: 'DILG-2026-7689'
      });
    }
    return user.toObject();
  },

  create: async (profileData) => {
    ensureConnected();
    const normalized = {
      ...profileData,
      email: profileData.email?.toLowerCase?.() || profileData.email,
    };
    const user = await MongoUser.create(normalized);
    return user.toObject();
  },

  findByEmail: async (email) => {
    ensureConnected();
    if (!email) return null;
    const normalized = email.toLowerCase().trim();
    return MongoUser.findOne({ email: { $regex: new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
  },

  findByAccessLevel: async (accessLevel) => {
    ensureConnected();
    const query = accessLevel === 'employee'
      ? { $or: [{ accessLevel: 'employee' }, { accessLevel: { $exists: false } }, { accessLevel: null }] }
      : { accessLevel };
    return MongoUser.find(query).sort({ name: 1 });
  },

  // Deducts approved leave days from one credit balance, never going below zero.
  deductLeaveCredits: async ({ employeeId, email }, field, days) => {
    ensureConnected();
    if (!['vacationLeaveCredits', 'sickLeaveCredits'].includes(field) || !(days > 0)) return null;
    const owners = [
      ...(employeeId ? [{ employeeId }] : []),
      ...(email ? [{ email: email.toLowerCase() }] : [])
    ];
    if (!owners.length) return null;
    return MongoUser.findOneAndUpdate(
      { $or: owners },
      [{ $set: { [field]: { $max: [0, { $subtract: [{ $ifNull: [`$${field}`, DEFAULT_LEAVE_CREDITS] }, days] }] } } }],
      // Mongoose 9 only runs update pipelines (like this one) when asked to.
      { new: true, updatePipeline: true }
    );
  },

  setNotificationsClearedAt: async (userId, clearedAt) => {
    ensureConnected();
    if (!mongoose.isValidObjectId(userId)) return null;
    return MongoUser.findOneAndUpdate({ _id: userId }, { $set: { notificationsClearedAt: clearedAt } }, { new: true });
  },

  // Sets a new password for a signed-in user (the pre-save hook hashes it) and ends
  // their other sessions.
  changePassword: async (user, newPassword) => {
    ensureConnected();
    user.password = newPassword;
    user.passwordChangedAt = passwordChangeTime();
    user.resetToken = '';
    user.resetTokenExpiry = null;
    await user.save();
    return user;
  },

  // Records a fingerprint proof as used. Returns false when it was already used.
  consumeVerificationProof: async (userId, proofId) => {
    ensureConnected();
    if (!mongoose.isValidObjectId(userId) || typeof proofId !== 'string' || !proofId) return false;
    const result = await MongoUser.updateOne(
      { _id: userId, usedVerificationProofIds: { $ne: proofId } },
      { $push: { usedVerificationProofIds: { $each: [proofId], $slice: -20 } } }
    );
    return result.modifiedCount === 1;
  },

  findById: async (userId) => {
    ensureConnected();
    if (!mongoose.isValidObjectId(userId)) return null;
    return MongoUser.findById(userId);
  },

  findByEmployeeId: async (employeeId) => {
    ensureConnected();
    if (!employeeId) return null;
    return MongoUser.findOne({ employeeId: employeeId.toString().trim() });
  },

  findBiometricEnrollmentById: async (userId) => {
    ensureConnected();
    if (!mongoose.isValidObjectId(userId)) return null;
    return MongoUser.findById(userId)
      .select('employeeId email name accessLevel biometricEnrollmentStatus biometricEnrollmentIsDemo biometricEnrollmentVersion biometricEnrollmentSubmittedAt biometricEnrollmentReviewedAt biometricEnrollmentReviewedBy biometricEnrollmentReviewNote dilgIdPhoto dilgIdBackPhoto faceEnrollmentImage')
      .lean();
  },

  findBiometricEnrollmentByEmployeeId: async (employeeId) => {
    ensureConnected();
    if (!employeeId) return null;
    return MongoUser.findOne({ employeeId: employeeId.toString().trim() })
      .select('employeeId email name accessLevel biometricEnrollmentStatus biometricEnrollmentIsDemo biometricEnrollmentVersion biometricEnrollmentSubmittedAt biometricEnrollmentReviewedAt biometricEnrollmentReviewedBy biometricEnrollmentReviewNote dilgIdPhoto dilgIdBackPhoto faceEnrollmentImage')
      .lean();
  },

  getApprovedFaceEnrollment: async (employeeId) => {
    ensureConnected();
    if (!employeeId) return null;
    const user = await MongoUser.findOne({
      employeeId: employeeId.toString().trim(),
      accessLevel: 'employee',
      biometricEnrollmentStatus: 'hr-approved'
    }).select('+faceEnrollmentDescriptor faceEnrollmentImage').lean();
    return user ? {
      descriptor: user.faceEnrollmentDescriptor || null,
      image: user.faceEnrollmentImage || ''
    } : null;
  },

  hasPendingFaceEnrollmentDescriptor: async (userId) => {
    ensureConnected();
    if (!mongoose.isValidObjectId(userId)) return false;
    const user = await MongoUser.findOne({
      _id: userId,
      accessLevel: 'employee',
      biometricEnrollmentStatus: 'pending'
    }).select('+faceEnrollmentDescriptor').lean();
    return Array.isArray(user?.faceEnrollmentDescriptor)
      && user.faceEnrollmentDescriptor.length === 128
      && user.faceEnrollmentDescriptor.every(Number.isFinite);
  },

  saveApprovedFaceEnrollmentDescriptor: async (employeeId, descriptor) => {
    ensureConnected();
    if (!employeeId) return false;
    const result = await MongoUser.updateOne({
      employeeId: employeeId.toString().trim(),
      accessLevel: 'employee',
      biometricEnrollmentStatus: 'hr-approved',
      $or: [
        { faceEnrollmentDescriptor: { $exists: false } },
        { faceEnrollmentDescriptor: { $size: 0 } }
      ]
    }, {
      $set: { faceEnrollmentDescriptor: descriptor }
    });
    return result.modifiedCount === 1;
  },

  createEmployee: async employeeData => {
    ensureConnected();
    const email = employeeData.email.toString().trim().toLowerCase();
    const employeeId = employeeData.employeeId.toString().trim();
    const emailPattern = new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const existing = await MongoUser.findOne({
      $or: [{ email: emailPattern }, { employeeId }]
    }).select('_id');
    if (existing) return { conflict: true };

    const employee = await MongoUser.create({
      ...employeeData,
      email,
      employeeId,
      accessLevel: 'employee'
    });
    return employee.toObject();
  },

  // Creates an employee account for self-service sign-up (the sign-up form or Google
  // sign-in) with a unique, server-assigned employee ID. Returns null when the account
  // could not be created, for example because the email is already in use.
  createSelfServiceEmployee: async (employeeData) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const employeeId = `DILG-${new Date().getFullYear()}-${crypto.randomInt(100000, 1000000)}`;
      const created = await User.createEmployee({ employmentStatus: 'ACTIVE', ...employeeData, employeeId });
      if (!created?.conflict) return created;
    }
    return null;
  },

  // Supervisor and HR/Admin accounts, sorted by name.
  findStaff: async () => {
    ensureConnected();
    return MongoUser.find({ accessLevel: { $in: ['supervisor', 'hr_admin'] } }).sort({ name: 1 });
  },

  // Any account (employee, supervisor, or HR/Admin) by employee ID or email.
  findAccount: async (identifier) => {
    ensureConnected();
    const value = identifier?.toString().trim();
    if (!value) return null;
    const emailPattern = new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    return MongoUser.findOne({ $or: [{ email: emailPattern }, { employeeId: value }] });
  },

  // Employee accounts that can log in, for the supervisor's dashboard.
  countActiveEmployees: async () => {
    ensureConnected();
    return MongoUser.countDocuments({
      $and: [
        { $or: [{ accessLevel: 'employee' }, { accessLevel: { $exists: false } }, { accessLevel: null }] },
        { $or: [{ accountStatus: { $regex: /^active$/i } }, { accountStatus: { $exists: false } }, { accountStatus: null }] }
      ]
    });
  },

  countActiveAdmins: async () => {
    ensureConnected();
    return MongoUser.countDocuments({
      accessLevel: 'hr_admin',
      $or: [{ accountStatus: { $regex: /^active$/i } }, { accountStatus: { $exists: false } }, { accountStatus: null }]
    });
  },

  // Creates an active Supervisor or HR/Admin account. The employee ID is generated when
  // HR leaves it blank. Returns { conflict } when the email or employee ID is taken.
  createStaffAccount: async (data) => {
    ensureConnected();
    const email = data.email.toLowerCase();
    const emailPattern = new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    if (await MongoUser.findOne({ email: emailPattern }).select('_id')) return { conflict: 'email' };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const employeeId = data.employeeId || `DILG-${new Date().getFullYear()}-${crypto.randomInt(100000, 1000000)}`;
      if (await MongoUser.findOne({ employeeId }).select('_id')) {
        if (data.employeeId) return { conflict: 'employeeId' };
        continue;
      }
      const created = await MongoUser.create({ ...data, email, employeeId, accountStatus: 'Active', employmentStatus: 'ACTIVE' });
      return created.toObject();
    }
    return null;
  },


  updateEmployee: async (identifier, employeeData) => {
    ensureConnected();
    const value = identifier?.toString().trim();
    if (!value) return null;
    const emailPattern = new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const employee = await MongoUser.findOne({
      $and: [
        { $or: [{ employeeId: value }, { email: emailPattern }] },
        { $or: [{ accessLevel: 'employee' }, { accessLevel: { $exists: false } }, { accessLevel: null }] }
      ]
    });
    if (!employee) return null;

    const nextEmail = employeeData.email?.toString().trim().toLowerCase();
    const nextEmployeeId = employeeData.employeeId?.toString().trim();
    if (nextEmail || nextEmployeeId) {
      const duplicateConditions = [];
      if (nextEmail) {
        duplicateConditions.push({
          email: new RegExp(`^${nextEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
        });
      }
      if (nextEmployeeId) duplicateConditions.push({ employeeId: nextEmployeeId });
      const duplicate = await MongoUser.findOne({
        _id: { $ne: employee._id },
        $or: duplicateConditions
      }).select('_id');
      if (duplicate) return { conflict: true };
    }

    // Keep the original WFH approval date and approver when HR saves the employee without
    // changing the approved location.
    const nextWfh = employeeData.approvedWfhLocation;
    const currentWfh = employee.approvedWfhLocation;
    const sameWfhLocation = nextWfh && currentWfh?.approvedAt
      && ['municipality', 'barangay', 'street', 'landmark'].every(field => (nextWfh[field] || '') === (currentWfh[field] || ''));
    const updates = sameWfhLocation
      ? { ...employeeData, approvedWfhLocation: { ...nextWfh, approvedAt: currentWfh.approvedAt, approvedBy: currentWfh.approvedBy } }
      : employeeData;

    employee.set({ ...updates, accessLevel: 'employee' });
    await employee.save();
    return employee.toObject();
  },

  submitBiometricEnrollment: async (userId, enrollment) => {
    ensureConnected();
    if (!userId) return null;
    const now = new Date();
    const savedUser = await MongoUser.findOneAndUpdate(
      {
        _id: userId,
        accessLevel: 'employee',
        ...resubmittableEnrollmentFilter()
      },
      {
        $set: {
          faceProvider: '',
          faceId: '',
          faceEnrolledAt: null,
          faceEnrollmentImage: enrollment.selfieImage,
          faceEnrollmentDescriptor: enrollment.faceDescriptor,
          dilgIdPhoto: enrollment.dilgIdImage,
          dilgIdBackPhoto: enrollment.dilgIdBackImage,
          biometricEnrollmentIsDemo: Boolean(enrollment.isDemoEnrollment),
          biometricEnrollmentStatus: 'pending',
          biometricEnrollmentVersion: 3,
          biometricEnrollmentSubmittedAt: now,
          biometricEnrollmentReviewedAt: null,
          biometricEnrollmentReviewedBy: '',
          biometricEnrollmentReviewNote: '',
          faceLivenessStatus: 'not-configured',
          dilgIdMatchConfidence: null,
          dilgIdVerifiedAt: null,
          dilgIdVerifiedBy: '',
          dilgIdVerifiedDetails: {}
        },
        $push: {
          faceVerificationAudit: {
            $each: [{ outcome: 'employee-submission-pending-liveness-not-configured', provider: 'none' }],
            $slice: -50
          }
        }
      },
      { new: true, runValidators: true, writeConcern: { w: 'majority' } }
    );
    if (savedUser) {
      const persistedEnrollment = await User.findBiometricEnrollmentById(savedUser._id);
      return persistedEnrollment || { persistenceFailure: true, employeeId: savedUser.employeeId };
    }
    const existing = await MongoUser.findById(userId).select('_id accessLevel');
    if (!existing || existing.accessLevel !== 'employee') return null;
    return { conflict: true };
  },

  reviewBiometricEnrollment: async (userId, decision, note, reviewedBy, isDemoEnrollment = false) => {
    ensureConnected();
    if (!mongoose.isValidObjectId(userId)) return null;
    const update = {
      $set: {
        biometricEnrollmentStatus: decision === 'approve' ? 'hr-approved' : 'rejected',
        biometricEnrollmentReviewedAt: new Date(),
        biometricEnrollmentReviewedBy: reviewedBy || '',
        biometricEnrollmentReviewNote: note || '',
        faceLivenessStatus: 'not-configured'
      },
      $push: {
        faceVerificationAudit: {
          $each: [{
            outcome: decision === 'approve'
              ? isDemoEnrollment
                ? 'hr-demo-approved-attendance-test-only'
                : 'hr-approved-liveness-not-configured'
              : 'hr-rejected-enrollment',
            reviewedBy: reviewedBy || '',
            provider: 'manual-hr-review'
          }],
          $slice: -50
        }
      }
    };
    if (decision === 'reject') update.$unset = { faceEnrollmentDescriptor: 1 };
    const user = await MongoUser.findOneAndUpdate(
      {
        _id: userId,
        accessLevel: 'employee',
        biometricEnrollmentStatus: 'pending'
      },
      update,
      { new: true, runValidators: true }
    );
    return user ? user.toObject() : { conflict: true };
  },

  addFaceVerificationAudit: async (employeeId, event) => {
    ensureConnected();
    return MongoUser.findOneAndUpdate(
      { employeeId: employeeId?.toString().trim() },
      { $push: { faceVerificationAudit: { $each: [event], $slice: -50 } } },
      { new: true }
    );
  },

  saveWebAuthnChallenge: async (userId, challenge, expiry, purpose) => {
    ensureConnected();
    if (!mongoose.isValidObjectId(userId) || !['registration', 'authentication'].includes(purpose)) return null;
    return MongoUser.findOneAndUpdate(
      { _id: userId },
      {
        $push: {
          webauthnChallenges: {
            $each: [{ challenge, purpose, expiresAt: expiry }],
            $slice: -10
          }
        }
      },
      { new: true, writeConcern: { w: 'majority' } }
    );
  },

  consumeWebAuthnChallenge: async (userId, challenge, purpose) => {
    ensureConnected();
    if (!mongoose.isValidObjectId(userId) || !['registration', 'authentication'].includes(purpose)) return null;
    const challengeFilter = {
      challenge,
      purpose,
      expiresAt: { $gt: new Date() }
    };
    return MongoUser.findOneAndUpdate(
      { _id: userId, webauthnChallenges: { $elemMatch: challengeFilter } },
      { $pull: { webauthnChallenges: { challenge, purpose } } },
      { new: true, writeConcern: { w: 'majority' } }
    );
  },

  completeNativeBiometricRegistration: async (userId, challenge, publicKey) => {
    ensureConnected();
    if (!mongoose.isValidObjectId(userId)) return null;
    return MongoUser.findOneAndUpdate(
      { _id: userId, nativeBiometricChallenge: challenge, nativeBiometricChallengeExpiry: { $gt: new Date() } },
      {
        $set: {
          nativeBiometricPublicKey: publicKey,
          nativeBiometricRegisteredAt: new Date(),
          nativeBiometricChallenge: '',
          nativeBiometricChallengeExpiry: null,
          nativeBiometricChallengeReplacesKey: false
        },
        $push: { faceVerificationAudit: fingerprintRegisteredEvent('phone-app-fingerprint-registered', 'workmate-phone-app') }
      },
      { new: true, writeConcern: { w: 'majority' } }
    );
  },

  saveNativeBiometricChallenge: async (userId, challenge, expiry, replacesKey = false) => {
    ensureConnected();
    if (!mongoose.isValidObjectId(userId)) return null;
    return MongoUser.findOneAndUpdate(
      { _id: userId },
      { $set: { nativeBiometricChallenge: challenge, nativeBiometricChallengeExpiry: expiry, nativeBiometricChallengeReplacesKey: replacesKey === true } },
      { new: true, writeConcern: { w: 'majority' } }
    );
  },

  consumeNativeBiometricChallenge: async (userId, challenge) => {
    ensureConnected();
    if (!mongoose.isValidObjectId(userId)) return null;
    return MongoUser.findOneAndUpdate(
      { _id: userId, nativeBiometricChallenge: challenge, nativeBiometricChallengeExpiry: { $gt: new Date() } },
      { $set: { nativeBiometricChallenge: '', nativeBiometricChallengeExpiry: null, nativeBiometricChallengeReplacesKey: false } },
      { new: true, writeConcern: { w: 'majority' } }
    );
  },

  saveWebAuthnCredential: async (userId, credential) => {
    ensureConnected();
    if (!mongoose.isValidObjectId(userId)) return null;
    return MongoUser.findOneAndUpdate(
      { _id: userId },
      {
        $set: {
          webauthnCredentialId: credential.id,
          webauthnPublicKey: credential.publicKey,
          webauthnCounter: credential.counter,
          webauthnTransports: credential.transports || [],
          webauthnRegisteredAt: new Date(),
          webauthnChallenge: '',
          webauthnChallengeExpiry: null
        },
        $push: { faceVerificationAudit: fingerprintRegisteredEvent('browser-fingerprint-registered', 'browser-passkey') }
      },
      { new: true, writeConcern: { w: 'majority' } }
    );
  },

  updateWebAuthnCounter: async (userId, counter) => {
    ensureConnected();
    if (!mongoose.isValidObjectId(userId)) return null;
    return MongoUser.findOneAndUpdate(
      { _id: userId },
      { $set: { webauthnCounter: counter } },
      { new: true, writeConcern: { w: 'majority' } }
    );
  },

  findByPhoneNumber: async (phoneNumber) => {
    ensureConnected();
    const normalized = phoneNumber?.toString().replace(/[\s()-]/g, '').replace(/^\+63/, '0');
    if (!normalized) return null;
    const users = await MongoUser.find({ phoneNumber: { $exists: true, $ne: '' } });
    return users.find(user => user.phoneNumber.toString().replace(/[\s()-]/g, '').replace(/^\+63/, '0') === normalized) || null;
  },

  verifyPassword: async (user, password) => {
    if (!user) {
      // Spend the same bcrypt time as a real check so response timing does not reveal unknown emails.
      await checkPassword(String(password ?? ''), await getDummyPasswordHash());
      return false;
    }
    if (!(await checkPassword(password, user.password || ''))) return false;
    if (!isPasswordHash(user.password)) {
      user.password = await hashPassword(password);
      await user.save();
    }
    return true;
  },

  hashLegacyPasswords: async () => {
    ensureConnected();
    const users = await MongoUser.find({ password: { $exists: true, $type: 'string', $ne: '' } });
    let migratedCount = 0;
    for (const user of users) {
      if (isPasswordHash(user.password)) continue;
      user.password = await hashPassword(user.password);
      await user.save();
      migratedCount += 1;
    }
    return migratedCount;
  },

  updateAccountStatus: async (identifier, accountStatus) => {
    ensureConnected();
    const value = identifier?.toString().trim();
    if (!value) return null;
    const emailPattern = new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const user = await MongoUser.findOne({
      $and: [
        { $or: [{ email: emailPattern }, { employeeId: value }] },
        { $or: [{ accessLevel: 'employee' }, { accessLevel: { $exists: false } }, { accessLevel: null }] }
      ]
    });
    if (!user) return null;
    user.accountStatus = accountStatus;
    await user.save();
    return user.toObject();
  },

  // Sets an employee's leave balances (HR adjustment) and records the change.
  setLeaveCredits: async (identifier, credits, { reason, changedBy }) => {
    ensureConnected();
    const value = identifier?.toString().trim();
    if (!value) return null;
    const emailPattern = new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const employee = await MongoUser.findOne({
      $and: [
        { $or: [{ email: emailPattern }, { employeeId: value }] },
        { $or: [{ accessLevel: 'employee' }, { accessLevel: { $exists: false } }, { accessLevel: null }] }
      ]
    });
    if (!employee) return null;
    const entry = {
      changedAt: new Date(),
      changedBy,
      reason,
      ...credits,
      previousVacationLeaveCredits: employee.vacationLeaveCredits,
      previousSickLeaveCredits: employee.sickLeaveCredits
    };
    employee.set(credits);
    employee.leaveCreditHistory = [...(employee.leaveCreditHistory || []), entry].slice(-50);
    await employee.save();
    return employee.toObject();
  },

  // Permanently deletes an employee account that is not Active. Returns
  // { deleted } on success, { active: true } when the account must be deactivated
  // first, or null when no employee account matches. Attendance and request records
  // are separate documents and are kept.
  deleteEmployee: async (identifier) => {
    ensureConnected();
    const value = identifier?.toString().trim();
    if (!value) return null;
    const emailPattern = new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const employeeMatch = {
      $and: [
        { $or: [{ email: emailPattern }, { employeeId: value }] },
        { $or: [{ accessLevel: 'employee' }, { accessLevel: { $exists: false } }, { accessLevel: null }] }
      ]
    };
    const deleted = await MongoUser.findOneAndDelete({
      $and: [...employeeMatch.$and, { accountStatus: { $not: /^active$/i } }]
    });
    if (deleted) return { deleted: deleted.toObject() };
    const existing = await MongoUser.findOne(employeeMatch).select('_id');
    return existing ? { active: true } : null;
  },

  setPasswordResetToken: async (email, token, expiry) => {
    ensureConnected();
    const normalized = email?.toLowerCase?.().trim();
    if (!normalized) return null;
    const user = await MongoUser.findOne({ email: { $regex: new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
    if (!user) return null;
    user.resetToken = hashResetToken(token);
    user.resetTokenExpiry = expiry;
    await user.save();
    return user.toObject();
  },

  // Sets a new password with an emailed reset token. The token is cleared in the same step
  // that finds it, so one link can never set the password twice, even if opened twice at
  // once. An account without a password (Google sign-in only) is never reset this way,
  // since that would add a password to it.
  resetPasswordByToken: async (token, password) => {
    ensureConnected();
    if (!token || !password) return null;
    if (typeof token !== 'string') return null;
    const user = await MongoUser.findOneAndUpdate(
      { resetToken: hashResetToken(token), resetTokenExpiry: { $gt: new Date() }, password: { $nin: ['', null] } },
      { $set: { resetToken: '', resetTokenExpiry: null } },
      { new: true }
    );
    if (!user) return null;
    user.password = password;
    user.passwordChangedAt = passwordChangeTime();
    await user.save();
    return user.toObject();
  },

  update: async (profileData) => {
    ensureConnected();

    const lookup = profileData?.lookupEmail || profileData?.email
      ? { email: (profileData.lookupEmail || profileData.email).toString().trim().toLowerCase() }
      : profileData?.employeeId
        ? { employeeId: profileData.employeeId.toString().trim() }
        : {};

    let user = Object.keys(lookup).length > 0
      ? await MongoUser.findOne(lookup)
      : await MongoUser.findOne();

    if (!user) {
      user = new MongoUser({
        name: 'Juan Dela Cruz',
        email: 'juan.delacruz@dilg.gov.ph',
        role: 'Local Government Operations Officer II',
        office: 'Marinduque Provincial Office',
        region: 'DILG Region IV-B - MIMAROPA',
        phoneNumber: '+63 917 123 4567',
        employeeId: 'DILG-2024-8842'
      });
    }

    Object.assign(user, profileData);
    await user.save();
    return user.toObject();
  },

  seedDefaultAccounts: async () => {
    ensureConnected();

    const defaultAccounts = [
      {
        name: 'German F. Yap, CESO V',
        email: 'german.yap@dilg.gov.ph',
        password: process.env.DEFAULT_SUPERVISOR_PASSWORD || '',
        role: 'Provincial Director',
        office: 'Marinduque Provincial Office',
        region: 'DILG Region IV-B - MIMAROPA',
        phoneNumber: '+63 918 842 1290',
        employeeId: 'DILG-1998-0241',
        accessLevel: 'supervisor'
      },
      {
        name: 'Patricia Anne Ortiz',
        email: 'patricia.ortiz@dilg.gov.ph',
        password: process.env.DEFAULT_HR_ADMIN_PASSWORD || '',
        role: 'HR Administrative Officer V',
        office: 'Provincial Administrative Section',
        region: 'DILG Region IV-B - MIMAROPA',
        phoneNumber: '+63 920 334 5512',
        employeeId: 'DILG-2015-4421',
        accessLevel: 'hr_admin'
      }
    ];

    const configuredAccounts = defaultAccounts.filter(account => account.password.length >= 12);
    return Promise.all(configuredAccounts.map(async account => {
      const existingUser = await MongoUser.findOne({ email: account.email });
      if (!existingUser) return MongoUser.create(account);
      if (existingUser.password && !isPasswordHash(existingUser.password)) {
        existingUser.password = await hashPassword(existingUser.password);
        await existingUser.save();
      }
      return existingUser;
    }));
  }
};
