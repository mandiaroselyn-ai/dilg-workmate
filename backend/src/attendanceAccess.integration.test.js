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

// Signs in as the given account, and records any attendance the server reads.
const signIn = (t, account) => {
  t.mock.method(User, 'findByEmail', async () => account);
  const reads = [
    t.mock.method(DtrLog, 'find', async () => [{ id: 'log-1', employeeId: 'E1' }]),
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
  for (const path of ['/api/dtr/logs', '/api/logs', '/api/dtr/location/live', '/api/dtr/action?action=location-live', '/api/dtr/location/history/E1']) {
    const response = await session.get(path);
    assert.equal(response.status, 403, path);
  }
  assert.equal(session.readCount(), 0);
});

test('HR/Admins can still view attendance and live locations', async t => {
  const session = signIn(t, hr);
  const logs = await session.get('/api/dtr/logs');
  assert.equal(logs.status, 200);
  assert.deepEqual(logs.body, [{ id: 'log-1', employeeId: 'E1' }]);
  assert.equal((await session.get('/api/dtr/location/live')).status, 200);
  assert.equal((await session.get('/api/dtr/location/history/E1')).status, 200);
});
