import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'request-review-test-secret';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { Leave } = await import('./models/leaveModel.js');
const { Announcement } = await import('./models/announcementModel.js');
const { createAuthToken } = await import('./utils/authToken.js');

const app = createApiApp();

const hr = { _id: 'hr-1', email: 'hr@dilg.gov.ph', accessLevel: 'hr_admin', accountStatus: 'Active' };
const requests = {
  'REQ-PENDING': { id: 'REQ-PENDING', status: 'Pending', type: 'Leave Request', employeeId: 'E1' },
  'REQ-APPROVED': { id: 'REQ-APPROVED', status: 'Approved', type: 'Leave Request', employeeId: 'E1' },
  'REQ-WITHDRAWN': { id: 'REQ-WITHDRAWN', status: 'Withdrawn', type: 'Travel Order', employeeId: 'E1' },
  'REQ-DRAFT': { id: 'REQ-DRAFT', status: 'Draft', type: 'Leave Request', employeeId: 'E1' }
};

// Signs in as HR, with the requests above as the database and the given supervisor
// accounts. Returns the saved updates.
const signInAsHr = (t, { supervisors = [] } = {}) => {
  t.mock.method(User, 'findByEmail', async () => hr);
  t.mock.method(User, 'findByEmployeeId', async () => null);
  t.mock.method(User, 'findByAccessLevel', async () => supervisors);
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

// Turns on SMS with a fake gateway for one test. Returns the gateway and the saved texts.
const useSmsGateway = (t, gatewayResponse = async () => ({ ok: true, json: async () => ({ id: 'sms-1' }) })) => {
  const previousKey = process.env.UNISMS_API_KEY;
  process.env.UNISMS_API_KEY = 'test-key';
  t.after(() => {
    if (previousKey === undefined) delete process.env.UNISMS_API_KEY;
    else process.env.UNISMS_API_KEY = previousKey;
  });
  return {
    gateway: t.mock.method(globalThis, 'fetch', gatewayResponse),
    saved: t.mock.method(Announcement, 'createSmsAlert', async data => data)
  };
};

const supervisors = [
  { name: 'OIC', email: 'oic@dilg.gov.ph', employeeId: 'S1', phoneNumber: '0917 123 4567', accountStatus: 'Active' },
  { name: 'No Phone', email: 'nophone@dilg.gov.ph', phoneNumber: '', accountStatus: 'Active' },
  { name: 'Former OIC', email: 'former@dilg.gov.ph', phoneNumber: '0918 123 4567', accountStatus: 'Inactive' }
];

test('forwarding a request texts each active supervisor who has a mobile number', async t => {
  const session = signInAsHr(t, { supervisors });
  const sms = useSmsGateway(t);
  const response = await session.patch('REQ-PENDING', { status: 'For Supervisor' });
  assert.equal(response.status, 200);
  assert.equal(sms.gateway.mock.callCount(), 1);
  const sent = JSON.parse(sms.gateway.mock.calls[0].arguments[1].body);
  assert.equal(sent.recipient, '+639171234567');
  assert.match(sent.content, /Leave Request is waiting for your approval/);
  assert.equal(sms.saved.mock.calls[0].arguments[0].kind, 'review');
});

test('forwarding through the bulk update texts the supervisors too', async t => {
  const session = signInAsHr(t, { supervisors });
  const sms = useSmsGateway(t);
  const response = await session.put([{ id: 'REQ-PENDING', status: 'For Supervisor' }]);
  assert.equal(response.status, 200);
  assert.equal(sms.gateway.mock.callCount(), 1);
});

test('a failed supervisor text does not stop the forward', async t => {
  const session = signInAsHr(t, { supervisors });
  const sms = useSmsGateway(t, async () => { throw new Error('getaddrinfo ENOTFOUND'); });
  const response = await session.patch('REQ-PENDING', { status: 'For Supervisor' });
  assert.equal(response.status, 200);
  assert.equal(session.saves.mock.callCount(), 1);
  assert.equal(sms.saved.mock.calls[0].arguments[0].status, 'Failed');
});
