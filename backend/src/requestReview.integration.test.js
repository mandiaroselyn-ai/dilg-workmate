import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'request-review-test-secret';
// Empty, not deleted, so a developer's backend/.env cannot switch the tests to httpSMS.
process.env.HTTPSMS_API_KEY = '';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { Leave } = await import('./models/leaveModel.js');
const { Holiday } = await import('./models/holidayModel.js');
const { Announcement } = await import('./models/announcementModel.js');
const { createAuthToken } = await import('./utils/authToken.js');
const { AppSetting } = await import('./models/appSettingModel.js');
// No start month for leave credits unless a test sets one.
mock.method(AppSetting, 'get', async () => '');

const app = createApiApp();

// Sets today to Mon Nov 2, 2026 in Manila for one test, so dates the tests file for stay in
// the future (a travel order or vacation leave cannot be filed for a day that has passed).
const onNovember2 = t => t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-02T09:00:00+08:00') });

// HR 1 (Ms. Salcedo) and HR 2 (Sir Erick).
const hr = { _id: 'hr-1', email: 'hr@dilg.gov.ph', name: 'Ma. Joane O. Salcedo', role: 'ADAS II', accessLevel: 'hr_admin', hrTask: 'leave-credits', accountStatus: 'Active' };
const hr2 = { _id: 'hr-2', email: 'erick@dilg.gov.ph', name: 'John Erick J. Matining', role: 'LGOO VI / Program Manager', accessLevel: 'hr_admin', hrTask: 'pre-approval', accountStatus: 'Active' };
const requests = {
  // A leave waiting for HR 2, one HR 1 certified when HR 1 still did that step (waiting for
  // HR 2), and a Travel Order waiting for HR 2.
  'REQ-PENDING': { id: 'REQ-PENDING', status: 'Pending', type: 'Leave Request', leaveType: 'Vacation Leave', startDate: '2026-11-09', endDate: '2026-11-10', employeeId: 'E1' },
  'REQ-CERTIFIED': { id: 'REQ-CERTIFIED', status: 'For Pre-approval', type: 'Leave Request', leaveType: 'Vacation Leave', employeeId: 'E1', creditCertification: { asOf: '2026-11-02', certifiedBy: { name: 'Ma. Joane O. Salcedo' } } },
  'REQ-TRAVEL': { id: 'REQ-TRAVEL', status: 'Pending', type: 'Travel Order', employeeId: 'E1' },
  'REQ-APPROVED': { id: 'REQ-APPROVED', status: 'Approved', type: 'Leave Request', employeeId: 'E1' },
  'REQ-WITHDRAWN': { id: 'REQ-WITHDRAWN', status: 'Withdrawn', type: 'Travel Order', employeeId: 'E1' },
  'REQ-DRAFT': { id: 'REQ-DRAFT', status: 'Draft', type: 'Leave Request', employeeId: 'E1' }
};

// Signs in as HR (`as`, an HR/Admin account), with the requests above as the database, the
// given supervisor accounts, and the employee who filed them. Returns the saved updates.
const signInAsHr = (t, { supervisors = [], as = hr, employee = null } = {}) => {
  t.mock.method(User, 'findByEmail', async () => as);
  t.mock.method(User, 'findByEmployeeId', async () => employee);
  t.mock.method(Holiday, 'findAll', async () => []);
  t.mock.method(Announcement, 'createNotification', async notice => notice);
  t.mock.method(User, 'findByAccessLevel', async () => supervisors);
  t.mock.method(Leave, 'findByCustomId', async id => requests[id] || null);
  t.mock.method(Leave, 'findAllRequests', async () => Object.values(requests));
  const saves = t.mock.method(Leave, 'updateStatus', async (id, update) => ({ ...requests[id], ...update }));
  const bulkSaves = t.mock.method(Leave, 'bulkUpdate', async updates => updates);
  const token = createAuthToken(as);
  return {
    saves,
    bulkSaves,
    patch: (id, body) => request(app).patch(`/api/requests/${id}`).set('Authorization', `Bearer ${token}`).send(body),
    put: body => request(app).put('/api/requests').set('Authorization', `Bearer ${token}`).send(body),
    get: path => request(app).get(path).set('Authorization', `Bearer ${token}`)
  };
};

