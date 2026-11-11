import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'leave-credits-start-test-secret';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { Leave } = await import('./models/leaveModel.js');
const { Announcement } = await import('./models/announcementModel.js');
const { AppSetting } = await import('./models/appSettingModel.js');
const { createAuthToken } = await import('./utils/authToken.js');

const app = createApiApp();
// HR 1, who changes leave credits, and HR 2, who does not.
const hr1 = { _id: '64b000000000000000000051', email: 'hr1@dilg.gov.ph', employeeId: 'HR-5', name: 'Ma. Joane O. Salcedo', accessLevel: 'hr_admin', hrTask: 'leave-credits', accountStatus: 'Active' };
const hr2 = { ...hr1, _id: '64b000000000000000000052', email: 'hr2@dilg.gov.ph', employeeId: 'HR-6', hrTask: 'pre-approval' };
// An employee since 2015 with no starting balance yet, one hired after the start, and a JO worker.
const longTime = { _id: '64b000000000000000000053', email: 'juan@dilg.gov.ph', employeeId: 'EMP-5', name: 'Juan Dela Cruz', accessLevel: 'employee', accountStatus: 'Active', appointmentStatus: 'Permanent', dateHired: '2015-06-01', vacationLeaveCredits: 3, sickLeaveCredits: 3 };
const newHire = { ...longTime, _id: '64b000000000000000000054', email: 'ana@dilg.gov.ph', employeeId: 'EMP-6', name: 'Ana Reyes', dateHired: '2026-11-16' };
const jobOrder = { ...longTime, _id: '64b000000000000000000055', email: 'pedro@dilg.gov.ph', employeeId: 'EMP-7', name: 'Pedro Cruz', appointmentStatus: 'Job Order' };
const accounts = [longTime, newHire, jobOrder];

// Clears one sign-in's mocks and clock, for a test that signs in again.
const signOut = t => {
  t.mock.restoreAll();
  t.mock.timers.reset();
};

// Signs in as `as` with WorkMate's start month `start` and the employee accounts `employees`.
const signIn = (t, { as = hr1, start = '', employees = accounts, now = '2026-11-20T02:00:00Z' } = {}) => {
  t.mock.method(User, 'findByEmail', async email => (email === as.email ? as : null));
  t.mock.method(User, 'findAccount', async id => employees.find(item => item.employeeId === id || item.email === id) || null);
  t.mock.method(User, 'findByEmployeeId', async id => employees.find(item => item.employeeId === id) || null);
  t.mock.method(User, 'findByAccessLevel', async () => employees);
  t.mock.method(Leave, 'findAbsencesOfEmployee', async () => []);
  t.mock.method(Announcement, 'createNotification', async notice => notice);
  const get = t.mock.method(AppSetting, 'get', async () => start);
  const set = t.mock.method(AppSetting, 'set', async (key, value) => value);
  // Today is in November 2026 unless a test says otherwise, so October has ended.
  t.mock.timers.enable({ apis: ['Date'], now: new Date(now) });
  const auth = { Authorization: `Bearer ${createAuthToken(as)}` };
  return {
    get,
    set,
    getStart: () => request(app).get('/api/employees/leave-credits-start').set(auth),
    setStart: month => request(app).put('/api/employees/leave-credits-start').set(auth).send({ month }),
    enter: balances => request(app).post('/api/employees/starting-balances').set(auth).send({ balances }),
    credit: (month, identifiers) => request(app).post('/api/employees/leave-earnings').set(auth).send({ month, identifiers }),
    charge: (month, deductions) => request(app).post('/api/employees/tardiness-deductions').set(auth).send({ month, deductions })
  };
};

test('HR 1 sets the month WorkMate starts counting leave credits, as of the leave card the day before', async t => {
  const session = signIn(t);
  const none = await session.getStart();
  assert.deepEqual(none.body, { success: true, start: '', asOf: '' });
  const saved = await session.setStart('2026-11');
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(saved.body, { success: true, start: '2026-11', asOf: '2026-10-31' });
  assert.deepEqual(session.set.mock.calls[0].arguments.slice(0, 2), ['leaveCreditsStart', '2026-11']);
});

test('only HR 1 and HR 2 set the start; an HR account with no HR step sees it', async t => {
  const session = signIn(t, { as: { ...hr2, hrTask: '' }, start: '2026-11' });
  assert.equal((await session.setStart('2027-01')).status, 403);
  assert.equal((await session.enter([{ identifier: 'EMP-5', vacationLeaveCredits: 40 }])).status, 403);
  const seen = await session.getStart();
  assert.equal(seen.body.start, '2026-11');
  assert.equal(session.set.mock.callCount(), 0);
});

test('HR 2 also sets the start', async t => {
  const session = signIn(t, { as: hr2 });
  assert.equal((await session.setStart('2026-12')).status, 200);
});

