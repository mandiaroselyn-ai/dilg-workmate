import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'offline-time-in-test-secret';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { DtrLog } = await import('./models/dtrLogModel.js');
const { Announcement } = await import('./models/announcementModel.js');
const { createAuthToken } = await import('./utils/authToken.js');
const { createVerificationProof } = await import('./utils/verificationProof.js');
const { MARINDUQUE_BARANGAY_AREAS } = await import('../../shared/marinduqueBarangayAreas.js');

// The phone app's code that signs a Time In made without internet.
globalThis.window = { crypto: globalThis.crypto };
const { signOfflineTimeIn } = await import('../../src/utils/offlineTimeIn.js');

const app = createApiApp();
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const phoneKey = publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
const phoneSign = async challenge => ({
  signature: crypto.sign('sha256', Buffer.from(challenge, 'utf8'), privateKey).toString('base64url'),
  publicKey: phoneKey
});

const employee = {
  _id: '64b000000000000000000011',
  email: 'juan@dilg.gov.ph',
  employeeId: 'EMP-1',
  name: 'Juan Dela Cruz',
  accessLevel: 'employee',
  accountStatus: 'Active',
  biometricEnrollmentStatus: 'hr-approved',
  nativeBiometricPublicKey: phoneKey
};
const [latitude, longitude] = MARINDUQUE_BARANGAY_AREAS.Boac.Pawa.center;

const timeInRecord = () => ({
  latitude: Number(latitude.toFixed(6)),
  longitude: Number(longitude.toFixed(6)),
  gpsAccuracy: 12,
  gpsStatus: 'In Range',
  selfieUrl: 'data:image/jpeg;base64,/9j/selfie',
  fingerprintVerified: true,
  dutyType: 'field',
  assignmentSite: { mode: 'field', municipality: 'Boac', barangay: 'Pawa' },
  workAssignment: { task: 'Barangay monitoring' }
});

const signOnPhone = record => signOfflineTimeIn({
  employeeId: employee.employeeId,
  keyId: '0123456789abcdef0123456789abcdef',
  latitude: record.latitude,
  longitude: record.longitude,
  gpsAccuracy: record.gpsAccuracy,
  assignmentSite: record.assignmentSite,
  selfie: record.selfieUrl,
  sign: phoneSign
});

// Signs in as the employee, with their records kept in memory instead of MongoDB.
const signIn = (t, { activeLog = null, savedOfflineTimeIn = null } = {}) => {
  t.mock.method(User, 'findByEmail', async () => employee);
  t.mock.method(User, 'findByEmployeeId', async () => employee);
  // The face cannot be compared in these tests: no usable enrollment selfie.
  t.mock.method(User, 'getApprovedFaceEnrollment', async () => ({ descriptor: null, image: '' }));
  t.mock.method(DtrLog, 'findOfflineTimeIn', async () => savedOfflineTimeIn);
  t.mock.method(DtrLog, 'findActiveByEmployee', async () => activeLog);
  t.mock.method(DtrLog, 'create', async log => ({ ...log, id: 'att-1' }));
  t.mock.method(DtrLog, 'closeActiveLog', async (timeOut, employeeId, date) => ({ ...activeLog, id: 'att-1', timeOut, employeeId, date }));
  t.mock.method(Announcement, 'createNotification', async notification => notification);
  return body => request(app).post('/api/attendance').set('Authorization', `Bearer ${createAuthToken(employee)}`).send(body);
};

test('an offline Time In is saved at the time the phone recorded it, and a failed check goes to HR', async t => {
  const send = signIn(t);
  const record = timeInRecord();
  // Timed in at 9:30 AM without internet; the phone was back online two hours later.
  const recordedAt = new Date('2026-10-05T01:30:00Z');
  t.mock.timers.enable({ apis: ['Date'], now: recordedAt });
  const offline = await signOnPhone(record);
  t.mock.timers.setTime(recordedAt.getTime() + 2 * 60 * 60 * 1000);

  const response = await send({ action: 'clock-in', record: { ...record, offlineTimeIn: offline }, sentAt: new Date().toISOString() });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const saved = DtrLog.create.mock.calls[0].arguments[0];
  assert.equal(saved.timeIn, '09:30 AM');
  assert.equal(saved.date, '2026-10-05');
  assert.equal(saved.timeInAt.toISOString(), recordedAt.toISOString());
  assert.equal(saved.late, true);
  assert.equal(saved.fingerprintVerified, true);
  assert.equal(saved.fingerprintMethod, 'phone-app');
  assert.equal(saved.faceVerified, false);
  assert.equal(saved.offlineTimeIn.nonce, offline.nonce);
  assert.equal(saved.offlineTimeIn.decision, '');
  assert.match(saved.offlineTimeIn.reviewReasons.join(' '), /could not be compared/);
  // HR is told it needs review.
  assert.equal(Announcement.createNotification.mock.calls[0].arguments[0].recipientRole, 'hr_admin');
});

