import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'deleted-account-records-test-secret';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { createAuthToken } = await import('./utils/authToken.js');
const { ownerlessFilter } = await import('./services/deletedAccountRecords.js');

const app = createApiApp();
const employee = { _id: 'emp-1', name: 'Juan Dela Cruz', email: 'juan@dilg.gov.ph', employeeId: 'E1', accessLevel: 'employee', accountStatus: 'Active' };

test('only HR reaches the clean-up of deleted accounts\' records', async t => {
  t.mock.method(User, 'findByEmail', async () => employee);
  const as = { Authorization: `Bearer ${createAuthToken(employee)}` };
  assert.equal((await request(app).get('/api/deleted-account-records').set(as)).status, 403);
  assert.equal((await request(app).delete('/api/deleted-account-records').set(as)).status, 403);
  assert.equal((await request(app).delete('/api/deleted-account-records')).status, 401);
});

test('a record is a deleted account\'s when no account has its Employee ID, or, with no ID, its email', () => {
  assert.deepEqual(ownerlessFilter({ ids: ['E1', 'E2'], emails: ['ana@x.test'] }), {
    $or: [
      { employeeId: { $nin: ['', null, 'E1', 'E2'] } },
      { employeeId: { $in: ['', null] }, employeeEmail: { $nin: ['ana@x.test'] } }
    ]
  });
  assert.deepEqual(ownerlessFilter({ ids: ['E1'], emails: [] }, { idField: 'uploadedBy.employeeId', emailField: 'uploadedBy.email' }).$or[0], { 'uploadedBy.employeeId': { $nin: ['', null, 'E1'] } });
});
