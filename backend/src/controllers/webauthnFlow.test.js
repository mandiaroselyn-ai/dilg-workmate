import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { isoCBOR } from '@simplewebauthn/server/helpers';

// End-to-end fingerprint check with a simulated phone: the phone registers its
// fingerprint key on Biometric Enrollment, then signs the Time In challenge with it.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'webauthn-flow-test-secret';
process.env.FRONTEND_URL = 'https://dilg-workmate.vercel.app';
process.env.WEBAUTHN_RP_ID = 'dilg-workmate.vercel.app';
const { User } = await import('../models/User.js');
const {
  createAuthenticationOptions,
  createRegistrationOptions,
  verifyAuthentication,
  verifyRegistration
} = await import('./webauthnController.js');
const { readVerificationProof } = await import('../utils/verificationProof.js');

const ORIGIN = 'https://dilg-workmate.vercel.app';
const RP_ID = 'dilg-workmate.vercel.app';
const sha256 = data => crypto.createHash('sha256').update(data).digest();
const b64url = data => Buffer.from(data).toString('base64url');

// A phone with a built-in fingerprint sensor that keeps one signing key.
const createPhone = () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credentialId = crypto.randomBytes(16);
  let counter = 0;
  const authData = (flags, extra = Buffer.alloc(0)) => {
    const count = Buffer.alloc(4);
    count.writeUInt32BE(counter);
    return Buffer.concat([sha256(RP_ID), Buffer.from([flags]), count, extra]);
  };
  const clientData = (type, challenge) => Buffer.from(JSON.stringify({ type, challenge, origin: ORIGIN, crossOrigin: false }));

  return {
    credentialId: b64url(credentialId),
    register(challenge) {
      const coseKey = new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]);
      const idLength = Buffer.alloc(2);
      idLength.writeUInt16BE(credentialId.length);
      const attestedData = Buffer.concat([Buffer.alloc(16), idLength, credentialId, Buffer.from(isoCBOR.encode(coseKey))]);
      const attestationObject = isoCBOR.encode(new Map([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData(0x45, attestedData)] // user present + verified + key included
      ]));
      return {
        id: b64url(credentialId),
        rawId: b64url(credentialId),
        type: 'public-key',
        response: { clientDataJSON: b64url(clientData('webauthn.create', challenge)), attestationObject: b64url(attestationObject), transports: ['internal'] },
        clientExtensionResults: {}
      };
    },
    // `claimedId` lets a test present another phone's credential ID.
    sign(challenge, claimedId = b64url(credentialId)) {
      counter += 1;
      const data = authData(0x05); // user present + verified by fingerprint
      const clientDataJSON = clientData('webauthn.get', challenge);
      const signature = crypto.sign('sha256', Buffer.concat([data, sha256(clientDataJSON)]), privateKey);
      return {
        id: claimedId,
        rawId: claimedId,
        type: 'public-key',
        response: { authenticatorData: b64url(data), clientDataJSON: b64url(clientDataJSON), signature: b64url(signature) },
        clientExtensionResults: {}
      };
    }
  };
};

// Keeps the employee record in memory instead of MongoDB.
const useEmployeeStore = t => {
  const employee = {
    _id: '64b000000000000000000002',
    employeeId: 'EMP-FP-1',
    email: 'fingerprint.test@dilg.gov.ph',
    name: 'Fingerprint Tester',
    webauthnCredentialId: '',
    webauthnPublicKey: '',
    webauthnCounter: 0,
    webauthnTransports: []
  };
  const challenges = [];
  const originals = {};
  const replace = (name, fn) => { originals[name] = User[name]; User[name] = fn; };
  replace('saveWebAuthnChallenge', async (_id, challenge, _expiry, purpose) => { challenges.push({ challenge, purpose }); return employee; });
  replace('consumeWebAuthnChallenge', async (_id, challenge, purpose) => {
    const index = challenges.findIndex(item => item.challenge === challenge && item.purpose === purpose);
    if (index < 0) return null;
    challenges.splice(index, 1);
    return employee;
  });
  replace('saveWebAuthnCredential', async (_id, credential) => Object.assign(employee, {
    webauthnCredentialId: credential.id,
    webauthnPublicKey: credential.publicKey,
    webauthnCounter: credential.counter,
    webauthnTransports: credential.transports
  }));
  replace('updateWebAuthnCounter', async (_id, counter) => Object.assign(employee, { webauthnCounter: counter }));
  t.after(() => Object.assign(User, originals));
  return employee;
};

const call = async (handler, employee, body) => {
  let statusCode = 200;
  let payload;
  const res = { status(code) { statusCode = code; return this; }, json(value) { payload = value; return this; } };
  await handler({ user: employee, body, headers: { host: RP_ID, origin: ORIGIN }, get: () => undefined }, res);
  return { statusCode, body: payload };
};

const registerPhone = async (employee, phone) => {
  const options = await call(createRegistrationOptions, employee);
  assert.equal(options.statusCode, 200);
  assert.equal(options.body.authenticatorSelection.authenticatorAttachment, 'platform');
  const saved = await call(verifyRegistration, employee, { ...phone.register(options.body.challenge), challenge: options.body.challenge });
  assert.equal(saved.statusCode, 201, JSON.stringify(saved.body));
};

test('Time In accepts the fingerprint from the phone registered on Biometric Enrollment', async t => {
  const employee = useEmployeeStore(t);
  const phone = createPhone();
  await registerPhone(employee, phone);
  assert.equal(employee.webauthnCredentialId, phone.credentialId);
  assert.deepEqual(employee.webauthnTransports, ['internal']);

  for (let day = 1; day <= 2; day += 1) {
    const options = await call(createAuthenticationOptions, employee);
    assert.equal(options.statusCode, 200);
    assert.deepEqual(options.body.allowCredentials.map(item => item.id), [phone.credentialId]);
    const result = await call(verifyAuthentication, employee, { ...phone.sign(options.body.challenge), challenge: options.body.challenge });
    assert.equal(result.statusCode, 200, JSON.stringify(result.body));
    const proof = readVerificationProof(result.body.verificationProof, { employeeId: 'EMP-FP-1', type: 'fingerprint' });
    assert.equal(proof?.method, 'browser');
  }
});

test('Time In rejects a fingerprint from a phone that was not registered', async t => {
  const employee = useEmployeeStore(t);
  const registeredPhone = createPhone();
  const otherPhone = createPhone();
  await registerPhone(employee, registeredPhone);

  for (const claimedId of [otherPhone.credentialId, registeredPhone.credentialId]) {
    const options = await call(createAuthenticationOptions, employee);
    const result = await call(verifyAuthentication, employee, { ...otherPhone.sign(options.body.challenge, claimedId), challenge: options.body.challenge });
    assert.equal(result.statusCode, 401);
    assert.equal(result.body.verificationProof, undefined);
  }
});

test('a fingerprint check cannot be replayed for a second Time In', async t => {
  const employee = useEmployeeStore(t);
  const phone = createPhone();
  await registerPhone(employee, phone);

  const options = await call(createAuthenticationOptions, employee);
  const assertion = { ...phone.sign(options.body.challenge), challenge: options.body.challenge };
  assert.equal((await call(verifyAuthentication, employee, assertion)).statusCode, 200);
  assert.equal((await call(verifyAuthentication, employee, assertion)).statusCode, 400);
});

test('Time In asks employees without a registered fingerprint to enroll first', async t => {
  const employee = useEmployeeStore(t);
  const result = await call(createAuthenticationOptions, employee);
  assert.equal(result.statusCode, 404);
});