test('an online Time In with the same failed check is refused so the employee can retry', async t => {
  const send = signIn(t);
  const fingerprintProof = createVerificationProof({ employeeId: employee.employeeId, type: 'fingerprint', method: 'phone-app' });
  const response = await send({ action: 'clock-in', record: { ...timeInRecord(), fingerprintProof } });
  assert.equal(response.status, 409);
  assert.match(response.body.error, /cannot be used for face matching/);
  assert.equal(DtrLog.create.mock.callCount(), 0);
});

test('an offline Time In changed after it was signed is refused and not saved', async t => {
  const send = signIn(t);
  const record = timeInRecord();
  const offline = await signOnPhone(record);
  const response = await send({ action: 'clock-in', record: { ...record, latitude: record.latitude + 0.001, offlineTimeIn: offline }, sentAt: new Date().toISOString() });
  assert.equal(response.status, 400);
  assert.equal(DtrLog.create.mock.callCount(), 0);
});

test('the same offline Time In sent again gets the saved record back', async t => {
  const send = signIn(t, { savedOfflineTimeIn: { id: 'att-1', employeeId: 'EMP-1', timeIn: '08:00 AM' } });
  const record = timeInRecord();
  const response = await send({ action: 'clock-in', record: { ...record, offlineTimeIn: await signOnPhone(record) }, sentAt: new Date().toISOString() });
  assert.equal(response.status, 200);
  assert.equal(response.body.record.id, 'att-1');
  assert.equal(DtrLog.create.mock.callCount(), 0);
});

test('a Time Out saved offline after an offline Time In keeps its own time', async t => {
  // Timed in at 8:00 AM and out at 5:00 PM without internet; both reached the server at 6:00 PM.
  const timeInAt = new Date('2026-10-05T00:00:00Z');
  const timeOutAt = new Date('2026-10-05T09:00:00Z');
  const send = signIn(t, {
    activeLog: {
      timeInAt,
      createdAt: new Date('2026-10-05T10:00:00Z'),
      assignmentSite: null
    }
  });
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-05T10:00:00Z') });
  const response = await send({
    action: 'clock-out',
    record: { date: '2026-10-05', recordedOfflineAt: timeOutAt.toISOString(), timeOutLatitude: latitude, timeOutLongitude: longitude, timeOutGpsAccuracy: 10 },
    sentAt: new Date().toISOString()
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const [timeOut, , , , offlineTimeOut] = DtrLog.closeActiveLog.mock.calls[0].arguments;
  assert.equal(timeOut, '05:00 PM');
  assert.equal(offlineTimeOut.recordedAt.toISOString(), timeOutAt.toISOString());
  assert.deepEqual(offlineTimeOut.reviewReasons, []);
  assert.equal(Announcement.createNotification.mock.callCount(), 0);
});

test('an offline Time Out sent with a phone clock that looks wrong goes to HR review', async t => {
  const send = signIn(t, { activeLog: { timeInAt: new Date('2026-10-05T00:00:00Z'), assignmentSite: null } });
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-05T10:00:00Z') });
  const response = await send({
    action: 'clock-out',
    record: { date: '2026-10-05', recordedOfflineAt: '2026-10-05T09:00:00.000Z' },
    // The phone's clock is 40 minutes behind.
    sentAt: '2026-10-05T09:20:00.000Z'
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const offlineTimeOut = DtrLog.closeActiveLog.mock.calls[0].arguments[4];
  assert.match(offlineTimeOut.reviewReasons.join(' '), /40 minutes behind/);
  assert.equal(offlineTimeOut.decision, '');
  assert.equal(Announcement.createNotification.mock.calls[0].arguments[0].title, 'Offline Time Out for Review');
});

test('a Time Out made online is not marked offline', async t => {
  const send = signIn(t, { activeLog: { timeInAt: new Date('2026-10-05T00:00:00Z'), assignmentSite: null } });
  const response = await send({ action: 'clock-out', record: { date: '2026-10-05' }, sentAt: new Date().toISOString() });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(DtrLog.closeActiveLog.mock.calls[0].arguments[4], null);
});
