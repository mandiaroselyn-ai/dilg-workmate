import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import nodemailer from 'nodemailer';

// A mail server that refuses connections, like a placeholder host that does not exist.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'password-reset-email-test-secret';
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '1';
process.env.SMTP_SECURE = 'false';
process.env.SMTP_USER = 'reset@example.com';
process.env.SMTP_PASS = 'not-a-real-password';
process.env.EMAIL_FROM = 'DILG WorkMate <reset@example.com>';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { Announcement } = await import('./models/announcementModel.js');

const app = createApiApp();

test('a broken email service is reported instead of claiming the link was sent', async t => {
  const lookup = t.mock.method(User, 'findByEmail', async () => ({ email: 'juan.delacruz@gmail.com' }));
  const response = await request(app).post('/api/password-reset-request').send({ email: 'juan.delacruz@gmail.com' });
  assert.equal(response.status, 503);
  assert.match(response.body.error, /email service is not set up correctly/);
  // The email is not looked up, so the answer is the same whether or not the account exists.
  assert.equal(lookup.mock.callCount(), 0);
});

test('DILG email accounts are told to contact HR, whether or not the account exists', async t => {
  const lookup = t.mock.method(User, 'findByEmail', async () => null);
  for (const email of ['juan@dilg.gov.ph', 'Ana@Region4b.DILG.gov.ph']) {
    const response = await request(app).post('/api/password-reset-request').send({ email });
    assert.equal(response.status, 200, email);
    assert.equal(response.body.contactHr, true, email);
    assert.match(response.body.message, /contact your HR Administrator/);
    assert.match(response.body.message, /Request password reset from HR/);
  }
  assert.equal(lookup.mock.callCount(), 0);
});

test('Gmail accounts still go on to the email reset', async t => {
  t.mock.method(User, 'findByEmail', async () => null);
  const response = await request(app).post('/api/password-reset-request').send({ email: 'juan.delacruz@gmail.com' });
  // The test mail server refuses connections, so this reaches the email service check.
  assert.equal(response.status, 503);
  assert.equal(response.body.contactHr, undefined);
});

// A working mail server for one test; it keeps the emails instead of sending them.
const withWorkingMailServer = t => {
  const sent = [];
  t.mock.method(nodemailer, 'createTransport', () => ({
    verify: async () => true,
    sendMail: async message => { sent.push(message); return { messageId: `test-${sent.length}` }; }
  }));
  return sent;
};

const formAccount = { email: 'juan.delacruz@gmail.com', password: '$2b$12$abcdefghijklmnopqrstuuJ8m3n5o7p9q1r3s5t7u9v1w3x5y7z9AB', signUpMethod: 'form' };
const googleOnlyAccount = { email: 'ana.reyes@gmail.com', password: '', googleId: 'google-sub-2', signUpMethod: 'google' };

test('a sign-up form account is emailed a reset link that expires in an hour', async t => {
  const sent = withWorkingMailServer(t);
  t.mock.method(User, 'findByEmail', async () => formAccount);
  const store = t.mock.method(User, 'setPasswordResetToken', async () => formAccount);

  const response = await request(app).post('/api/password-reset-request').send({ email: formAccount.email });

  assert.equal(response.status, 200);
  const [email, token, expiry] = store.mock.calls[0].arguments;
  assert.equal(email, formAccount.email);
  assert.match(token, /^[0-9a-f]{64}$/);
  const minutesLeft = (expiry.getTime() - Date.now()) / 60000;
  assert.ok(minutesLeft > 59 && minutesLeft <= 60, `expires in ${minutesLeft} minutes`);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, formAccount.email);
  assert.ok(sent[0].text.includes(`resetToken=${token}`));
  assert.match(sent[0].text, /works once and expires in 1 hour/);
  // The email never contains the account's password, old or new.
  assert.ok(!sent[0].text.includes(formAccount.password));
});

test('a Google-only account is sent to Google Account Recovery and gets no reset link', async t => {
  const sent = withWorkingMailServer(t);
  t.mock.method(User, 'findByEmail', async () => googleOnlyAccount);
  const store = t.mock.method(User, 'setPasswordResetToken', async () => googleOnlyAccount);

  const response = await request(app).post('/api/password-reset-request').send({ email: googleOnlyAccount.email });

  assert.equal(response.status, 200);
  assert.equal(store.mock.callCount(), 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, googleOnlyAccount.email);
  assert.match(sent[0].text, /This account uses Google Sign-In\. Your password is managed by Google\./);
  assert.ok(sent[0].text.includes('https://accounts.google.com/signin/recovery'));
  assert.match(sent[0].text, /Continue with Google/);
  assert.doesNotMatch(sent[0].text, /resetToken/);
});

