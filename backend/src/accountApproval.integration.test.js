import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import nodemailer from 'nodemailer';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'account-approval-test-secret';
process.env.GOOGLE_CLIENT_ID = 'test-google-client';
// No SMS provider or mail server in tests: an approval reports that they are not set up.
// The settings are set to empty (not deleted) so the app's .env loader cannot fill in real
// ones, and any network call fails the test, so no real text or email is ever sent.
for (const key of ['UNISMS_API_KEY', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM']) {
  process.env[key] = '';
}
globalThis.fetch = async url => {
  throw new Error(`Tests must not call the network (${url}).`);
};

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { Announcement } = await import('./models/announcementModel.js');
const { createAuthToken } = await import('./utils/authToken.js');
const { toPhilippineMobile, sendAccountApprovedSms } = await import('./services/smsService.js');
const { accountStatusLabel, inactiveAccountMessage, maskEmail, maskMobile, signedUpWithGoogle } = await import('./services/accountNotifications.js');

const app = createApiApp();
const hr = { _id: 'hr-1', email: 'hr@dilg.gov.ph', accessLevel: 'hr_admin', accountStatus: 'Active' };
const pendingEmployee = {
  _id: 'emp-1',
  name: 'Juan Dela Cruz',
  email: 'juan@gmail.com',
  employeeId: 'DILG-2026-1',
  accessLevel: 'employee',
  accountStatus: 'Pending',
  signUpMethod: 'form',
  phoneNumber: '0917 123 4567'
};
// Google sign-ups have no mobile number; older ones got the placeholder default number.
const pendingGoogleEmployee = {
  _id: 'emp-2',
  name: 'Ana Reyes',
  email: 'ana.reyes@gmail.com',
  employeeId: 'DILG-2026-2',
  accessLevel: 'employee',
  accountStatus: 'Pending',
  signUpMethod: 'google',
  googleId: 'google-sub-2',
  phoneNumber: ''
};

// Turns on the SMS provider or the mail server for one test, without sending anything.
const withSms = t => {
  process.env.UNISMS_API_KEY = 'test-key';
  t.after(() => { process.env.UNISMS_API_KEY = ''; });
};
const withEmail = t => {
  const settings = { SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587', SMTP_USER: 'workmate@example.com', SMTP_PASS: 'test', EMAIL_FROM: 'DILG WorkMate <workmate@example.com>' };
  Object.assign(process.env, settings);
  t.after(() => { for (const key of Object.keys(settings)) process.env[key] = ''; });
  const sent = [];
  t.mock.method(nodemailer, 'createTransport', () => ({ sendMail: async message => { sent.push(message); return { messageId: 'test' }; } }));
  return sent;
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

test('Google sign-ups are told about approval by email, sign-up form accounts by SMS', () => {
  assert.equal(signedUpWithGoogle(pendingEmployee), false);
  assert.equal(signedUpWithGoogle(pendingGoogleEmployee), true);
  // Accounts from before the sign-up method was recorded.
  assert.equal(signedUpWithGoogle({ googleId: 'google-sub-3', phoneNumber: '0939 374 9823' }), true);
  assert.equal(signedUpWithGoogle({ phoneNumber: '09171234567' }), false);
});

test('the status shown before logging in is Pending, Approved, or Rejected', () => {
  assert.equal(accountStatusLabel({ accountStatus: 'Pending' }), 'Pending');
  assert.equal(accountStatusLabel({ accountStatus: 'Active' }), 'Approved');
  assert.equal(accountStatusLabel({}), 'Approved');
  assert.equal(accountStatusLabel({ accountStatus: 'Rejected' }), 'Rejected');
  assert.equal(accountStatusLabel({ accountStatus: 'Inactive' }), 'Inactive');
});

test('a pending account is told where its approval notice will go', t => {
  assert.equal(maskMobile('+639171234567'), '0917*****67');
  assert.equal(maskEmail('ana.reyes@gmail.com'), 'an***@gmail.com');
  // Nothing is promised while the SMS provider and mail server are not set up.
  assert.match(inactiveAccountMessage(pendingEmployee), /HR will let you know/);
  assert.match(inactiveAccountMessage(pendingGoogleEmployee), /HR will let you know/);

  withSms(t);
  withEmail(t);
  assert.equal(
    inactiveAccountMessage(pendingEmployee),
    'Your account is still waiting for HR approval. You will get an SMS at 0917*****67 once it is approved.'
  );
  assert.equal(
    inactiveAccountMessage(pendingGoogleEmployee),
    'Your account is still waiting for HR approval. You will get an email at an***@gmail.com once it is approved.'
  );
  assert.match(inactiveAccountMessage({ ...pendingEmployee, phoneNumber: '' }), /HR will let you know/);
});

test('rejected and deactivated accounts are told to contact HR', () => {
  assert.equal(inactiveAccountMessage({ accountStatus: 'Rejected' }), 'Your account registration was rejected. Please contact the HR Administrator.');
  assert.equal(inactiveAccountMessage({ accountStatus: 'Inactive' }), 'This account is inactive. Please contact the HR Administrator.');
});

test('logging in to a pending or rejected account shows its status', async t => {
  withSms(t);
  t.mock.method(User, 'verifyPassword', async () => true);
  const findByEmail = t.mock.method(User, 'findByEmail', async () => pendingEmployee);
  const pending = await request(app).post('/api/login').send({ email: 'juan@gmail.com', password: 'a-long-password-42', role: 'employee' });
  assert.equal(pending.status, 403);
  assert.match(pending.body.error, /still waiting for HR approval\. You will get an SMS at 0917\*\*\*\*\*67/);

  findByEmail.mock.mockImplementation(async () => ({ ...pendingEmployee, accountStatus: 'Rejected' }));
  const rejected = await request(app).post('/api/login').send({ email: 'juan@gmail.com', password: 'a-long-password-42', role: 'employee' });
  assert.equal(rejected.status, 403);
  assert.match(rejected.body.error, /rejected\. Please contact the HR Administrator/);
});

// Checks an account's status from the login page, with the database replaced.
const checkStatus = (t, account, { passwordMatches = true } = {}) => {
  t.mock.method(User, 'findByEmail', async () => account);
  t.mock.method(User, 'verifyPassword', async () => passwordMatches);
  return request(app).post('/api/account-status').send({ email: 'juan@gmail.com', password: 'a-long-password-42' });
};

test('the account status check shows Pending, Approved, and Rejected without logging in', async t => {
  const pending = await checkStatus(t, pendingEmployee);
  assert.equal(pending.status, 200);
  assert.equal(pending.body.status, 'Pending');
  assert.match(pending.body.message, /waiting for HR approval/);
  assert.equal(pending.body.token, undefined);

  t.mock.restoreAll();
  const approved = await checkStatus(t, { ...pendingEmployee, accountStatus: 'Active' });
  assert.equal(approved.body.status, 'Approved');
  assert.match(approved.body.message, /You can now log in/);
  assert.equal(approved.body.token, undefined);

  t.mock.restoreAll();
  const rejected = await checkStatus(t, { ...pendingEmployee, accountStatus: 'Rejected' });
  assert.equal(rejected.body.status, 'Rejected');
  assert.match(rejected.body.message, /contact the HR Administrator/);
});

test('the account status check needs the right password, like logging in', async t => {
  const wrongPassword = await checkStatus(t, pendingEmployee, { passwordMatches: false });
  t.mock.restoreAll();
  const unknownEmail = await checkStatus(t, null, { passwordMatches: false });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  // The same answer either way, so nobody can find out which emails have accounts.
  assert.equal(wrongPassword.body.error, unknownEmail.body.error);
  assert.equal(wrongPassword.body.status, undefined);
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

test('approving a sign-up form account sends the approval SMS and reports it to HR', async t => {
  const { response, notify } = await changeStatus(t, pendingEmployee, 'Active');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.approvalNotice, { channel: 'sms', result: 'not-configured' });
  assert.equal(notify.mock.calls[0].arguments[0].title, 'Account Approved');
});

test('approving a Google sign-up emails the address Google verified', async t => {
  const sent = withEmail(t);
  const { response } = await changeStatus(t, pendingGoogleEmployee, 'Active');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.approvalNotice, { channel: 'email', result: 'sent' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'ana.reyes@gmail.com');
  assert.match(sent[0].subject, /approved/);
  assert.match(sent[0].text, /approved by the HR Administrator\. You can now log in/);
});

test('an older Google sign-up with the placeholder phone number is emailed, not texted', async t => {
  withSms(t);
  const sent = withEmail(t);
  const legacy = { ...pendingGoogleEmployee, signUpMethod: undefined, phoneNumber: '0939 374 9823' };
  const { response } = await changeStatus(t, legacy, 'Active');
  assert.deepEqual(response.body.approvalNotice, { channel: 'email', result: 'sent' });
  assert.equal(sent.length, 1);
});

test('approving a Google sign-up without a mail server reports that email is not set up', async t => {
  const { response } = await changeStatus(t, pendingGoogleEmployee, 'Active');
  assert.deepEqual(response.body.approvalNotice, { channel: 'email', result: 'not-configured' });
});

test('saving an already active account does not message the employee again', async t => {
  const { response, notify } = await changeStatus(t, { ...pendingEmployee, accountStatus: 'Active' }, 'Active');
  assert.equal(response.status, 200);
  assert.equal(response.body.approvalNotice, undefined);
  assert.equal(notify.mock.callCount(), 0);
});

test('rejecting an account marks it Rejected and sends no approval message', async t => {
  const { response, notify } = await changeStatus(t, pendingEmployee, 'Rejected');
  assert.equal(response.status, 200);
  assert.equal(response.body.user.accountStatus, 'Rejected');
  assert.equal(response.body.approvalNotice, undefined);
  assert.equal(notify.mock.callCount(), 0);
});

test('approving a rejected account later still tells the employee', async t => {
  const { response } = await changeStatus(t, { ...pendingEmployee, accountStatus: 'Rejected' }, 'Active');
  assert.deepEqual(response.body.approvalNotice, { channel: 'sms', result: 'not-configured' });
});

test('approving an account by saving it as Active from the edit form also tells the employee', async t => {
  t.mock.method(User, 'findByEmail', async () => hr);
  t.mock.method(User, 'findAccount', async () => pendingGoogleEmployee);
  t.mock.method(User, 'updateEmployee', async (_id, data) => ({ ...pendingGoogleEmployee, ...data }));
  t.mock.method(Announcement, 'createNotification', async data => data);
  const response = await request(app)
    .patch('/api/employees/DILG-2026-2')
    .set('Authorization', `Bearer ${createAuthToken(hr)}`)
    .send({
      name: 'Ana Reyes',
      email: 'ana.reyes@gmail.com',
      employeeId: 'DILG-2026-2',
      role: 'Administrative Assistant III',
      office: 'Boac Municipal Operations Office',
      employmentStatus: 'ACTIVE',
      accountStatus: 'Active'
    });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.approvalNotice, { channel: 'email', result: 'not-configured' });
});

// Runs the Google sign-in callback with Google's answers replaced: the account it finds
// (or null for a new one) and the verified profile Google returns.
const googleCallback = async (t, existing, profile) => {
  const start = await request(app).get('/api/auth/google/url');
  const state = new URL(start.headers.location).searchParams.get('state');
  t.mock.method(globalThis, 'fetch', async url => ({
    json: async () => (String(url).includes('/token') ? { access_token: 'google-access-token' } : profile)
  }));
  t.mock.method(User, 'findByEmail', async () => existing);
  const create = t.mock.method(User, 'createSelfServiceEmployee', async data => ({ ...data, _id: 'new-google', employeeId: 'DILG-2026-777777', accessLevel: 'employee' }));
  const notify = t.mock.method(Announcement, 'createNotification', async data => data);
  const response = await request(app).get('/api/auth/google/callback').query({ code: 'google-code', state });
  return { response, create, notify };
};

test('signing up with Google uses the Google email, waits for HR, and never takes a phone number', async t => {
  withEmail(t);
  const { response, create, notify } = await googleCallback(t, null, {
    sub: 'google-sub-9', email: 'Pedro.Santos@gmail.com', email_verified: true, name: 'Pedro Santos'
  });
  const saved = create.mock.calls[0].arguments[0];
  assert.equal(saved.email, 'pedro.santos@gmail.com');
  assert.equal(saved.signUpMethod, 'google');
  assert.equal(saved.phoneNumber, '');
  assert.equal(saved.accountStatus, 'Pending');
  assert.equal(notify.mock.calls[0].arguments[0].title, 'New Account Awaiting Approval');
  assert.match(response.text, /waiting for HR approval/);
  assert.match(response.text, /You will get an email at pe\*\*\*@gmail\.com once it is approved/);
  assert.doesNotMatch(response.text, /google-login-success/);
});

test('signing in with Google to a rejected account says it was rejected', async t => {
  const { response, create } = await googleCallback(t, { ...pendingGoogleEmployee, accountStatus: 'Rejected' }, {
    sub: 'google-sub-2', email: 'ana.reyes@gmail.com', email_verified: true, name: 'Ana Reyes'
  });
  assert.equal(create.mock.callCount(), 0);
  assert.match(response.text, /registration was rejected\. Please contact the HR Administrator/);
});
