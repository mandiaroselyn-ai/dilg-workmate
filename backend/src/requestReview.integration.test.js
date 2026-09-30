import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'request-review-test-secret';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { Leave } = await import('./models/leaveModel.js');
const { createAuthToken } = await import('./utils/authToken.js');

const app = createApiApp();

const hr = { _id: 'hr-1', email: 'hr@dilg.gov.ph', accessLevel: 'hr_admin', accountStatus: 'Active' };
const requests = {
  'REQ-PENDING': { id: 'REQ-PENDING', status: 'Pending', type: 'Leave Request', employeeId: 'E1' },
  'REQ-APPROVED': { id: 'REQ-APPROVED', status: 'Approved', type: 'Leave Request', employeeId: 'E1' },
  'REQ-WITHDRAWN': { id: 'REQ-WITHDRAWN', status: 'Withdrawn', type: 'Travel Order', employeeId: 'E1' },
  'REQ-DRAFT': { id: 'REQ-DRAFT', status: 'Draft', type: 'Leave Request', employeeId: 'E1' }
};

// Signs in as HR, with the requests above as the database. Returns the saved updates.
const signInAsHr = t => {
  t.mock.method(User, 'findByEmail', async () => hr);
  t.mock.method(User, 'findByEmployeeId', async () => null);
  t.mock.method(Leave, 'findByCustomId', async id => requests[id] || null);
  t.mock.method(Leave, 'findAllRequests', async () => Object.values(requests));
  const saves = t.mock.method(Leave, 'updateStatus', async (id, update) => ({ ...requests[id], ...update }));
  const bulkSaves = t.mock.method(Leave, 'bulkUpdate', async updates => updates);
  const token = createAuthToken(hr);
  return {
    saves,
    bulkSaves,
    patch: (id, body) => request(app).patch(`/api/requests/${id}`).set('Authorization', `Bearer ${token}`).send(body),
    put: body => request(app).put('/api/requests').set('Authorization', `Bearer ${token}`).send(body),
    get: path => request(app).get(path).set('Authorization', `Bearer ${token}`)
  };
};

test('HR forwards a request that is waiting for HR', async t => {
  const session = signInAsHr(t);
  const response = await session.patch('REQ-PENDING', { status: 'For Supervisor', remarks: 'Checked.' });
  assert.equal(response.status, 200);
  assert.equal(session.saves.mock.callCount(), 1);
});

test('HR cannot forward decided, withdrawn, or draft requests, or approve one', async t => {
  const session = signInAsHr(t);
  for (const [id, body] of [
    ['REQ-APPROVED', { status: 'For Supervisor' }],
    ['REQ-WITHDRAWN', { status: 'For Supervisor' }],
    ['REQ-DRAFT', { status: 'For Supervisor' }],
    ['REQ-PENDING', { status: 'Approved' }]
  ]) {
    const response = await session.patch(id, body);
    assert.equal(response.status, 409, id);
    assert.equal(response.body.success, false);
  }
  assert.equal(session.saves.mock.callCount(), 0);
  const bulk = await session.put([{ id: 'REQ-APPROVED', status: 'For Supervisor' }]);
  assert.equal(bulk.status, 409);
  assert.equal(session.bulkSaves.mock.callCount(), 0);
});

test('HR does not receive employee drafts', async t => {
  const session = signInAsHr(t);
  const response = await session.get('/api/requests');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.map(item => item.id).sort(), ['REQ-APPROVED', 'REQ-PENDING', 'REQ-WITHDRAWN']);
});