const juan = { employeeId: 'E1', name: 'Juan Dela Cruz', vacationLeaveCredits: 10, sickLeaveCredits: 5 };
const approve = { status: 'For Supervisor', recommendation: { decision: 'approval' } };

test('HR 2 certifies the leave credits of a leave and pre-approves it in one step', async t => {
  const session = signInAsHr(t, { as: hr2, employee: juan });
  const response = await session.patch('REQ-PENDING', { ...approve, remarks: 'Checked.' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const saved = session.saves.mock.calls[0].arguments[1];
  assert.equal(saved.status, 'For Supervisor');
  // 7.A: two working days (Nov 9 and 10) of vacation leave, from the balances now, signed by HR 2.
  assert.deepEqual(saved.creditCertification.vacationLeave, { earned: 10, less: 2, balance: 8 });
  assert.deepEqual(saved.creditCertification.sickLeave, { earned: 5, less: 0, balance: 5 });
  assert.deepEqual(saved.creditCertification.certifiedBy, { name: 'John Erick J. Matining', position: 'LGOO VI / Program Manager' });
  // 7.B: HR 2's recommendation.
  assert.equal(saved.recommendation.decision, 'approval');
  assert.deepEqual(saved.recommendation.recommendedBy, { name: 'John Erick J. Matining', position: 'LGOO VI / Program Manager' });
  // There is no HR 1 step in between any more.
  assert.equal((await session.patch('REQ-PENDING', { status: 'For Pre-approval' })).status, 409);
});

test('a leave HR 1 certified before is pre-approved by HR 2 without certifying it again', async t => {
  const session = signInAsHr(t, { as: hr2, employee: juan });
  const response = await session.patch('REQ-CERTIFIED', approve);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const saved = session.saves.mock.calls[0].arguments[1];
  assert.equal(saved.creditCertification, undefined);
  assert.equal(saved.recommendation.decision, 'approval');
});

test('once WorkMate counts leave credits from a start month, HR 2 certifies only after the starting balance', async t => {
  t.mock.method(AppSetting, 'get', async () => '2026-11');
  const longTime = { ...juan, name: 'Juan Dela Cruz', appointmentStatus: 'Permanent', dateHired: '2015-06-01' };
  const before = signInAsHr(t, { as: hr2, employee: longTime });
  const refused = await before.patch('REQ-PENDING', approve);
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /Juan Dela Cruz has no starting balance from the leave card yet/);
  assert.equal(before.saves.mock.callCount(), 0);
  // A Travel Order has no leave credits to certify.
  assert.equal((await before.patch('REQ-TRAVEL', approve)).status, 200);
  t.mock.restoreAll();

  t.mock.method(AppSetting, 'get', async () => '2026-11');
  const after = signInAsHr(t, { as: hr2, employee: { ...longTime, startingLeaveBalance: { start: '2026-11', asOf: '2026-10-31' } } });
  const certified = await after.patch('REQ-PENDING', approve);
  assert.equal(certified.status, 200, JSON.stringify(certified.body));
});

test('HR 2 pre-approves a Travel Order with a recommendation, and a disapproval says why', async t => {
  const session = signInAsHr(t, { as: hr2, employee: juan });
  assert.equal((await session.patch('REQ-TRAVEL', { ...approve, recommendation: { decision: 'disapproval', reason: 'No funds for the travel.' } })).status, 200);
  assert.equal(session.saves.mock.calls[0].arguments[1].creditCertification, undefined);
  assert.equal((await session.patch('REQ-TRAVEL', { status: 'For Pre-approval' })).status, 409);
  // A recommendation is needed, and a disapproval says why.
  assert.match((await session.patch('REQ-PENDING', { status: 'For Supervisor' })).body.error, /Choose the recommendation/);
  assert.match((await session.patch('REQ-PENDING', { status: 'For Supervisor', recommendation: { decision: 'disapproval' } })).body.error, /why/);
});

test('HR 1 takes no step on requests; only HR 2 does', async t => {
  const hr1Only = signInAsHr(t, { as: hr, employee: juan });
  for (const id of ['REQ-PENDING', 'REQ-CERTIFIED', 'REQ-TRAVEL']) {
    const response = await hr1Only.patch(id, approve);
    assert.equal(response.status, 409, id);
    assert.equal(response.body.error, "This step is HR 2 (certification and pre-approval)'s. Your HR account does HR 1 (leave credits) only.");
  }
  assert.equal((await hr1Only.patch('REQ-PENDING', { status: 'Returned', remarks: 'Attach the medical certificate.' })).status, 409);
  assert.equal(hr1Only.saves.mock.callCount(), 0);
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
  const session = signInAsHr(t, { as: hr2 });
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
  assert.match(notice.message, /was returned to you by John Erick J\. Matining\. Fix it in Requests and submit it again\. Remarks: Attach the medical certificate\./);
});

test('the employee fixes a returned request and submits it again, and HR is told', async t => {
  const employee = { _id: 'e-1', email: 'juan@dilg.gov.ph', employeeId: 'E1', name: 'Juan Dela Cruz', accessLevel: 'employee', accountStatus: 'Active' };
  const returned = { id: 'REQ-RETURNED', status: 'Returned', type: 'Leave Request', employeeId: 'E1', employeeEmail: employee.email, statusHistory: [] };
  t.mock.method(User, 'findByEmail', async () => employee);
  t.mock.method(Leave, 'findByCustomId', async () => returned);
  t.mock.method(Holiday, 'findAll', async () => []);
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
  // Tue Nov 3 and Wed Nov 4, 2026, counted by the server.
  assert.equal(update.workingDays, 2);
  assert.ok(notices.mock.calls.some(call => call.arguments[0].recipientRole === 'hr_admin'));
});

test('a leave or travel order that overlaps another submitted leave of the employee is refused', async t => {
  onNovember2(t);
  const employee = { _id: 'e-1', email: 'juan@dilg.gov.ph', employeeId: 'E1', name: 'Juan Dela Cruz', accessLevel: 'employee', accountStatus: 'Active' };
  const approved = { id: 'REQ-NOV', type: 'Leave Request', status: 'Approved', startDate: '2026-11-03', endDate: '2026-11-05', employeeId: 'E1' };
  t.mock.method(User, 'findByEmail', async () => employee);
  t.mock.method(Leave, 'findAbsencesOfEmployee', async () => [approved]);
  t.mock.method(Holiday, 'findAll', async () => []);
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

// Signs in as an employee with no other leave or travel. Returns `send` for new requests,
// `resubmit` for one already saved, and the saved requests.
const fileAsEmployee = (t, existing = null) => {
  onNovember2(t);
  const employee = { _id: 'e-1', email: 'juan@dilg.gov.ph', employeeId: 'E1', name: 'Juan Dela Cruz', accessLevel: 'employee', accountStatus: 'Active' };
  t.mock.method(User, 'findByEmail', async () => employee);
  t.mock.method(Leave, 'findAbsencesOfEmployee', async () => []);
  t.mock.method(Leave, 'findByCustomId', async () => existing);
  t.mock.method(Holiday, 'findAll', async () => []);
  const creates = t.mock.method(Leave, 'create', async saved => ({ ...saved, id: 'REQ-NEW' }));
  const saves = t.mock.method(Leave, 'updateStatus', async (_id, update) => ({ ...existing, ...update }));
  t.mock.method(Announcement, 'createNotification', async notice => notice);
  const token = createAuthToken(employee);
  return {
    creates,
    saves,
    send: body => request(app).post('/api/requests').set('Authorization', `Bearer ${token}`).send(body),
    resubmit: body => request(app).patch(`/api/requests/${existing.id}`).set('Authorization', `Bearer ${token}`).send(body)
  };
};

test('vacation leave and travel orders cannot be filed for days that have passed', async t => {
  const { send, creates } = fileAsEmployee(t);
  const vacation = await send({ type: 'Leave Request', leaveType: 'Vacation Leave', startDate: '2026-10-01', endDate: '2026-10-01', purpose: 'Leave Type: Vacation Leave. Trip.', status: 'Pending' });
  assert.equal(vacation.status, 400);
  assert.match(vacation.body.error, /Vacation Leave is filed before the leave starts\. Oct 1, 2026 has already passed/);
  const travel = await send({ type: 'Travel Order', leaveType: 'N/A', startDate: '2026-10-30', endDate: '2026-11-03', purpose: 'Official Travel. LGU visit.', status: 'Pending' });
  assert.equal(travel.status, 400);
  assert.match(travel.body.error, /travel order is filed before the travel/);
  assert.equal(creates.mock.callCount(), 0);

  // Today is still in time, and a draft is not filed yet.
  assert.equal((await send({ type: 'Travel Order', leaveType: 'N/A', startDate: '2026-11-02', endDate: '2026-11-02', purpose: 'Official Travel. Today.', status: 'Pending' })).status, 201);
  assert.equal((await send({ type: 'Leave Request', leaveType: 'Vacation Leave', startDate: '2026-10-01', endDate: '2026-10-01', purpose: 'Leave Type: Vacation Leave. Draft.', status: 'Draft' })).status, 201);
});

test('sick leave can be filed after the days it covers, upon return', async t => {
  const { send } = fileAsEmployee(t);
  const sick = await send({ type: 'Leave Request', leaveType: 'Sick Leave', startDate: '2026-10-29', endDate: '2026-10-30', purpose: 'Leave Type: Sick Leave. Fever.', status: 'Pending' });
  assert.equal(sick.status, 201, JSON.stringify(sick.body));
});

test('a draft for a day that has passed cannot be submitted', async t => {
  const draft = { id: 'REQ-DRAFT', type: 'Travel Order', status: 'Draft', startDate: '2026-10-28', endDate: '2026-10-28', employeeId: 'E1', employeeEmail: 'juan@dilg.gov.ph', statusHistory: [{ status: 'Draft', date: '2026-10-20' }] };
  const { resubmit, saves } = fileAsEmployee(t, draft);
  const response = await resubmit({ status: 'Pending' });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /Oct 28, 2026 has already passed/);
  assert.equal(saves.mock.callCount(), 0);
});

test('a request filed in time and returned to be fixed can be submitted again after its date', async t => {
  const returned = {
    id: 'REQ-RETURNED', type: 'Leave Request', leaveType: 'Vacation Leave', status: 'Returned',
    startDate: '2026-10-30', endDate: '2026-10-30', employeeId: 'E1', employeeEmail: 'juan@dilg.gov.ph', submissionDate: '2026-10-20',
    statusHistory: [{ status: 'Pending', date: '2026-10-20' }, { status: 'Returned', date: '2026-10-29' }]
  };
  const { resubmit } = fileAsEmployee(t, returned);
  const response = await resubmit({ status: 'Pending', purpose: 'Leave Type: Vacation Leave. With the signed form.' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
});

test('HR does not receive employee drafts', async t => {
  const session = signInAsHr(t);
  const response = await session.get('/api/requests');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.map(item => item.id).sort(), ['REQ-APPROVED', 'REQ-CERTIFIED', 'REQ-PENDING', 'REQ-TRAVEL', 'REQ-WITHDRAWN']);
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
  const session = signInAsHr(t, { supervisors, as: hr2 });
  const sms = useSmsGateway(t);
  const response = await session.patch('REQ-CERTIFIED', approve);
  assert.equal(response.status, 200);
  assert.equal(sms.gateway.mock.callCount(), 1);
  const sent = JSON.parse(sms.gateway.mock.calls[0].arguments[1].body);
  assert.equal(sent.recipient, '+639171234567');
  assert.match(sent.content, /Leave Request is waiting for your approval/);
  assert.equal(sms.saved.mock.calls[0].arguments[0].kind, 'review');
});

test('HR\'s steps are taken one request at a time, not through the bulk update', async t => {
  const sms = useSmsGateway(t);
  // HR 2 certifies and pre-approves one request at a time.
  for (const [as, update] of [[hr2, { id: 'REQ-CERTIFIED', ...approve }], [hr2, { id: 'REQ-PENDING', ...approve }]]) {
    const session = signInAsHr(t, { supervisors, as });
    const response = await session.put([update]);
    assert.equal(response.status, 409);
    assert.match(response.body.error, /Open the request/);
    assert.equal(session.bulkSaves.mock.callCount(), 0);
    t.mock.restoreAll();
  }
  assert.equal(sms.gateway.mock.callCount(), 0);
});

test('a failed supervisor text does not stop the forward', async t => {
  const session = signInAsHr(t, { supervisors, as: hr2 });
  const sms = useSmsGateway(t, async () => { throw new Error('getaddrinfo ENOTFOUND'); });
  const response = await session.patch('REQ-CERTIFIED', approve);
  assert.equal(response.status, 200);
  assert.equal(session.saves.mock.callCount(), 1);
  assert.equal(sms.saved.mock.calls[0].arguments[0].status, 'Failed');
});

test('a leave\'s working days are counted by the server, without holidays, whatever the form sent', async t => {
  onNovember2(t);
  const employee = { _id: 'e-1', email: 'juan@dilg.gov.ph', employeeId: 'E1', name: 'Juan Dela Cruz', accessLevel: 'employee', accountStatus: 'Active' };
  t.mock.method(User, 'findByEmail', async () => employee);
  t.mock.method(Leave, 'findAbsencesOfEmployee', async () => []);
  t.mock.method(Holiday, 'findAll', async () => [{ date: '2026-11-30', name: 'Bonifacio Day' }]);
  const creates = t.mock.method(Leave, 'create', async request => ({ ...request, id: 'REQ-DAYS' }));
  t.mock.method(Announcement, 'createNotification', async notice => notice);
  // Fri Nov 27 to Tue Dec 1: Fri, Mon (a holiday), and Tue.
  const response = await request(app).post('/api/requests').set('Authorization', `Bearer ${createAuthToken(employee)}`)
    .send({ type: 'Leave Request', startDate: '2026-11-27', endDate: '2026-12-01', purpose: 'Leave Type: Vacation Leave. Trip.', leaveType: 'Vacation Leave', workingDays: 0, status: 'Pending' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.equal(creates.mock.calls[0].arguments[0].workingDays, 2);
});

test('approved sick leave is charged to sick leave, then vacation leave, then without pay', async t => {
  const supervisor = { _id: 's-1', email: 'boss@dilg.gov.ph', employeeId: 'S1', name: 'Ana Reyes', accessLevel: 'supervisor', accountStatus: 'Active' };
  // Mon Nov 2 to Thu Nov 5, 2026: 4 days.
  const leave = { id: 'REQ-SICK', type: 'Leave Request', leaveType: 'Sick Leave', status: 'For Supervisor', startDate: '2026-11-02', endDate: '2026-11-05', employeeId: 'E1', employeeEmail: 'juan@dilg.gov.ph', workingDays: 1 };
  t.mock.method(User, 'findByEmail', async email => (email === supervisor.email ? supervisor : null));
  t.mock.method(User, 'findByEmployeeId', async () => null);
  t.mock.method(Holiday, 'findAll', async () => []);
  t.mock.method(Leave, 'findByCustomId', async () => leave);
  t.mock.method(Leave, 'updateStatus', async (_id, update) => ({ ...leave, ...update }));
  t.mock.method(Leave, 'markCreditsDeducted', async () => true);
  const saved = t.mock.method(Leave, 'saveCreditCharge', async () => {});
  const charges = t.mock.method(User, 'chargeApprovedLeave', async (owner, { field, days, reason }) => {
    const charge = { days, sickLeaveDays: 2, vacationLeaveDays: 1.5, withoutPayDays: 0.5, vacationLeaveCredits: 0, sickLeaveCredits: 0 };
    return { employee: { employeeId: 'E1', email: owner.email, reasonWritten: reason(charge) }, charge };
  });
  const notices = t.mock.method(Announcement, 'createNotification', async notice => notice);

  const response = await request(app).patch('/api/requests/REQ-SICK').set('Authorization', `Bearer ${createAuthToken(supervisor)}`)
    .send({ status: 'Approved', supervisorRemarks: 'Get well.' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  // The 4 days come from the dates, not the 1 on the request.
  assert.deepEqual(charges.mock.calls[0].arguments[1].field, 'sickLeaveCredits');
  assert.equal(charges.mock.calls[0].arguments[1].days, 4);
  assert.equal(saved.mock.calls[0].arguments[1].withoutPayDays, 0.5);
  const notice = notices.mock.calls.map(call => call.arguments[0]).find(item => item.title === 'Leave Credits Charged');
  assert.match(notice.message, /2 days sick leave, 1\.5 days vacation leave, 0\.5 days without pay/);
});

test('the supervisor disapproves a leave and a travel order with remarks and a signature', async t => {
  const supervisor = { _id: 's-1', email: 'boss@dilg.gov.ph', employeeId: 'S1', name: 'Ana Reyes', accessLevel: 'supervisor', accountStatus: 'Active' };
  const waiting = {
    'REQ-LEAVE': { id: 'REQ-LEAVE', type: 'Leave Request', leaveType: 'Vacation Leave', status: 'For Supervisor', startDate: '2026-11-09', endDate: '2026-11-10', employeeId: 'E1', employeeEmail: 'juan@dilg.gov.ph', statusHistory: [] },
    'REQ-TRAVEL': { id: 'REQ-TRAVEL', type: 'Travel Order', status: 'For Supervisor', startDate: '2026-11-09', endDate: '2026-11-09', employeeId: 'E1', employeeEmail: 'juan@dilg.gov.ph', statusHistory: [] }
  };
  t.mock.method(User, 'findByEmail', async email => (email === supervisor.email ? supervisor : null));
  t.mock.method(User, 'findByEmployeeId', async () => null);
  t.mock.method(Holiday, 'findAll', async () => []);
  t.mock.method(Leave, 'findByCustomId', async id => waiting[id] || null);
  const saves = t.mock.method(Leave, 'updateStatus', async (id, update) => ({ ...waiting[id], ...update }));
  const charges = t.mock.method(User, 'chargeApprovedLeave', async () => null);
  const notices = t.mock.method(Announcement, 'createNotification', async notice => notice);
  // What the Supervisor's screen sends for Disapprove Request.
  const signature = `data:image/png;base64,${'A'.repeat(20000)}`;
  for (const id of Object.keys(waiting)) {
    const response = await request(app).patch(`/api/requests/${id}`).set('Authorization', `Bearer ${createAuthToken(supervisor)}`)
      .send({
        status: 'Rejected', stage: 'Rejected', approver: 'Supervisor Review Desk', remarks: 'Needed at the office.',
        supervisorSignature: signature, supervisorRemarks: 'Needed at the office.', supervisorApprovedAt: '2026-11-02',
        supervisorName: 'Ana Reyes', signatureData: signature,
        statusHistory: [{ status: 'Rejected', date: '2026-11-02', actor: 'Supervisor Review Desk' }]
      });
    assert.equal(response.status, 200, `${id}: ${JSON.stringify(response.body)}`);
    assert.equal(response.body.request.status, 'Rejected');
  }
  assert.equal(saves.mock.callCount(), 2);
  assert.equal(charges.mock.callCount(), 0);
  assert.ok(notices.mock.calls.some(call => /Disapproved|disapproved|Rejected/.test(`${call.arguments[0].title} ${call.arguments[0].message}`)));
});

test('special privilege leave is 3 days a year and wellness leave 5, at most 3 at a time, filed or approved', async t => {
  onNovember2(t);
  const employee = { _id: 'e-1', email: 'juan@dilg.gov.ph', employeeId: 'E1', name: 'Juan Dela Cruz', accessLevel: 'employee', accountStatus: 'Active' };
  const taken = [
    { id: 'REQ-SPL', type: 'Leave Request', leaveType: 'Special Privilege Leave', status: 'Approved', startDate: '2026-03-02', endDate: '2026-03-03', employeeId: 'E1' },
    { id: 'REQ-WL', type: 'Leave Request', leaveType: 'Wellness Leave', status: 'For Supervisor', startDate: '2026-06-01', endDate: '2026-06-03', employeeId: 'E1' }
  ];
  t.mock.method(User, 'findByEmail', async () => employee);
  t.mock.method(Leave, 'findAbsencesOfEmployee', async () => taken);
  t.mock.method(Holiday, 'findAll', async () => []);
  const creates = t.mock.method(Leave, 'create', async body => ({ ...body, id: 'REQ-NEW' }));
  t.mock.method(Announcement, 'createNotification', async notice => notice);
  const send = body => request(app).post('/api/requests').set('Authorization', `Bearer ${createAuthToken(employee)}`).send({ type: 'Leave Request', status: 'Pending', purpose: 'Leave Type.', ...body });

  // 2 of the 3 days of special privilege leave are used, so 2 more are too many.
  const spl = await send({ leaveType: 'Special Privilege Leave', startDate: '2026-11-09', endDate: '2026-11-10' });
  assert.equal(spl.status, 409);
  assert.match(spl.body.error, /You have 1 day left in 2026/);
  assert.equal((await send({ leaveType: 'Special Privilege Leave', startDate: '2026-11-09', endDate: '2026-11-09' })).status, 201);
  // Wellness leave: 3 at most at a time, and 2 of its 5 days are left.
  assert.match((await send({ leaveType: 'Wellness Leave', startDate: '2026-11-09', endDate: '2026-11-12' })).body.error, /at most 3 days at a time/);
  assert.match((await send({ leaveType: 'Wellness Leave', startDate: '2026-11-16', endDate: '2026-11-18' })).body.error, /2 days left in 2026/);
  assert.equal((await send({ leaveType: 'Wellness Leave', startDate: '2026-11-16', endDate: '2026-11-17' })).status, 201);
  assert.equal(creates.mock.callCount(), 2);
});

test('a Travel Order includes colleagues from other offices; they see it and hear when it is approved', async t => {
  onNovember2(t);
  const juan = { _id: 'e-1', email: 'juan@dilg.gov.ph', employeeId: 'E1', name: 'Juan Dela Cruz', accessLevel: 'employee', accountStatus: 'Active' };
  const maria = { _id: 'e-7', email: 'maria@dilg.gov.ph', employeeId: 'E7', name: 'Maria Santos', role: 'MLGOO', office: 'Office of the MLGOO - Gasan', accessLevel: 'employee', accountStatus: 'Active' };
  const head = { _id: 's-1', email: 'boss@dilg.gov.ph', employeeId: 'S1', name: 'Ivan Fadri', accessLevel: 'supervisor', accountStatus: 'Active' };
  const people = { [juan.email]: juan, [maria.email]: maria, [head.email]: head };
  let mariasAbsences = [];
  t.mock.method(User, 'findByEmail', async email => people[email] || null);
  t.mock.method(User, 'findByEmployeeId', async id => ({ E1: juan, E7: maria }[id] || null));
  t.mock.method(Leave, 'findAbsencesOfEmployee', async ({ employeeId }) => (employeeId === 'E7' ? mariasAbsences : []));
  t.mock.method(Holiday, 'findAll', async () => []);
  const creates = t.mock.method(Leave, 'create', async body => ({ ...body, id: 'TO-NEW' }));
  const notices = t.mock.method(Announcement, 'createNotification', async notice => notice);
  const as = person => `Bearer ${createAuthToken(person)}`;
  const file = body => request(app).post('/api/requests').set('Authorization', as(juan)).send({
    type: 'Travel Order', status: 'Pending', purpose: 'Official Travel. LGU visit.', travelActivity: 'LGU visit', travelTime: '8:00 a.m.', travelVenue: 'Gasan Municipal Hall', startDate: '2026-11-10', endDate: '2026-11-10', ...body
  });

  // The names come from the accounts, not from what the form sent, and the one filing is left out.
  const filed = await file({ companions: [{ employeeId: 'E7', name: 'Someone Else' }, { employeeId: 'E1' }] });
  assert.equal(filed.status, 201, JSON.stringify(filed.body));
  assert.deepEqual(creates.mock.calls[0].arguments[0].companions, [{ employeeId: 'E7', name: 'Maria Santos', role: 'MLGOO', office: 'Office of the MLGOO - Gasan' }]);
  assert.match((await file({ companions: [{ employeeId: 'NOPE' }] })).body.error, /not an active employee account/);
  // Maria cannot be included on a day she is on leave.
  mariasAbsences = [{ id: 'L-9', type: 'Leave Request', status: 'Approved', startDate: '2026-11-10', endDate: '2026-11-10', employeeId: 'E7' }];
  const busy = await file({ companions: [{ employeeId: 'E7' }] });
  assert.equal(busy.status, 409);
  assert.match(busy.body.error, /Maria Santos cannot be included: they already have a leave/);
  assert.equal(creates.mock.callCount(), 1);

  // Maria sees the Travel Orders that include her, and no other of Juan's.
  const orders = {
    'TO-1': { id: 'TO-1', type: 'Travel Order', status: 'For Supervisor', employeeId: 'E1', employeeName: 'Juan Dela Cruz', travelVenue: 'Gasan Municipal Hall', startDate: '2026-11-10', endDate: '2026-11-10', companions: [{ employeeId: 'E7', name: 'Maria Santos' }] },
    'TO-2': { id: 'TO-2', type: 'Travel Order', status: 'For Supervisor', employeeId: 'E1', startDate: '2026-11-11', endDate: '2026-11-11', companions: [] }
  };
  t.mock.method(Leave, 'findAllRequests', async () => Object.values(orders));
  const seen = await request(app).get('/api/requests').set('Authorization', as(maria));
  assert.deepEqual(seen.body.map(item => item.id), ['TO-1']);

  // When the Head approves it, Maria hears that she needs no Time In.
  t.mock.method(Leave, 'findByCustomId', async id => orders[id] || null);
  t.mock.method(Leave, 'updateStatus', async (id, update) => ({ ...orders[id], ...update }));
  const approved = await request(app).patch('/api/requests/TO-1').set('Authorization', as(head)).send({ status: 'Approved', supervisorRemarks: 'Approved.' });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const notice = notices.mock.calls.map(call => call.arguments[0]).find(item => item.title === 'Included in a Travel Order');
  assert.equal(notice.employeeId, 'E7');
  assert.match(notice.message, /Juan Dela Cruz included you in Travel Order TO-1 \(Gasan Municipal Hall, Nov 10, 2026\), which was approved\. No Time In is needed/);
});
