import crypto from 'node:crypto';
import { Announcement } from '../models/announcementModel.js';
import { User } from '../models/User.js';
import { createVerificationProof } from '../utils/verificationProof.js';
import {
  createNativeBiometricChallenge,
  verifyNativeBiometricSignature
} from '../utils/nativeBiometric.js';

const challengeExpiry = () => new Date(Date.now() + 5 * 60 * 1000);

export const PHONE_KEY_CHANGED_MESSAGE = 'This phone\'s fingerprint key does not match the one registered to your account. This happens after adding a new fingerprint to the phone, reinstalling WorkMate, or changing phones. Tap "Register This Phone" to send this phone to HR for approval.';
export const PHONE_KEY_SENT_MESSAGE = 'This phone was sent to HR for approval. You can use it for attendance once HR approves it. Until then, use the phone you registered before, or ask HR to approve this one.';
export const PHONE_KEY_PENDING_MESSAGE = 'This phone is still waiting for HR to approve it. Until HR approves it, use the phone you registered before, or ask HR to approve this one in Employees.';

// Tells HR that an employee registered a new phone or browser fingerprint that waits for them.
export const notifyHrOfFingerprintChange = async (user, source) => {
  try {
    await Announcement.createNotification({
      title: 'New Fingerprint Device for Approval',
      message: `${user.name || 'An employee'} registered a new ${source} for fingerprint attendance, in place of the one registered before. Approve it in Employees if the employee really changed devices; until then the old one stays in use.`,
      type: 'biometric_enrollment',
      recipientRole: 'hr_admin',
      action: 'review_enrollment',
      targetId: user.employeeId || user.email
    });
  } catch (error) {
    console.error('Unable to notify HR about a new fingerprint device:', error);
  }
};

export const createNativeBiometricOptions = async (req, res) => {
  try {
    const challenge = createNativeBiometricChallenge();
    // The employee asked to register this phone in place of the old fingerprint key.
    const replacesKey = req.body?.replaceRegisteredKey === true && Boolean(req.user.nativeBiometricPublicKey);
    const savedChallenge = await User.saveNativeBiometricChallenge(req.user._id, challenge, challengeExpiry(), replacesKey);
    if (!savedChallenge) throw new Error('Could not save the native biometric challenge.');
    return res.status(200).json({
      challenge,
      keyId: crypto.createHash('sha256').update(req.user._id.toString()).digest('hex').slice(0, 32),
      registrationRequired: !req.user.nativeBiometricPublicKey
    });
  } catch (error) {
    console.error('Native biometric challenge creation failed:', error);
    return res.status(500).json({ success: false, error: 'Unable to start phone fingerprint verification.' });
  }
};

export const verifyNativeBiometric = async (req, res) => {
  const { challenge, signature, publicKey } = req.body || {};
  const user = req.user;
  if (typeof challenge !== 'string' || challenge.length !== 43
    || typeof signature !== 'string' || signature.length > 512
    || (publicKey !== undefined && (typeof publicKey !== 'string' || publicKey.length > 512))) {
    return res.status(400).json({ success: false, error: 'Invalid phone fingerprint verification data.' });
  }
  if (!challenge || challenge !== user.nativeBiometricChallenge
    || !user.nativeBiometricChallengeExpiry || user.nativeBiometricChallengeExpiry <= new Date()) {
    return res.status(400).json({ success: false, error: 'Phone fingerprint challenge expired. Please retry.' });
  }

  const registeredKey = user.nativeBiometricPublicKey;
  const isOtherKey = Boolean(registeredKey) && typeof publicKey === 'string' && publicKey !== registeredKey;
  const replacingKey = isOtherKey && user.nativeBiometricChallengeReplacesKey === true;
  // The first phone is registered right away; a phone in place of it waits for HR.
  const registrationRequired = !registeredKey;
  const verificationKey = registrationRequired || replacingKey ? publicKey : registeredKey;
  if (!verifyNativeBiometricSignature({ publicKey: verificationKey, challenge, signature })) {
    // A valid signature from a different key means the phone's key changed, not a wrong finger.
    if (isOtherKey && verifyNativeBiometricSignature({ publicKey, challenge, signature })) {
      return publicKey === user.nativeBiometricPendingKey
        ? res.status(409).json({ success: false, code: 'phone-key-pending', error: PHONE_KEY_PENDING_MESSAGE })
        : res.status(409).json({ success: false, code: 'phone-key-changed', error: PHONE_KEY_CHANGED_MESSAGE });
    }
    return res.status(401).json({ success: false, error: 'Phone fingerprint verification failed.' });
  }

  if (replacingKey) {
    // HR hears once for each new phone, not again when the employee taps the button twice.
    const alreadyWaiting = user.nativeBiometricPendingKey === publicKey;
    let savedUser;
    try {
      savedUser = await User.requestNativeBiometricReplacement(user._id, challenge, publicKey);
    } catch (error) {
      console.error('Native biometric replacement request failed:', error);
      return res.status(500).json({ success: false, error: 'Could not send this phone to HR for approval.' });
    }
    if (!savedUser) return res.status(400).json({ success: false, error: 'Phone fingerprint challenge expired. Please retry.' });
    if (!alreadyWaiting) await notifyHrOfFingerprintChange(user, 'phone (WorkMate app)');
    return res.status(202).json({ success: false, pending: true, code: 'phone-key-pending', error: PHONE_KEY_SENT_MESSAGE });
  }

  if (registrationRequired) {
    let savedUser;
    try {
      savedUser = await User.completeNativeBiometricRegistration(user._id, challenge, publicKey);
    } catch (error) {
      console.error('Native biometric registration failed:', error);
      return res.status(500).json({ success: false, error: 'Could not save phone fingerprint registration.' });
    }
    if (!savedUser) return res.status(400).json({ success: false, error: 'Phone fingerprint challenge expired. Please retry.' });
  } else {
    let verifiedUser;
    try {
      verifiedUser = await User.consumeNativeBiometricChallenge(user._id, challenge);
    } catch (error) {
      console.error('Native biometric challenge verification failed:', error);
      return res.status(500).json({ success: false, error: 'Could not complete phone fingerprint verification.' });
    }
    if (!verifiedUser) return res.status(400).json({ success: false, error: 'Phone fingerprint challenge expired. Please retry.' });
  }

  const proof = createVerificationProof({ employeeId: user.employeeId, type: 'fingerprint', method: 'phone-app' });
  return res.status(200).json({ success: true, verificationProof: proof });
};
