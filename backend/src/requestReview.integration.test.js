import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'request-review-test-secret';
// Empty, not deleted, so a developer's backend/.env cannot switch the tests to httpSMS.
process.env.HTTPSMS_API_KEY = '';

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

test('HR returns a request to the employee only with remarks, and the employee is told what to fix', async t => {
  const session = signInAsHr(t);
  const notices = t.mock.method(Announcement, 'createNotification', async notice => notice);
  const noRemarks = await session.patch('REQ-PENDING', { status: 'Returned' });
  assert.equal(noRemarks.status, 409);
  assert.equal(session.saves.mock.callCount(), 0);

  const response = await session.patch('REQ-PENDING', { status: 'Returned', remarks: 'Attach the medical certificate.' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(session.saves.mock.calls[0].arguments[1].status, 'Returned');
  const notice = notices.mock.calls.at(-1).arguments[0];
  assert.equal(notice.employeeId, 'E1');
  assert.equal(notice.title, 'Leave Request Needs Your Action');
  assert.match(notice.message, /was returned to you by HR\. Fix it in Requests and submit it again\. Remarks: Attach the medical certificate\./);
});

test('the employee fixes a returned request and submits it again, and HR is told', async t => {
  const employee = { _id: 'e-1', email: 'juan@dilg.gov.ph', employeeId: 'E1', name: 'Juan Dela Cruz', accessLevel: 'employee', accountStatus: 'Active' };
  const returned = { id: 'REQ-RETURNED', status: 'Returned', type: 'Leave Request', employeeId: 'E1', employeeEmail: employee.email, statusHistory: [] };
  t.mock.method(User, 'findByEmail', async () => employee);
  t.mock.method(Leave, 'findByCustomId', async () => returned);
  // Its own dates are not an overlap with itself.
  t.mock.method(Leave, 'findAbsencesOfEmployee', async () => [returned]);
  const saves = t.mock.method(Leave, 'updateStatus', async (id, update) => ({ ...returned, ...update }));
  const notices = t.mock.method(Announcement, 'createNotification', async notice => notice);
  const response = await request(app)
    .patch('/api/requests/REQ-RETURNED')
    .set('Authorization', `Bearer ${createAuthToken(employee)}`)
    .send({ status: 'Pending', purpose: 'Leave Type: Sick Leave. With medical certificate.', startDate: '2026-11-03', endDate: '2026-11-04' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const update = saves.mock.calls[0].arguments[1];
  assert.equal(update.status, 'Pending');
  assert.equal(update.purpose, 'Leave Type: Sick Leave. With medical certificate.');
  assert.equal(update.statusHistory.at(-1).status, 'Pending');
  assert.ok(notices.mock.calls.some(call => call.arguments[0].recipientRole === 'hr_admin'));
});

test('a leave or travel order that overlaps another submitted leave of the employee is refused', async t => {
  const employee = { _id: 'e-1', email: 'juan@dilg.gov.ph', employeeId: 'E1', name: 'Juan Dela Cruz', accessLevel: 'employee', accountStatus: 'Active' };
  const approved = { id: 'REQ-NOV', type: 'Leave Request', status: 'Approved', startDate: '2026-11-03', endDate: '2026-11-05', employeeId: 'E1' };
  t.mock.method(User, 'findByEmail', async () => employee);
  t.mock.method(Leave, 'findAbsencesOfEmployee', async () => [approved]);
  const creates = t.mock.method(Leave, 'create', async request => ({ ...request, id: 'REQ-NEW' }));
  t.mock.method(Announcement, 'createNotification', async notice => notice);
  const send = body => request(app).post('/api/requests').set('Authorization', `Bearer ${createAuthToken(employee)}`).send(body);

  const overlapping = await send({ type: 'Leave Request', startDate: '2026-11-05', endDate: '2026-11-06', purpose: 'Leave Type: Vacation Leave. Family trip.', status: 'Pending' });
  assert.equal(overlapping.status, 409);
  assert.match(overlapping.body.error, /Nov 3, 2026 to Nov 5, 2026 \(Ref REQ-NOV, Approved\)/);
  assert.equal(creates.mock.callCount(), 0);

  // A travel order on a day of that leave is refused too.
  const travel = await send({ type: 'Travel Order', startDate: '2026-11-04', endDate: '2026-11-04', purpose: 'Official Travel. LGU visit.', status: 'Pending' });
  assert.equal(travel.status, 409);
  assert.match(travel.body.error, /Leave and travel dates cannot overlap/);
  assert.equal(creates.mock.callCount(), 0);

  // A draft may overlap until it is submitted, and other dates are fine.
  assert.equal((await send({ type: 'Leave Request', startDate: '2026-11-05', endDate: '2026-11-06', purpose: 'Leave Type: Vacation Leave. Draft.', status: 'Draft' })).status, 201);
  assert.equal((await send({ type: 'Leave Request', startDate: '2026-11-06', endDate: '2026-11-06', purpose: 'Leave Type: Vacation Leave. Next day.', status: 'Pending' })).status, 201);
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