test('the start comes after any month already credited, and stays once starting balances are entered', async t => {
  const credited = signIn(t, { employees: [{ ...longTime, leaveEarnings: [{ month: '2026-10' }] }] });
  const early = await credited.setStart('2026-10');
  assert.equal(early.status, 400);
  assert.match(early.body.error, /October 2026 is already credited or charged in WorkMate, so start from November 2026 or later/);
  signOut(t);

  const entered = signIn(t, { start: '2026-11', employees: [{ ...longTime, startingLeaveBalance: { start: '2026-11' } }] });
  const moved = await entered.setStart('2027-01');
  assert.equal(moved.status, 400);
  assert.match(moved.body.error, /already entered, so the start stays November 2026/);
});

test('HR 1 enters each active employee\'s balance from the leave card once, and the employee is told', async t => {
  const session = signIn(t, { start: '2026-11' });
  const setBalance = t.mock.method(User, 'setStartingBalance', async (identifier, credits) => ({
    employee: { ...longTime, ...credits, startingLeaveBalance: { start: '2026-11', asOf: '2026-10-31', ...credits } }
  }));
  const response = await session.enter([
    { identifier: 'EMP-5', vacationLeaveCredits: '45.125', sickLeaveCredits: '60' },
    { identifier: 'EMP-7', vacationLeaveCredits: 10 },
    { identifier: 'nobody@dilg.gov.ph', vacationLeaveCredits: 1 }
  ]);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(response.body.results.map(item => item.status), ['entered', 'no-leave-credits', 'not-found']);
  const [identifier, credits, details] = setBalance.mock.calls[0].arguments;
  assert.equal(identifier, 'EMP-5');
  assert.deepEqual(credits, { vacationLeaveCredits: 45.125, sickLeaveCredits: 60 });
  assert.equal(details.start, '2026-11');
  assert.equal(details.asOf, '2026-10-31');
  assert.equal(details.reason, 'Starting balance from the leave card as of October 31, 2026');
  const notice = Announcement.createNotification.mock.calls[0].arguments[0];
  assert.equal(notice.employeeId, 'EMP-5');
  assert.match(notice.message, /as of October 31, 2026: 45\.125 days vacation leave and 60 days sick leave\. WorkMate counts your leave credits from November 2026 on\./);
  assert.equal(setBalance.mock.callCount(), 1);
});

test('a starting balance needs a start month and sensible numbers, and is entered once per start', async t => {
  const noStart = signIn(t);
  const refused = await noStart.enter([{ identifier: 'EMP-5', vacationLeaveCredits: 40 }]);
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /Set the month WorkMate starts counting leave credits first/);
  signOut(t);

  const session = signIn(t, { start: '2026-11' });
  const negative = await session.enter([{ identifier: 'EMP-5', vacationLeaveCredits: -1 }]);
  assert.equal(negative.status, 400);
  assert.match(negative.body.error, /vacation leave balance must be a number from 0 to 1000/);
  t.mock.method(User, 'setStartingBalance', async () => ({ alreadySet: { start: '2026-11' } }));
  const again = await session.enter([{ identifier: 'EMP-5', vacationLeaveCredits: 40 }]);
  assert.equal(again.body.results[0].status, 'already-set');
  assert.equal(Announcement.createNotification.mock.callCount(), 0);
});

test('months before the start are on the leave card, so they are not credited or charged', async t => {
  const session = signIn(t, { start: '2026-11' });
  const credit = t.mock.method(User, 'creditMonthlyEarnings', async () => null);
  const charge = t.mock.method(User, 'deductTardiness', async () => null);
  const credited = await session.credit('2026-10', ['EMP-6']);
  assert.equal(credited.status, 400);
  assert.match(credited.body.error, /WorkMate starts counting leave credits in November 2026\. October 2026 is on the leave card/);
  const charged = await session.charge('2026-10', [{ identifier: 'EMP-6', minutes: 30 }]);
  assert.equal(charged.status, 400);
  assert.equal(credit.mock.callCount(), 0);
  assert.equal(charge.mock.callCount(), 0);
});

test('an employee without a starting balance is not credited or charged until HR 1 enters it', async t => {
  // Today is in December, so November has ended.
  const session = signIn(t, { start: '2026-11', now: '2026-12-03T02:00:00Z' });
  const credit = t.mock.method(User, 'creditMonthlyEarnings', async (identifier, entry) => ({
    employee: newHire,
    entry: { month: entry.month, earned: entry.earned }
  }));
  const charge = t.mock.method(User, 'deductTardiness', async (identifier, { month, minutes, days, reason }) => {
    const entry = { month, minutes, days, deductedDays: days, withoutPayDays: 0 };
    return { employee: { ...newHire, reasonWritten: reason(entry) }, entry };
  });
  const credited = await session.credit('2026-11', ['EMP-5', 'EMP-6']);
  assert.equal(credited.status, 200, JSON.stringify(credited.body));
  assert.deepEqual(credited.body.results.map(item => item.status), ['no-starting-balance', 'credited']);
  assert.equal(credit.mock.calls[0].arguments[0], 'EMP-6');
  const charged = await session.charge('2026-11', [{ identifier: 'EMP-5', minutes: 30 }, { identifier: 'EMP-6', minutes: 30 }]);
  assert.deepEqual(charged.body.results.map(item => item.status), ['no-starting-balance', 'deducted']);
  assert.equal(charge.mock.callCount(), 1);
});
