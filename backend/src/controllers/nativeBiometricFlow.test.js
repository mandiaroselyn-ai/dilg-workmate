import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

// Simulates the WorkMate Android app, which signs each Time In challenge with a
// fingerprint-protected key kept on the phone.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'native-flow-test-secret';
const { User } = await import('../models/User.js');
const { createNativeBiometricOptions, verifyNativeBiometric } = await import('./nativeBiometricController.js');
const { readVerificationProof } = await import('../utils/verificationProof.js');

const createPhoneKey = () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'),
    sign: challenge => crypto.sign('sha256', Buffer.from(challenge, 'utf8'), privateKey).toString('base64url')
  };
};

// Keeps the employee record in memory instead of MongoDB.
const useEmployeeStore = t => {
  const employee = { _id: '64b000000000000000000003', employeeId: 'EMP-APP-1', nativeBiometricPublicKey: '' };
  const originals = {};
  const replace = (name, fn) => { originals[name] = User[name]; User[name] = fn; };
  const liveChallenge = challenge => challenge === employee.nativeBiometricChallenge && employee.nativeBiometricChallengeExpiry > new Date();
  const clearChallenge = () => Object.assign(employee, { nativeBiometricChallenge: '', nativeBiometricChallengeExpiry: null, nativeBiometricChallengeReplacesKey: false });
  replace('saveNativeBiometricChallenge', async (_id, challenge, expiry, replacesKey = false) => Object.assign(employee, {
    nativeBiometricChallenge: challenge,
    nativeBiometricChallengeExpiry: expiry,
    nativeBiometricChallengeReplacesKey: replacesKey === true
  }));
  replace('completeNativeBiometricRegistration', async (_id, challenge, publicKey) => {
    if (!liveChallenge(challenge)) return null;
    clearChallenge();
    return Object.assign(employee, { nativeBiometricPublicKey: publicKey });
  });
  replace('consumeNativeBiometricChallenge', async (_id, challenge) => (liveChallenge(challenge) ? clearChallenge() : null));
  t.after(() => Object.assign(User, originals));
  return employee;
};

const call = async (handler, employee, body) => {
  let statusCode = 200;
  let payload;
  const res = { status(code) { statusCode = code; return this; }, json(value) { payload = value; return this; } };
  await handler({ user: { ...employee }, body }, res);
  return { statusCode, body: payload };
};

const verifyWith = async (employee, phoneKey, { replaceRegisteredKey = false, signWith = phoneKey } = {}) => {
  const options = await call(createNativeBiometricOptions, employee, replaceRegisteredKey ? { replaceRegisteredKey } : {});
  assert.equal(options.statusCode, 200);
  return call(verifyNativeBiometric, employee, {
    challenge: options.body.challenge,
    signature: signWith.sign(options.body.challenge),
    publicKey: phoneKey.publicKey
  });
};

test('the app registers the phone fingerprint on first use and accepts it afterwards', async t => {
  const employee = useEmployeeStore(t);
  const phone = createPhoneKey();
  for (let day = 1; day <= 2; day += 1) {
    const result = await verifyWith(employee, phone);
    assert.equal(result.statusCode, 200, JSON.stringify(result.body));
    assert.equal(readVerificationProof(result.body.verificationProof, { employeeId: 'EMP-APP-1', type: 'fingerprint' })?.method, 'phone-app');
  }
  assert.equal(employee.nativeBiometricPublicKey, phone.publicKey);
});

test('a changed phone key is explained and can be registered again by the employee', async t => {
  const employee = useEmployeeStore(t);
  const oldPhone = createPhoneKey();
  const newPhone = createPhoneKey();
  assert.equal((await verifyWith(employee, oldPhone)).statusCode, 200);

  const changed = await verifyWith(employee, newPhone);
  assert.equal(changed.statusCode, 409);
  assert.equal(changed.body.code, 'phone-key-changed');
  assert.equal(employee.nativeBiometricPublicKey, oldPhone.publicKey);

  const reRegistered = await verifyWith(employee, newPhone, { replaceRegisteredKey: true });
  assert.equal(reRegistered.statusCode, 200, JSON.stringify(reRegistered.body));
  assert.equal(employee.nativeBiometricPublicKey, newPhone.publicKey);
  assert.equal((await verifyWith(employee, newPhone)).statusCode, 200);
});

test('a signature that does not match the phone key is rejected', async t => {
  const employee = useEmployeeStore(t);
  const phone = createPhoneKey();
  assert.equal((await verifyWith(employee, phone)).statusCode, 200);
  const forged = await verifyWith(employee, phone, { signWith: createPhoneKey() });
  assert.equal(forged.statusCode, 401);
  const forgedReplacement = await verifyWith(employee, createPhoneKey(), { replaceRegisteredKey: true, signWith: createPhoneKey() });
  assert.equal(forgedReplacement.statusCode, 401);
  assert.equal(employee.nativeBiometricPublicKey, phone.publicKey);
});
