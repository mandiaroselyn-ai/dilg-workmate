import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'tardiness-deduction-test-secret';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { Announcement } = await import('./models/announcementModel.js');
const { createAuthToken } = await import('./utils/authToken.js');

const app = createApiApp();
const hrAdmin = { _id: '64b000000000000000000041', email: 'hr@dilg.gov.ph', employeeId: 'HR-4', name: 'Maria Santos', accessLevel: 'hr_admin', accountStatus: 'Active' };
const employee = { _id: '64b000000000000000000042', email: 'juan@dilg.gov.ph', employeeId: 'EMP-4', name: 'Juan Dela Cruz', accessLevel: 'employee', accountStatus: 'Active' };

const signIn = (t, as = hrAdmin) => {
  t.mock.method(User, 'findByEmail', async () => as);
  t.mock.method(Announcement, 'createNotification', async notice => notice);
  return body => request(app).post('/api/employees/tardiness-deductions').set('Authorization', `Bearer ${createAuthToken(as)}`).send(body);
};

test('HR charges a month of tardiness and undertime to vacation leave by the CSC table', async t => {
  const send = signIn(t);
  t.mock.method(User, 'deductTardiness', async (identifier, { month, minutes, days, reason }) => {
    const entry = { month, minutes, days, deductedDays: 0.2, withoutPayDays: 0.081 };
    return { employee: { ...employee, vacationLeaveCredits: 0, reasonWritten: reason(entry) }, entry };
  });
  // The previous month: today is in the month after it.
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-03T02:00:00Z') });
  const response = await send({ month: '2026-10', deductions: [{ identifier: 'EMP-4', minutes: 135 }] });
  assert.equal(response.status, 200, JSON.stringify(response.body));

  // 2 hours 15 minutes is 0.281 day.
  const [, charge] = User.deductTardiness.mock.calls[0].arguments;
  assert.equal(charge.days, 0.281);
  assert.equal(response.body.results[0].status, 'deducted');
  assert.equal(response.body.results[0].employee.vacationLeaveCredits, 0);
  assert.match(response.body.results[0].employee.reasonWritten, /Tardiness and undertime, October 2026: 2h 15m = 0\.281 day; 0\.081 day without pay/);
  const notice = Announcement.createNotification.mock.calls[0].arguments[0];
  assert.equal(notice.employeeId, 'EMP-4');
  assert.match(notice.message, /0\.200 day was deducted from your vacation leave, and 0\.081 day is without pay/);
});

test('a month already charged is not charged again', async t => {
  const send = signIn(t);
  t.mock.method(User, 'deductTardiness', async () => ({ alreadyDeducted: { month: '2026-10', days: 0.281 } }));
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-03T02:00:00Z') });
  const response = await send({ month: '2026-10', deductions: [{ identifier: 'EMP-4', minutes: 135 }] });
  assert.equal(response.body.results[0].status, 'already-deducted');
  assert.equal(Announcement.createNotification.mock.callCount(), 0);
});

test('the month must be over, and only HR can charge it', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-28T02:00:00Z') });
  const hr = signIn(t);
  t.mock.method(User, 'deductTardiness', async () => null);
  const thisMonth = await hr({ month: '2026-10', deductions: [{ identifier: 'EMP-4', minutes: 5 }] });
  assert.equal(thisMonth.status, 400);
  assert.match(thisMonth.body.error, /month that has ended/);
  assert.equal(User.deductTardiness.mock.callCount(), 0);
});

test('an employee cannot charge leave credits', async t => {
  const send = signIn(t, employee);
  t.mock.method(User, 'deductTardiness', async () => null);
  const response = await send({ month: '2026-09', deductions: [{ identifier: 'EMP-4', minutes: 0 }] });
  assert.equal(response.status, 403);
  assert.equal(User.deductTardiness.mock.callCount(), 0);
});

