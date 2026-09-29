import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'account-approval-test-secret';
// No SMS provider in tests: an approval reports that SMS is not set up. The key is set to
// empty (not deleted) so the app's .env loader cannot fill in a real key, and any network
// call fails the test, so no real text message is ever sent.
process.env.UNISMS_API_KEY = '';
globalThis.fetch = async url => {
  throw new Error(`Tests must not call the network (${url}).`);
};

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { Announcement } = await import('./models/announcementModel.js');
const { createAuthToken } = await import('./utils/authToken.js');
const { toPhilippineMobile, sendAccountApprovedSms } = await import('./services/smsService.js');
const { inactiveAccountMessage, maskMobile } = await import('./services/accountNotifications.js');

const app = createApiApp();
const hr = { _id: 'hr-1', email: 'hr@dilg.gov.ph', accessLevel: 'hr_admin', accountStatus: 'Active' };
const pendingEmployee = {
  _id: 'emp-1',
  name: 'Juan Dela Cruz',
  email: 'juan@gmail.com',
  employeeId: 'DILG-2026-1',
  accessLevel: 'employee',
  accountStatus: 'Pending',
  phoneNumber: '0917 123 4567'
};

test('only Philippine mobile numbers can get the approval SMS', async () => {
  assert.equal(toPhilippineMobile('09171234567'), '+639171234567');
  assert.equal(toPhilippineMobile('+63 917-123-4567'), '+639171234567');
  assert.equal(toPhilippineMobile('639171234567'), '+639171234567');
  assert.equal(toPhilippineMobile('(042) 332 1234'), '');
  assert.equal(toPhilippineMobile(''), '');
  assert.equal(await sendAccountApprovedSms({ phoneNumber: '' }), 'no-phone');
  assert.equal(await sendAccountApprovedSms({ phoneNumber: '09171234567' }), 'not-configured');
});

test('a pending account is told it is waiting for HR and where the SMS will go', () => {
  assert.equal(maskMobile('+639171234567'), '0917*****67');
  assert.equal(
    inactiveAccountMessage(pendingEmployee),
    'Your account is still waiting for HR approval. You will get an SMS at 0917*****67 once it is approved.'
  );
  assert.match(inactiveAccountMessage({ accountStatus: 'Pending' }), /HR will let you know/);
  assert.equal(inactiveAccountMessage({ accountStatus: 'Inactive' }), 'This account is inactive. Please contact the HR Administrator.');
});

test('logging in to a pending account shows the waiting message', async t => {
  t.mock.method(User, 'findByEmail', async () => pendingEmployee);
  t.mock.method(User, 'verifyPassword', async () => true);
  const response = await request(app).post('/api/login').send({ email: 'juan@gmail.com', password: 'a-long-password-42', role: 'employee' });
  assert.equal(response.status, 403);
  assert.match(response.body.error, /still waiting for HR approval\. You will get an SMS at 0917\*\*\*\*\*67/);
});

// Approves or changes an employee's status as HR, with the database replaced.
const changeStatus = async (t, before, accountStatus) => {
  t.mock.method(User, 'findByEmail', async () => hr);
  t.mock.method(User, 'findAccount', async () => before);
  t.mock.method(User, 'updateAccountStatus', async (_id, status) => ({ ...before, accountStatus: status }));
  const notify = t.mock.method(Announcement, 'createNotification', async data => data);
  const response = await request(app)
    .patch('/api/employees/DILG-2026-1/status')
    .set('Authorization', `Bearer ${createAuthToken(hr)}`)
    .send({ accountStatus });
  return { response, notify };
};

test('approving an account tells the employee and reports the SMS to HR', async t => {
  const { response, notify } = await changeStatus(t, pendingEmployee, 'Active');
  assert.equal(response.status, 200);
  assert.equal(response.body.approvalSms, 'not-configured');
  assert.equal(notify.mock.calls[0].arguments[0].title, 'Account Approved');
});

test('saving an already active account does not message the employee again', async t => {
  const { response, notify } = await changeStatus(t, { ...pendingEmployee, accountStatus: 'Active' }, 'Active');
  assert.equal(response.status, 200);
  assert.equal(response.body.approvalSms, undefined);
  assert.equal(notify.mock.callCount(), 0);
});

test('declining an account sends no approval message', async t => {
  const { response, notify } = await changeStatus(t, pendingEmployee, 'Inactive');
  assert.equal(response.status, 200);
  assert.equal(response.body.approvalSms, undefined);
  assert.equal(notify.mock.callCount(), 0);
});
