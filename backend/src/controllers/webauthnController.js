import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from '@simplewebauthn/server';
import { User } from '../models/User.js';
import { createVerificationProof } from '../utils/verificationProof.js';
import { getFrontendOrigin } from '../utils/frontendOrigin.js';

const getRpId = () => {
  const configuredRpId = process.env.WEBAUTHN_RP_ID;
  const isLocalRpId = configuredRpId === 'localhost' || configuredRpId === '127.0.0.1';
  if (configuredRpId && !(process.env.VERCEL && isLocalRpId)) return configuredRpId;
  return new URL(getFrontendOrigin()).hostname;
};
const getOrigin = () => getFrontendOrigin();
const toBase64Url = value => Buffer.from(value).toString('base64url');
const challengeExpiry = () => new Date(Date.now() + 5 * 60 * 1000);

export const createRegistrationOptions = async (req, res) => {
  try {
    const user = req.user;
    const options = await generateRegistrationOptions({
      rpName: 'DILG WorkMate',
      rpID: getRpId(),
      userName: user.email,
      userID: Buffer.from(user.employeeId || user.email),
      userDisplayName: user.name,
      attestationType: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'required'
      },
      excludeCredentials: user.webauthnCredentialId ? [{ id: user.webauthnCredentialId }] : []
    });

    await User.saveWebAuthnChallenge(user.employeeId, options.challenge, challengeExpiry());
    res.status(200).json(options);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyRegistration = async (req, res) => {
  try {
    const user = req.user;
    if (!user.webauthnChallenge || !user.webauthnChallengeExpiry || user.webauthnChallengeExpiry <= new Date()) {
      return res.status(400).json({ success: false, error: 'WebAuthn registration challenge expired.' });
    }

    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: user.webauthnChallenge,
      expectedOrigin: getOrigin(),
      expectedRPID: getRpId(),
      requireUserVerification: true
    });
    if (!verification.verified) return res.status(400).json({ success: false, error: 'WebAuthn registration was not verified.' });

    const credential = verification.registrationInfo.credential;
    await User.saveWebAuthnCredential(user.employeeId, {
      id: credential.id,
      publicKey: toBase64Url(credential.publicKey),
      counter: credential.counter
    });
    res.status(201).json({ success: true, credentialId: credential.id });
  } catch (error) {
    res.status(400).json({ success: false, error: 'WebAuthn registration failed.' });
  }
};

export const createAuthenticationOptions = async (req, res) => {
  try {
    const user = req.user;
    if (!user.webauthnCredentialId || !user.webauthnPublicKey) {
      return res.status(404).json({ success: false, error: 'No server-registered biometric credential found.' });
    }

    const options = await generateAuthenticationOptions({
      rpID: getRpId(),
      allowCredentials: [{ id: user.webauthnCredentialId }],
      userVerification: 'required'
    });
    await User.saveWebAuthnChallenge(user.employeeId, options.challenge, challengeExpiry());
    res.status(200).json(options);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyAuthentication = async (req, res) => {
  try {
    const user = req.user;
    if (!user.webauthnCredentialId || !user.webauthnPublicKey || !user.webauthnChallenge || !user.webauthnChallengeExpiry || user.webauthnChallengeExpiry <= new Date()) {
      return res.status(400).json({ success: false, error: 'WebAuthn authentication challenge expired or credential is missing.' });
    }

    const verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge: user.webauthnChallenge,
      expectedOrigin: getOrigin(),
      expectedRPID: getRpId(),
      credential: {
        id: user.webauthnCredentialId,
        publicKey: Buffer.from(user.webauthnPublicKey, 'base64url'),
        counter: user.webauthnCounter || 0
      },
      requireUserVerification: true
    });
    if (!verification.verified) return res.status(401).json({ success: false, error: 'WebAuthn biometric assertion was not verified.' });

    await User.updateWebAuthnCounter(user.employeeId, verification.authenticationInfo.newCounter);
    await User.saveWebAuthnChallenge(user.employeeId, '', new Date(0));
    const proof = createVerificationProof({ employeeId: user.employeeId, type: 'fingerprint' });
    res.status(200).json({ success: true, verificationProof: proof });
  } catch (error) {
    res.status(401).json({ success: false, error: 'WebAuthn biometric assertion failed.' });
  }
};