test('HR credits a month of earned leave, less for the days without pay that month', async t => {
  const { Leave } = await import('./models/leaveModel.js');
  const send = body => request(app).post('/api/employees/leave-earnings').set('Authorization', `Bearer ${createAuthToken(hrAdmin)}`).send(body);
  t.mock.method(User, 'findByEmail', async email => (email === hrAdmin.email ? hrAdmin : null));
  t.mock.method(User, 'findByEmployeeId', async () => ({ ...employee, tardinessDeductions: [{ month: '2026-10', withoutPayDays: 0.081 }] }));
  t.mock.method(Leave, 'findAbsencesOfEmployee', async () => [
    { type: 'Leave Request', status: 'Approved', startDate: '2026-10-12', creditCharge: { withoutPayDays: 1 } }
  ]);
  const credits = t.mock.method(User, 'creditMonthlyEarnings', async (identifier, { month, withoutPayDays, earned, reason }) => ({
    employee: { ...employee, vacationLeaveCredits: 16.205, reasonWritten: reason },
    entry: { month, withoutPayDays, earned }
  }));
  const notices = t.mock.method(Announcement, 'createNotification', async notice => notice);
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-03T02:00:00Z') });

  const response = await send({ month: '2026-10', identifiers: ['EMP-4'] });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const [, credit] = credits.mock.calls[0].arguments;
  // 1 day of unpaid leave and 0.081 day of unpaid tardiness: 1.25 × (30 − 1.081) / 30.
  assert.equal(credit.withoutPayDays, 1.081);
  assert.equal(credit.earned, 1.205);
  assert.match(credit.reason, /Leave earned for October 2026: 1\.205 day vacation leave and 1\.205 day sick leave \(1\.081 day without pay that month\)/);
  assert.equal(response.body.results[0].status, 'credited');
  assert.match(notices.mock.calls[0].arguments[0].message, /You earned 1\.205 day of vacation leave and 1\.205 day of sick leave for October 2026/);

  const thisMonth = await send({ month: '2026-11', identifiers: ['EMP-4'] });
  assert.equal(thisMonth.status, 400);
  assert.match(thisMonth.body.error, /month that has ended/);
});

test('everyone sees the holidays; only HR adds or removes them', async t => {
  const { Holiday } = await import('./models/holidayModel.js');
  t.mock.method(User, 'findByEmail', async email => (email === hrAdmin.email ? hrAdmin : employee));
  t.mock.method(Holiday, 'findAll', async () => [{ date: '2026-12-25', name: 'Christmas Day' }]);
  const saves = t.mock.method(Holiday, 'saveMany', async holidays => holidays);
  const removes = t.mock.method(Holiday, 'remove', async () => true);
  const as = person => ({
    get: () => request(app).get('/api/holidays').set('Authorization', `Bearer ${createAuthToken(person)}`),
    post: body => request(app).post('/api/holidays').set('Authorization', `Bearer ${createAuthToken(person)}`).send(body),
    remove: date => request(app).delete(`/api/holidays?date=${date}`).set('Authorization', `Bearer ${createAuthToken(person)}`)
  });

  const seen = await as(employee).get();
  assert.equal(seen.status, 200);
  assert.deepEqual(seen.body.holidays, [{ date: '2026-12-25', name: 'Christmas Day' }]);
  assert.equal((await as(employee).post({ holidays: [{ date: '2026-12-24', name: 'Christmas Eve' }] })).status, 403);
  assert.equal((await as(employee).remove('2026-12-25')).status, 403);

  const added = await as(hrAdmin).post({ holidays: [{ date: '2026-12-24', name: 'Christmas Eve' }] });
  assert.equal(added.status, 200, JSON.stringify(added.body));
  assert.deepEqual(saves.mock.calls[0].arguments[0], [{ date: '2026-12-24', name: 'Christmas Eve' }]);
  assert.equal((await as(hrAdmin).post({ holidays: [{ date: '2026-13-01', name: 'Bad' }] })).status, 400);
  assert.equal((await as(hrAdmin).remove('2026-12-25')).status, 200);
  assert.equal(removes.mock.calls[0].arguments[0], '2026-12-25');
});
