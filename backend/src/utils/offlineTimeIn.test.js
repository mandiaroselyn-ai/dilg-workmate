import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { checkOfflineTimeIn, checkOfflineTimeOut } from './offlineTimeIn.js';
import { hrUpdateOperations } from '../models/dtrLogModel.js';

// The phone app's code that signs a Time In made without internet.
globalThis.window = { crypto: globalThis.crypto };
const { signOfflineTimeIn } = await import('../../../src/utils/offlineTimeIn.js');

// A phone's fingerprint-protected key, as in nativeBiometricFlow.test.js.
const createPhoneKey = () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const exported = publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
  return {
    publicKey: exported,
    sign: async challenge => {
      assert.ok(challenge.length <= 128, 'the phone app signs at most 128 characters');
      return { signature: crypto.sign('sha256', Buffer.from(challenge, 'utf8'), privateKey).toString('base64url'), publicKey: exported };
    }
  };
};

const timeInRecord = () => ({
  latitude: 13.442167,
  longitude: 121.853551,
  gpsAccuracy: 12.4,
  assignmentSite: { mode: 'field', municipality: 'Boac', barangay: 'Pawa' },
  selfieUrl: 'data:image/jpeg;base64,/9j/selfie'
});

// The phone signs a Time In for `record`, as the app does when it has no internet.
const signOnPhone = (phone, record, employeeId = 'EMP-1') => signOfflineTimeIn({
  employeeId,
  keyId: '0123456789abcdef0123456789abcdef',
  latitude: record.latitude,
  longitude: record.longitude,
  gpsAccuracy: record.gpsAccuracy,
  assignmentSite: record.assignmentSite,
  selfie: record.selfieUrl,
  sign: phone.sign
});

const check = (offline, record, { registeredKey, sentAt, now = new Date() }) => checkOfflineTimeIn({
  offline,
  record,
  employeeId: 'EMP-1',
  registeredKey,
  sentAt: sentAt ?? now.toISOString(),
  now
});

test('a Time In signed offline by the registered phone is accepted at the time the phone recorded it', async () => {
  const phone = createPhoneKey();
  const record = timeInRecord();
  const offline = await signOnPhone(phone, record);
  const now = new Date(Date.parse(offline.recordedAt) + 3 * 60 * 60 * 1000);
  const result = check(offline, record, { registeredKey: phone.publicKey, now });
  assert.equal(result.error, undefined);
  assert.equal(result.registeredKeyMatched, true);
  assert.deepEqual(result.reviewReasons, []);
  assert.equal(result.timeInAt.toISOString(), offline.recordedAt);
  assert.equal(result.phoneClockOffsetSeconds, 0);
});

test('an offline Time In changed after it was signed is refused', async () => {
  const phone = createPhoneKey();
  const record = timeInRecord();
  const offline = await signOnPhone(phone, record);
  for (const changed of [
    { ...record, latitude: 13.45 },
    { ...record, gpsAccuracy: 40 },
    { ...record, selfieUrl: 'data:image/jpeg;base64,/9j/someone-else' },
    { ...record, assignmentSite: { ...record.assignmentSite, barangay: 'Tanza' } }
  ]) {
    assert.equal(check(offline, changed, { registeredKey: phone.publicKey }).statusCode, 400);
  }
  assert.equal(check({ ...offline, recordedAt: new Date(Date.parse(offline.recordedAt) - 3600000).toISOString() }, record, { registeredKey: phone.publicKey }).statusCode, 400);
  // Signed for another employee.
  assert.equal(check(await signOnPhone(phone, record, 'EMP-2'), record, { registeredKey: phone.publicKey }).statusCode, 400);
  // Not signed by any phone key that verifies.
  assert.equal(check({ ...offline, signature: (await createPhoneKey().sign('other')).signature }, record, { registeredKey: phone.publicKey }).statusCode, 400);
  assert.equal(check({ ...offline, nonce: 'short' }, record, { registeredKey: phone.publicKey }).statusCode, 400);
});

test('a Time In signed by a phone key that is not registered goes to HR review', async () => {
  const registered = createPhoneKey();
  const newPhone = createPhoneKey();
  const record = timeInRecord();
  const result = check(await signOnPhone(newPhone, record), record, { registeredKey: registered.publicKey });
  assert.equal(result.error, undefined);
  assert.equal(result.registeredKeyMatched, false);
  assert.match(result.reviewReasons.join(' '), /not registered/);
});

