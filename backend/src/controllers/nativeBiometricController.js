import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { createVerificationProof } from '../utils/verificationProof.js';
import {
  createNativeBiometricChallenge,
  verifyNativeBiometricSignature
} from '../utils/nativeBiometric.js';

const challengeExpiry = () => new Date(Date.now() + 5 * 60 * 1000);

export const createNativeBiometricOptions = async (req, res) => {
  try {
    const challenge = createNativeBiometricChallenge();
    const savedChallenge = await User.saveNativeBiometricChallenge(req.user._id, challenge, challengeExpiry());
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

  const registrationRequired = !user.nativeBiometricPublicKey;
  const verificationKey = registrationRequired ? publicKey : user.nativeBiometricPublicKey;
  if (!verifyNativeBiometricSignature({ publicKey: verificationKey, challenge, signature })) {
    return res.status(401).json({ success: false, error: 'Phone fingerprint verification failed.' });
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
