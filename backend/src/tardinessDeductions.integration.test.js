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