test('a phone clock that looks wrong sends the Time In to HR review', async () => {
  const phone = createPhoneKey();
  const record = timeInRecord();
  const offline = await signOnPhone(phone, record);
  const recorded = Date.parse(offline.recordedAt);

  const behind = check(offline, record, { registeredKey: phone.publicKey, now: new Date(recorded + 60000), sentAt: new Date(recorded - 10 * 60000).toISOString() });
  assert.match(behind.reviewReasons.join(' '), /11 minutes behind/);

  const fromTheFuture = check(offline, record, { registeredKey: phone.publicKey, now: new Date(recorded - 30 * 60000) });
  assert.match(fromTheFuture.reviewReasons.join(' '), /later than the server's current time/);
  assert.equal(fromTheFuture.timeInAt.getTime(), recorded - 30 * 60000);

  const daysLate = check(offline, record, { registeredKey: phone.publicKey, now: new Date(recorded + 4 * 24 * 3600000) });
  assert.match(daysLate.reviewReasons.join(' '), /4 days after/);

  const noClock = check(offline, record, { registeredKey: phone.publicKey, sentAt: '', now: new Date(recorded + 60000) });
  assert.match(noClock.reviewReasons.join(' '), /did not send its clock/);

  const fewMinutesOff = check(offline, record, { registeredKey: phone.publicKey, now: new Date(recorded + 60000), sentAt: new Date(recorded + 4 * 60000).toISOString() });
  assert.deepEqual(fewMinutesOff.reviewReasons, []);
});

test('an offline Time Out with a phone clock that looks wrong goes to HR review', () => {
  const timeInAt = new Date('2026-10-05T00:00:00Z');
  const recordedOfflineAt = '2026-10-05T09:00:00.000Z';
  const now = new Date('2026-10-05T10:00:00Z');

  // A Time Out made online has nothing to check.
  assert.equal(checkOfflineTimeOut({ recordedOfflineAt: undefined, timeInAt, sentAt: now.toISOString(), now }), null);

  const fine = checkOfflineTimeOut({ recordedOfflineAt, timeInAt, sentAt: now.toISOString(), now });
  assert.equal(fine.recordedAt.toISOString(), recordedOfflineAt);
  assert.deepEqual(fine.reviewReasons, []);

  const ahead = checkOfflineTimeOut({ recordedOfflineAt, timeInAt, sentAt: new Date(now.getTime() + 45 * 60000).toISOString(), now });
  assert.match(ahead.reviewReasons.join(' '), /45 minutes ahead of the server's when it sent this Time Out/);
  assert.equal(ahead.phoneClockOffsetSeconds, 45 * 60);

  const beforeTimeIn = checkOfflineTimeOut({ recordedOfflineAt: '2026-10-04T23:30:00.000Z', timeInAt, sentAt: now.toISOString(), now });
  assert.match(beforeTimeIn.reviewReasons.join(' '), /30 minutes before the Time In/);

  const fromTheFuture = checkOfflineTimeOut({ recordedOfflineAt: '2026-10-05T12:00:00.000Z', timeInAt, sentAt: now.toISOString(), now });
  assert.match(fromTheFuture.reviewReasons.join(' '), /Time Out 120 minutes later than the server's current time/);
});

test('HR approves an offline Time Out or replaces it with a corrected Time Out', () => {
  const now = new Date('2026-10-06T01:00:00Z');
  assert.deepEqual(hrUpdateOperations([{ id: 'att-1', offlineTimeOutDecision: 'approved' }], 'HR Ana', now), [{
    id: 'att-1',
    filter: { customId: 'att-1', 'offlineTimeOut.reviewReasons.0': { $exists: true } },
    changes: { 'offlineTimeOut.decision': 'approved', 'offlineTimeOut.decidedBy': 'HR Ana', 'offlineTimeOut.decidedAt': now }
  }]);
  assert.throws(() => hrUpdateOperations([{ id: 'att-1', offlineTimeOutDecision: 'rejected' }]), /only be approved, or corrected/);

  const [correction, replaced] = hrUpdateOperations([{ id: 'att-1', timeIn: '07:00 AM', timeOut: '05:00 PM' }], 'HR Ana', now);
  assert.deepEqual(correction, { id: 'att-1', filter: { customId: 'att-1' }, changes: { timeIn: '07:00 AM', timeOut: '05:00 PM', late: false } });
  assert.deepEqual(replaced.filter, { customId: 'att-1', 'offlineTimeOut.reviewReasons.0': { $exists: true }, 'offlineTimeOut.decision': '' });
  assert.equal(replaced.changes['offlineTimeOut.decision'], 'corrected');

  // A Time In is approved or rejected.
  const [timeIn] = hrUpdateOperations([{ id: 'att-2', offlineDecision: 'rejected' }], 'HR Ana', now);
  assert.equal(timeIn.changes['offlineTimeIn.decision'], 'rejected');
  assert.deepEqual(hrUpdateOperations([{ id: 'att-3', verificationAudit: { verifiedBy: 'HR Ana' } }], 'HR Ana', now).length, 1);
});
