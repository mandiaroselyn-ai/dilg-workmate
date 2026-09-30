import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'live-tracking-test-secret';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { DtrLog } = await import('./models/dtrLogModel.js');
const { createAuthToken } = await import('./utils/authToken.js');
const { resolveAssignedLocation } = await import('./services/assignedLocationService.js');

const app = createApiApp();

const employee = { _id: 'emp-1', email: 'rimhelyn@gmail.com', employeeId: 'DILG-2026-145195', accessLevel: 'employee', accountStatus: 'Active' };
const hr = { _id: 'hr-1', email: 'hr@dilg.gov.ph', accessLevel: 'hr_admin', accountStatus: 'Active' };
const insidePawa = { latitude: 13.452351, longitude: 121.880056 };
const bangbangGasan = { latitude: 13.3428, longitude: 121.8290 };

// An employee on duty in Brgy. Pawa, Boac, sending positions from the app.
const onDuty = async t => {
  t.mock.method(User, 'findByEmail', async () => employee);
  const assignmentSite = await resolveAssignedLocation({ mode: 'field', municipality: 'Boac', barangay: 'Pawa' });
  t.mock.method(DtrLog, 'findActiveShift', async () => ({
    customId: 'dtr-1',
    employeeId: employee.employeeId,
    latitude: insidePawa.latitude,
    longitude: insidePawa.longitude,
    assignedLatitude: assignmentSite.latitude,
    assignedLongitude: assignmentSite.longitude,
    assignmentSite
  }));
  const saved = t.mock.method(DtrLog, 'updateLocationHistory', async () => ({ customId: 'dtr-1' }));
  const send = body => request(app)
    .post('/api/dtr/action?action=location-update')
    .set('Authorization', `Bearer ${createAuthToken(employee)}`)
    .send(body);
  return { send, saved };
};

test('rough or missing GPS accuracy is not used for live tracking', async t => {
  const { send, saved } = await onDuty(t);
  for (const accuracy of [850, 101, undefined, null, 'about 20', -5]) {
    const response = await send({ ...insidePawa, accuracy });
    assert.equal(response.status, 422, `accuracy ${accuracy}`);
  }
  assert.equal(saved.mock.callCount(), 0);
});

test('a phone position is checked against the barangay the employee timed in for', async t => {
  const { send, saved } = await onDuty(t);

  const inside = await send({ ...insidePawa, accuracy: 20 });
  assert.equal(inside.status, 200);
  assert.equal(inside.body.geofenceStatus, 'In Range');

  const outside = await send({ ...bangbangGasan, accuracy: 20 });
  assert.equal(outside.body.geofenceStatus, 'Out of Range');

  assert.deepEqual(saved.mock.calls.map(call => [call.arguments[1].withinGeofence, call.arguments[1].accuracy]), [[true, 20], [false, 20]]);
});

test('HR\'s live list names each position\'s barangay from the PSA map', async t => {
  t.mock.method(User, 'findByEmail', async () => hr);
  t.mock.method(DtrLog, 'getActiveLocationTracking', async () => [
    { id: 'dtr-1', ...insidePawa },
    { id: 'dtr-2', latitude: 13.40, longitude: 121.80 }
  ]);
  const lookup = t.mock.method(globalThis, 'fetch', async () => { throw new Error('No outside lookup is needed'); });

  const response = await request(app).get('/api/dtr/action?action=location-live').set('Authorization', `Bearer ${createAuthToken(hr)}`);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.locations.map(entry => entry.place), ['Brgy. Pawa, Boac', '']);
  assert.equal(lookup.mock.callCount(), 0);
});
