import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'lunch-break-test-secret';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { DtrLog, hrUpdateOperations, liveLocationFromLog } = await import('./models/dtrLogModel.js');
const { createAuthToken } = await import('./utils/authToken.js');
const { createVerificationProof } = await import('./utils/verificationProof.js');
const { MARINDUQUE_BARANGAY_AREAS } = await import('../../shared/marinduqueBarangayAreas.js');

const app = createApiApp();

const employee = {
  _id: '64b000000000000000000021',
  email: 'ana@dilg.gov.ph',
  employeeId: 'EMP-2',
  name: 'Ana Reyes',
  accessLevel: 'employee',
  accountStatus: 'Active',
  biometricEnrollmentStatus: 'hr-approved'
};
const hrAdmin = { ...employee, _id: '64b000000000000000000022', email: 'hr@dilg.gov.ph', employeeId: 'HR-2', accessLevel: 'hr_admin' };

const [latitude, longitude] = MARINDUQUE_BARANGAY_AREAS.Boac.Pawa.center;
const pawa = { mode: 'field', label: 'Brgy. Pawa, Boac', latitude, longitude, fallbackToRadius: true };
// Timed in at the assigned barangay this morning.
const morningShift = { customId: 'att-9', date: '2026-10-27', timeIn: '07:58 AM', lunchOut: null, lunchIn: null, assignmentSite: pawa };

const lunchRecord = (extra = {}) => ({
  date: '2026-10-27',
  latitude,
  longitude,
  gpsAccuracy: 12,
  selfieUrl: 'data:image/jpeg;base64,/9j/lunch-selfie',
  fingerprintProof: createVerificationProof({ employeeId: employee.employeeId, type: 'fingerprint', method: 'phone-app' }),
  ...extra
});

const signIn = (t, { activeLog = morningShift, as = employee } = {}) => {
  t.mock.method(User, 'findByEmail', async () => as);
  // The face cannot be compared in these tests: no usable enrollment selfie.
  t.mock.method(User, 'getApprovedFaceEnrollment', async () => ({ descriptor: null, image: '' }));
  t.mock.method(DtrLog, 'findActiveByEmployee', async () => activeLog);
  t.mock.method(DtrLog, 'recordLunch', async (which, time) => ({ ...activeLog, [which]: time, id: activeLog?.customId }));
  return body => request(app).post('/api/attendance').set('Authorization', `Bearer ${createAuthToken(as)}`).send(body);
};

test('Lunch Out and Lunch In go in order, once each, and only on an open morning shift', async t => {
  const cases = [
    [null, 'lunch-out', /Time In first/],
    [{ ...morningShift, lunchOut: '12:01 PM' }, 'lunch-out', /Lunch Out was already recorded at 12:01 PM/],
    [{ ...morningShift, timeIn: '12:40 PM' }, 'lunch-out', /timed in this afternoon/],
    [morningShift, 'lunch-in', /Lunch Out first/],
    [{ ...morningShift, lunchOut: '12:01 PM', lunchIn: '12:59 PM' }, 'lunch-in', /Lunch In was already recorded at 12:59 PM/]
  ];
  for (const [activeLog, action, error] of cases) {
    await t.test(`${action} on ${JSON.stringify(activeLog && { timeIn: activeLog.timeIn, lunchOut: activeLog.lunchOut, lunchIn: activeLog.lunchIn })}`, async st => {
      const send = signIn(st, { activeLog });
      const response = await send({ action, record: lunchRecord() });
      assert.equal(response.status, 400);
      assert.match(response.body.error, error);
      assert.equal(DtrLog.recordLunch.mock.callCount(), 0);
    });
  }
});

test('a Lunch Out is made at the assigned area, with a selfie and a fingerprint', async t => {
  const send = signIn(t);
  const away = await send({ action: 'lunch-out', record: lunchRecord({ latitude: 13.2, longitude: 122.1 }) });
  assert.equal(away.status, 400);
  assert.match(away.body.error, /Lunch Out blocked: your GPS location is outside Brgy. Pawa, Boac/);

  const noSelfie = await send({ action: 'lunch-out', record: lunchRecord({ selfieUrl: '' }) });
  assert.equal(noSelfie.status, 400);
  assert.match(noSelfie.body.error, /Take a selfie before Lunch Out/);

  const noFingerprint = await send({ action: 'lunch-out', record: lunchRecord({ fingerprintProof: '' }) });
  assert.equal(noFingerprint.status, 400);
  assert.match(noFingerprint.body.error, /Verify your fingerprint before Lunch Out/);

  // The selfie is compared with the enrollment selfie, and a failed comparison is retried.
  const noFaceMatch = await send({ action: 'lunch-out', record: lunchRecord() });
  assert.equal(noFaceMatch.status, 409);
  assert.match(noFaceMatch.body.error, /cannot be used for face matching/);
  assert.equal(DtrLog.recordLunch.mock.callCount(), 0);
});

test('HR does not punch lunch for an employee; it is entered with Correct Record', async t => {
  const send = signIn(t, { as: hrAdmin });
  const response = await send({ action: 'lunch-in', record: lunchRecord({ employeeId: employee.employeeId }) });
  assert.equal(response.status, 403);
  assert.match(response.body.error, /Correct Record/);
});

test('HR can correct Lunch Out and Lunch In, which must be times', () => {
  const [correction] = hrUpdateOperations([{ id: 'att-9', lunchOut: '12:00 PM', lunchIn: '01:00 PM' }], 'HR Ana');
  assert.deepEqual(correction.changes, { lunchOut: '12:00 PM', lunchIn: '01:00 PM' });
  assert.deepEqual(hrUpdateOperations([{ id: 'att-9', lunchIn: null }], 'HR Ana')[0].changes, { lunchIn: null });
  assert.throws(() => hrUpdateOperations([{ id: 'att-9', lunchOut: 'noon' }]), /Lunch Out must be a time/);
  assert.throws(() => hrUpdateOperations([{ id: 'att-9', lunchIn: '13:00' }]), /Lunch In must be a time/);
});

test('HR\'s live map knows who is out for lunch', () => {
  const live = log => liveLocationFromLog({ ...morningShift, latitude, longitude, gpsStatus: 'In Range', createdAt: '2026-10-27T00:00:00Z', ...log });
  assert.equal(live({}).onLunch, false);
  assert.equal(live({ lunchOut: '12:01 PM' }).onLunch, true);
  assert.equal(live({ lunchOut: '12:01 PM', lunchIn: '12:58 PM' }).onLunch, false);
});