test('the reset request answers the same for unknown, password, and Google-only emails', async t => {
  withWorkingMailServer(t);
  t.mock.method(User, 'setPasswordResetToken', async () => ({}));
  const findByEmail = t.mock.method(User, 'findByEmail', async () => null);
  const bodies = [];
  for (const account of [null, formAccount, googleOnlyAccount]) {
    findByEmail.mock.mockImplementation(async () => account);
    const response = await request(app).post('/api/password-reset-request').send({ email: 'someone@gmail.com' });
    assert.equal(response.status, 200);
    bodies.push(response.body);
  }
  assert.deepEqual(bodies[1], bodies[0]);
  assert.deepEqual(bodies[2], bodies[0]);
  assert.match(bodies[0].message, /Google Account Recovery/);
});

test('a used, expired, or Google-only reset token is refused', async t => {
  const reset = t.mock.method(User, 'resetPasswordByToken', async () => null);
  const response = await request(app).post('/api/password-reset').send({ token: 'a'.repeat(64), password: 'a-new-long-password' });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /expired or is invalid/);
  assert.equal(reset.mock.callCount(), 1);
});

test('a valid reset token sets the new password so the employee can log in with it', async t => {
  const reset = t.mock.method(User, 'resetPasswordByToken', async () => ({ email: formAccount.email }));
  const response = await request(app).post('/api/password-reset').send({ token: 'b'.repeat(64), password: 'a-new-long-password' });
  assert.equal(response.status, 200);
  assert.deepEqual(reset.mock.calls[0].arguments, ['b'.repeat(64), 'a-new-long-password']);
  assert.match(response.body.message, /log in with your new password/);

  const tooShort = await request(app).post('/api/password-reset').send({ token: 'b'.repeat(64), password: 'short' });
  assert.equal(tooShort.status, 400);
  assert.equal(reset.mock.callCount(), 1);
});

test('asking HR for a reset notifies HR to confirm the person before resetting', async t => {
  t.mock.method(User, 'findByEmail', async () => ({ name: 'Maria Santos', email: 'maria.santos@dilg.gov.ph', employeeId: 'DILG-2026-100200' }));
  const notify = t.mock.method(Announcement, 'createNotification', async data => data);

  const response = await request(app).post('/api/password-reset-hr-request').send({ email: 'Maria.Santos@dilg.gov.ph' });

  assert.equal(response.status, 200);
  assert.match(response.body.message, /sent to the HR Administrator/);
  const notice = notify.mock.calls[0].arguments[0];
  assert.equal(notice.title, 'Password Reset Requested');
  assert.equal(notice.recipientRole, 'hr_admin');
  assert.match(notice.message, /Maria Santos \(maria\.santos@dilg\.gov\.ph, DILG-2026-100200\)/);
  assert.match(notice.message, /confirm it is really them/);
});

test('asking HR for a reset answers the same for an unknown email and does not notify HR', async t => {
  const findByEmail = t.mock.method(User, 'findByEmail', async () => null);
  const notify = t.mock.method(Announcement, 'createNotification', async data => data);
  const unknown = await request(app).post('/api/password-reset-hr-request').send({ email: 'nobody@gmail.com' });
  findByEmail.mock.mockImplementation(async () => ({ name: 'Juan', email: 'juan@gmail.com' }));
  const known = await request(app).post('/api/password-reset-hr-request').send({ email: 'juan@gmail.com' });

  assert.equal(unknown.status, 200);
  assert.deepEqual(unknown.body, known.body);
  assert.equal(notify.mock.callCount(), 1);
});

test('asking HR for a reset needs a valid email and is limited per email', async t => {
  t.mock.method(User, 'findByEmail', async () => null);
  const invalid = await request(app).post('/api/password-reset-hr-request').send({ email: 'not-an-email' });
  assert.equal(invalid.status, 400);

  const statuses = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    statuses.push((await request(app).post('/api/password-reset-hr-request').send({ email: 'limit.check@gmail.com' })).status);
  }
  assert.deepEqual(statuses, [200, 200, 200, 429]);
});
