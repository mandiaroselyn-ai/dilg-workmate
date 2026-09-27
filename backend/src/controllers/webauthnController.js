import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from '@simplewebauthn/server';
import { User } from '../models/User.js';
import { createVerificationProof } from '../utils/verificationProof.js';
import { getFrontendOrigin, getRequestOrigin } from '../utils/frontendOrigin.js';

const getOrigin = req => getRequestOrigin(req) || getFrontendOrigin(req);
const getRpId = req => {
  const configuredRpId = process.env.WEBAUTHN_RP_ID;
  const isLocalRpId = configuredRpId === 'localhost' || configuredRpId === '127.0.0.1';
  const requestHostname = new URL(getOrigin(req)).hostname;
  const configuredMatchesRequest = configuredRpId
    && (requestHostname === configuredRpId || requestHostname.endsWith(`.${configuredRpId}`));
  if (configuredMatchesRequest && !(process.env.VERCEL && isLocalRpId)) return configuredRpId;
  return requestHostname;
};
const toBase64Url = value => Buffer.from(value).toString('base64url');
const challengeExpiry = () => new Date(Date.now() + 10 * 60 * 1000);

export const createRegistrationOptions = async (req, res) => {
  try {
    const user = req.user;
    const options = await generateRegistrationOptions({
      rpName: 'DILG WorkMate',
      rpID: getRpId(req),
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

    const savedChallenge = await User.saveWebAuthnChallenge(user._id, options.challenge, challengeExpiry());
    if (!savedChallenge) throw new Error('Could not save the passkey registration challenge.');
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
      expectedOrigin: getOrigin(req),
      expectedRPID: getRpId(req),
      requireUserVerification: true
    });
    if (!verification.verified) return res.status(400).json({ success: false, error: 'WebAuthn registration was not verified.' });

    const credential = verification.registrationInfo.credential;
    const savedCredential = await User.saveWebAuthnCredential(user._id, {
      id: credential.id,
      publicKey: toBase64Url(credential.publicKey),
      counter: credential.counter
    });
    if (!savedCredential) throw new Error('Could not save the passkey credential.');
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
      rpID: getRpId(req),
      allowCredentials: [{ id: user.webauthnCredentialId }],
      userVerification: 'required'
    });
    const savedChallenge = await User.saveWebAuthnChallenge(user._id, options.challenge, challengeExpiry());
    if (!savedChallenge) throw new Error('Could not save the passkey authentication challenge.');
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
      expectedOrigin: getOrigin(req),
      expectedRPID: getRpId(req),
      credential: {
        id: user.webauthnCredentialId,
        publicKey: Buffer.from(user.webauthnPublicKey, 'base64url'),
        counter: user.webauthnCounter || 0
      },
      requireUserVerification: true
    });
    if (!verification.verified) return res.status(401).json({ success: false, error: 'WebAuthn biometric assertion was not verified.' });

    const updatedUser = await User.updateWebAuthnCounter(user._id, verification.authenticationInfo.newCounter);
    if (!updatedUser) throw new Error('Could not update the passkey counter.');
    await User.saveWebAuthnChallenge(user._id, '', new Date(0));
    const proof = createVerificationProof({ employeeId: user.employeeId, type: 'fingerprint' });
    res.status(200).json({ success: true, verificationProof: proof });
  } catch (error) {
    res.status(401).json({ success: false, error: 'WebAuthn biometric assertion failed.' });
  }
};
