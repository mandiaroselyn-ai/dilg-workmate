import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'attendance-access-test-secret';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { DtrLog } = await import('./models/dtrLogModel.js');
const { createAuthToken } = await import('./utils/authToken.js');

const app = createApiApp();

const supervisor = { _id: 'sup-1', email: 'supervisor@dilg.gov.ph', accessLevel: 'supervisor', accountStatus: 'Active' };
const hr = { _id: 'hr-1', email: 'hr@dilg.gov.ph', accessLevel: 'hr_admin', accountStatus: 'Active' };
const owner = { _id: 'emp-1', email: 'juan@dilg.gov.ph', employeeId: 'E1', accessLevel: 'employee', accountStatus: 'Active' };
const otherEmployee = { _id: 'emp-2', email: 'maria@dilg.gov.ph', employeeId: 'E2', accessLevel: 'employee', accountStatus: 'Active' };

// Signs in as the given account, and records any attendance the server reads.
const signIn = (t, account) => {
  t.mock.method(User, 'findByEmail', async () => account);
  const reads = [
    t.mock.method(DtrLog, 'find', async () => [{ id: 'log-1', employeeId: 'E1' }]),
    t.mock.method(DtrLog, 'findForHrList', async () => [{ id: 'log-1', employeeId: 'E1', hasSelfie: true }]),
    t.mock.method(DtrLog, 'findListForEmployee', async () => [{ id: 'log-1', employeeId: 'E1', hasSelfie: true }]),
    t.mock.method(DtrLog, 'findSelfie', async id => (id === 'log-1' ? { customId: 'log-1', selfieUrl: 'data:image/jpeg;base64,AAAA', employeeId: 'E1' } : null)),
    t.mock.method(DtrLog, 'getActiveLocationTracking', async () => []),
    t.mock.method(DtrLog, 'getLocationHistory', async () => ({ locationHistory: [] }))
  ];
  return {
    get: path => request(app).get(path).set('Authorization', `Bearer ${createAuthToken(account)}`),
    readCount: () => reads.reduce((total, read) => total + read.mock.callCount(), 0)
  };
};

test('supervisors cannot view employee attendance or locations', async t => {
  const session = signIn(t, supervisor);
  for (const path of ['/api/dtr/logs', '/api/logs', '/api/dtr/location/live', '/api/dtr/action?action=location-live', '/api/dtr/location/history/E1', '/api/dtr/action?action=record-selfie&id=log-1']) {
    const response = await session.get(path);
    assert.equal(response.status, 403, path);
  }
  assert.equal(session.readCount(), 0);
});

test('HR/Admins can still view attendance and live locations', async t => {
  const session = signIn(t, hr);
  const logs = await session.get('/api/dtr/logs');
  assert.equal(logs.status, 200);
  // HR's list says whether a record has a selfie, without the selfie itself.
  assert.deepEqual(logs.body, [{ id: 'log-1', employeeId: 'E1', hasSelfie: true }]);
  assert.equal((await session.get('/api/dtr/location/live')).status, 200);
  assert.equal((await session.get('/api/dtr/location/history/E1')).status, 200);
});

test('HR loads the recent months, and an earlier month when asked', async t => {
  const session = signIn(t, hr);
  assert.equal((await session.get('/api/dtr/logs')).status, 200);
  assert.equal((await session.get('/api/dtr/logs?month=2026-07')).status, 200);
  const calls = DtrLog.findForHrList.mock.calls.map(call => call.arguments[0]);
  assert.match(calls[0].since, /^\d{4}-\d{2}-01$/);
  assert.deepEqual(calls[1], { month: '2026-07' });
  for (const month of ['2026-13', 'July', '2026-7']) {
    assert.equal((await session.get(`/api/dtr/logs?month=${month}`)).status, 400, month);
  }
});

test('an employee gets their own list, and only their own selfies', async t => {
  const session = signIn(t, owner);
  const logs = await session.get('/api/dtr/logs');
  assert.equal(logs.status, 200);
  assert.deepEqual(logs.body, [{ id: 'log-1', employeeId: 'E1', hasSelfie: true }]);
  assert.equal((await session.get('/api/dtr/action?action=record-selfie&id=log-1')).body.selfieUrl, 'data:image/jpeg;base64,AAAA');
  assert.equal((await session.get('/api/dtr/action?action=location-live')).status, 403);
  t.mock.restoreAll();
  const other = signIn(t, otherEmployee);
  assert.equal((await other.get('/api/dtr/action?action=record-selfie&id=log-1')).status, 404);
});

test('HR opens one record selfie at a time', async t => {
  const session = signIn(t, hr);
  const found = await session.get('/api/dtr/action?action=record-selfie&id=log-1');
  assert.equal(found.status, 200);
  assert.equal(found.body.selfieUrl, 'data:image/jpeg;base64,AAAA');
  assert.equal((await session.get('/api/dtr/action?action=record-selfie&id=missing')).status, 404);
  assert.equal((await session.get('/api/dtr/action?action=record-selfie')).status, 400);
});

test('only HR/Admins can look up the place name of an employee position', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ address: { village: 'Sawi', town: 'Boac' } }) }));
  const supervisorSession = signIn(t, supervisor);
  assert.equal((await supervisorSession.get('/api/dtr/action?action=place-name&lat=13.4411&lon=121.8545')).status, 403);
});

test('HR gets the place name, and a bad position is refused', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ address: { village: 'Sawi', town: 'Boac' } }) }));
  const session = signIn(t, hr);
  const found = await session.get('/api/dtr/action?action=place-name&lat=13.4411&lon=121.8545');
  assert.equal(found.status, 200);
  assert.equal(found.body.place, 'Brgy. Sawi, Boac');
  assert.equal((await session.get('/api/dtr/action?action=place-name&lat=north&lon=121.8')).status, 400);
});
