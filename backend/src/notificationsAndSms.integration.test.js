import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'notifications-sms-test-secret';
// The SMS provider is turned on only inside the tests that need it, and the network is
// replaced in each of them, so no real text message is ever sent.
process.env.UNISMS_API_KEY = '';
// Empty, not deleted, so a developer's backend/.env cannot switch the tests to httpSMS.
process.env.HTTPSMS_API_KEY = '';
process.env.HTTPSMS_FROM = '';
globalThis.fetch = async url => {
  throw new Error(`Tests must not call the network (${url}).`);
};

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { Announcement, notificationActionFields } = await import('./models/announcementModel.js');
const { createAuthToken } = await import('./utils/authToken.js');
const { PushSubscription } = await import('./models/pushSubscriptionModel.js');
const { sendSms, SmsError } = await import('./services/smsService.js');

const app = createApiApp();
const hr = { _id: 'hr-1', email: 'hr@dilg.gov.ph', accessLevel: 'hr_admin', accountStatus: 'Active' };
const supervisor = { _id: 'sup-1', email: 'sup@dilg.gov.ph', accessLevel: 'supervisor', accountStatus: 'Active' };
const employee = { _id: 'emp-1', email: 'juan@gmail.com', employeeId: 'DILG-2026-1', accessLevel: 'employee', accountStatus: 'Active' };

const withSms = t => {
  process.env.UNISMS_API_KEY = 'test-key';
  t.after(() => { process.env.UNISMS_API_KEY = ''; });
};

test('a notification keeps only a known action, and only with a target', () => {
  assert.deepEqual(notificationActionFields({ action: 'review_request', targetId: ' LV-2026-0142 ' }), { action: 'review_request', targetId: 'LV-2026-0142' });
  assert.deepEqual(notificationActionFields({ action: 'delete_everything', targetId: 'x' }), { action: '', targetId: '' });
  assert.deepEqual(notificationActionFields({ action: 'review_account' }), { action: '', targetId: '' });
  assert.deepEqual(notificationActionFields({ action: 'reset_password', targetId: { $ne: '' } }), { action: '', targetId: '' });
  assert.deepEqual(notificationActionFields({}), { action: '', targetId: '' });
});

test('a text the SMS service rejects is recorded as Failed with the reason', async t => {
  withSms(t);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, json: async () => ({ message: 'Invalid recipient number.' }) }));
  const record = t.mock.method(Announcement, 'createSmsAlert', async data => data);

  await assert.rejects(
    sendSms({ recipient: '09171234567', message: 'Time In recorded.', employeeId: 'DILG-2026-1', kind: 'attendance' }),
    error => error instanceof SmsError && error.statusCode === 502
  );
  const saved = record.mock.calls[0].arguments[0];
  assert.equal(saved.status, 'Failed');
  assert.equal(saved.kind, 'attendance');
  assert.equal(saved.error, 'Invalid recipient number.');
  assert.equal(saved.recipient, '+639171234567');
  assert.equal(saved.employeeId, 'DILG-2026-1');
});

test('field errors from the SMS service are recorded as the reason', async t => {
  withSms(t);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 422, json: async () => ({ errors: { sender_id: ['is inactive'] } }) }));
  const record = t.mock.method(Announcement, 'createSmsAlert', async data => data);

  await assert.rejects(sendSms({ recipient: '09171234567', message: 'Time In recorded.', kind: 'attendance' }), SmsError);
  assert.equal(record.mock.calls[0].arguments[0].error, 'sender_id is inactive');
});

test('with HTTPSMS_API_KEY set, texts go out through httpSMS from the configured phone', async t => {
  process.env.HTTPSMS_API_KEY = 'httpsms-test-key';
  process.env.HTTPSMS_FROM = '0998 123 4567';
  t.after(() => {
    process.env.HTTPSMS_API_KEY = '';
    process.env.HTTPSMS_FROM = '';
  });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ data: { id: 'httpsms-1', status: 'pending' }, status: 'success' }) };
  });
  t.mock.method(Announcement, 'createSmsAlert', async data => data);

  const sms = await sendSms({ recipient: '09171234567', message: 'Time In recorded.', kind: 'attendance' });
  assert.equal(calls[0].url, 'https://api.httpsms.com/v1/messages/send');
  assert.equal(calls[0].init.headers['x-api-key'], 'httpsms-test-key');
  assert.deepEqual(JSON.parse(calls[0].init.body), { from: '+639981234567', to: '+639171234567', content: 'Time In recorded.' });
  assert.equal(sms.status, 'Sent');
  assert.equal(sms.providerMessageId, 'httpsms-1');
});

test('httpSMS without the phone number is reported instead of sent', async t => {
  process.env.HTTPSMS_API_KEY = 'httpsms-test-key';
  t.after(() => { process.env.HTTPSMS_API_KEY = ''; });
  await assert.rejects(
    sendSms({ recipient: '09171234567', message: 'Time In recorded.', kind: 'attendance' }),
    error => error instanceof SmsError && error.statusCode === 503 && /HTTPSMS_FROM/.test(error.message)
  );
});

test('a text that cannot reach the SMS service is recorded as Failed too', async t => {
  withSms(t);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('getaddrinfo ENOTFOUND'); });
  const record = t.mock.method(Announcement, 'createSmsAlert', async data => data);

  await assert.rejects(sendSms({ recipient: '09171234567', message: 'Hello', kind: 'manual' }), SmsError);
  assert.equal(record.mock.calls[0].arguments[0].status, 'Failed');
  assert.match(record.mock.calls[0].arguments[0].error, /could not be reached/);
});

test('a sent text is recorded with what it was about', async t => {
  withSms(t);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ id: 'uni-1' }) }));
  const record = t.mock.method(Announcement, 'createSmsAlert', async data => data);

  const sms = await sendSms({ recipient: '09171234567', message: 'Your account has been approved.', kind: 'account' });
  assert.equal(sms.status, 'Sent');
  assert.equal(sms.kind, 'account');
  assert.equal(sms.providerMessageId, 'uni-1');
  assert.equal(record.mock.callCount(), 1);
});

test('a resent text updates its log entry instead of adding a new one', async t => {
  withSms(t);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ id: 'uni-2' }) }));
  const created = t.mock.method(Announcement, 'createSmsAlert', async data => data);
  const updated = t.mock.method(Announcement, 'updateSmsAlert', async (id, data) => ({ id, ...data }));

  const sms = await sendSms({ recipient: '09171234567', message: 'Your account has been approved.', kind: 'account', resendOf: 'sms-1' });
  assert.equal(created.mock.callCount(), 0);
  assert.equal(updated.mock.calls[0].arguments[0], 'sms-1');
  assert.equal(sms.id, 'sms-1');
  assert.equal(sms.status, 'Sent');
  assert.equal(sms.error, '');
});

test('only HR/Admins load the whole SMS log, and loading it often is not rate limited', async t => {
  t.mock.method(Announcement, 'findSmsAlerts', async () => [{ id: 'sms-1', recipient: '+639171234567', status: 'Sent' }]);
  const as = account => {
    t.mock.method(User, 'findByEmail', async () => account);
    return request(app).get('/api/sms').set('Authorization', `Bearer ${createAuthToken(account)}`);
  };

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await as(hr);
    assert.equal(response.status, 200, `load ${attempt + 1}`);
    assert.equal(response.body[0].id, 'sms-1');
    t.mock.restoreAll();
    t.mock.method(Announcement, 'findSmsAlerts', async () => [{ id: 'sms-1', recipient: '+639171234567', status: 'Sent' }]);
  }
  await as(hr);
  assert.equal(Announcement.findSmsAlerts.mock.calls[0].arguments[0], undefined);
  assert.equal((await as(supervisor)).status, 403);
  t.mock.restoreAll();
  // An employee gets only their own texts.
  const own = t.mock.method(Announcement, 'findSmsAlerts', async () => []);
  assert.equal((await as(employee)).status, 200);
  assert.equal(own.mock.calls[0].arguments[0].email, employee.email);
});

test('HR texts one person, and the text says it is from HR', async t => {
  withSms(t);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ id: 'uni-3' }) }));
  const record = t.mock.method(Announcement, 'createSmsAlert', async data => ({ id: 'sms-9', ...data }));
  const listed = t.mock.method(Announcement, 'createNotification', async data => data);
  // The phone notification is looked up by the employee's push subscription.
  const notify = t.mock.method(PushSubscription, 'find', () => ({ lean: async () => [] }));
  t.mock.method(User, 'findByEmail', async () => hr);
  const send = body => request(app).post('/api/sms').set('Authorization', `Bearer ${createAuthToken(hr)}`).send(body);

  const response = await send({ recipient: '0917 123 4567', message: '  Please call HR today.  ', employeeId: 'DILG-2026-1', employeeEmail: 'juan@gmail.com' });
  assert.equal(response.status, 201);
  const saved = record.mock.calls[0].arguments[0];
  assert.equal(saved.message, 'DILG WorkMate HR: Please call HR today.');
  assert.equal(saved.recipient, '+639171234567');
  assert.equal(saved.kind, 'manual');
  assert.equal(saved.employeeId, 'DILG-2026-1');
  // The employee gets a phone notification, but nothing is added to their Notifications list.
  assert.deepEqual(notify.mock.calls[0].arguments[0], { employeeEmail: 'juan@gmail.com' });
  assert.equal(listed.mock.callCount(), 0);

  assert.match((await send({ recipient: '12345', message: 'Hi' })).body.error, /valid mobile number/);
  assert.match((await send({ recipient: '09171234567', message: '   ' })).body.error, /Type the message/);
  assert.match((await send({ recipient: '09171234567', message: { $gt: '' } })).body.error, /Type the message/);
  assert.equal(record.mock.callCount(), 1);
  assert.equal(notify.mock.callCount(), 1);
});

test('the employee gets a phone notification even when HR\'s text does not reach their phone', async t => {
  withSms(t);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 422, json: async () => ({ message: 'Phone offline' }) }));
  t.mock.method(Announcement, 'createSmsAlert', async data => data);
  const notify = t.mock.method(PushSubscription, 'find', () => ({ lean: async () => [] }));
  t.mock.method(User, 'findByEmail', async () => hr);
  const send = body => request(app).post('/api/sms').set('Authorization', `Bearer ${createAuthToken(hr)}`).send(body);

  const response = await send({ recipient: '09171234567', message: 'Please call HR.', employeeId: 'DILG-2026-1' });
  assert.equal(response.status, 502);
  assert.deepEqual(notify.mock.calls[0].arguments[0], { employeeId: 'DILG-2026-1' });

  // A number that is not on an account has no one to tell.
  await send({ recipient: '09171234567', message: 'Hello' });
  assert.equal(notify.mock.callCount(), 1);
});

test('an employee can message HR in the app, and HR is told', async t => {
  const juan = { ...employee, name: 'Juan Dela Cruz', phoneNumber: '0917 123 4567' };
  const saved = t.mock.method(Announcement, 'createIncomingSms', async data => ({ id: 'sms-in-1', ...data }));
  const notify = t.mock.method(Announcement, 'createNotification', async data => data);
  const as = account => {
    t.mock.method(User, 'findByEmail', async () => account);
    return body => request(app).post('/api/sms/reply').set('Authorization', `Bearer ${createAuthToken(account)}`).send(body);
  };

  const response = await as(juan)({ message: '  Noted po, salamat.  ' });
  assert.equal(response.status, 201);
  const sms = saved.mock.calls[0].arguments[0];
  assert.equal(sms.message, 'Noted po, salamat.');
  assert.equal(sms.channel, 'app');
  assert.equal(sms.sender, '+639171234567');
  assert.equal(sms.employeeId, employee.employeeId);
  assert.equal(notify.mock.calls[0].arguments[0].recipientRole, 'hr_admin');
  assert.equal(notify.mock.calls[0].arguments[0].message, 'Juan Dela Cruz replied in WorkMate: Noted po, salamat.');

  assert.match((await as(juan)({ message: '   ' })).body.error, /Type your message/);
  assert.match((await as(juan)({ message: { $gt: '' } })).body.error, /Type your message/);
  t.mock.restoreAll();
  t.mock.method(Announcement, 'createIncomingSms', async data => data);
  assert.equal((await as(hr)({ message: 'Hi' })).status, 403);
  assert.equal((await as(supervisor)({ message: 'Hi' })).status, 403);
});

// A webhook call the way httpSMS makes it: a JWT signed with the signing key, and the event.
const HTTPSMS_KEY = 'httpsms-signing-key';
const httpSmsToken = (key = HTTPSMS_KEY, claims = {}) => {
  const part = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ iss: 'api.httpsms.com', exp: Math.floor(Date.now() / 1000) + 600, ...claims })}`;
  return `${unsigned}.${crypto.createHmac('sha256', key).update(unsigned).digest('base64url')}`;
};
const httpSmsReply = (t, { token = httpSmsToken(), contact = '+639171234567', owner = '+639981234567', type = 'message.phone.received' } = {}) => {
  process.env.HTTPSMS_WEBHOOK_SIGNING_KEY = HTTPSMS_KEY;
  process.env.HTTPSMS_FROM = '0998 123 4567';
  t.after(() => {
    process.env.HTTPSMS_WEBHOOK_SIGNING_KEY = '';
    process.env.HTTPSMS_FROM = '';
  });
  return request(app)
    .post('/api/sms/webhook')
    .set('Authorization', `Bearer ${token}`)
    .set('X-Event-Type', type)
    .send({
      specversion: '1.0',
      type,
      data: { message_id: 'msg-1', owner, contact, content: 'Noted po, salamat.', timestamp: '2026-10-13T08:00:00Z', sim: 'SIM2' }
    });
};

test('a reply texted to the httpSMS phone is saved and HR is told', async t => {
  t.mock.method(User, 'findByPhoneNumber', async () => ({ name: 'Juan Dela Cruz', email: 'juan@gmail.com', employeeId: 'DILG-2026-1' }));
  const saved = t.mock.method(Announcement, 'createIncomingSms', async data => data);
  const notify = t.mock.method(Announcement, 'createNotification', async data => data);

  const response = await httpSmsReply(t);
  assert.equal(response.status, 200);
  const sms = saved.mock.calls[0].arguments[0];
  assert.equal(sms.sender, '+639171234567');
  assert.equal(sms.message, 'Noted po, salamat.');
  assert.equal(sms.employeeId, 'DILG-2026-1');
  assert.equal(sms.id, 'sms-in-msg-1');
  assert.equal(notify.mock.calls[0].arguments[0].recipientRole, 'hr_admin');
});

test('httpSMS texts from numbers not on an account, to the other SIM, or other events are not saved', async t => {
  t.mock.method(User, 'findByPhoneNumber', async () => null);
  const saved = t.mock.method(Announcement, 'createIncomingSms', async data => data);
  t.mock.method(Announcement, 'createNotification', async data => data);

  for (const options of [{}, { owner: '+639170000000' }, { type: 'message.phone.sent' }]) {
    const response = await httpSmsReply(t, options);
    assert.equal(response.status, 200);
    assert.equal(response.body.ignored, true);
  }
  assert.equal(saved.mock.callCount(), 0);
});

test('httpSMS webhook calls with a wrong or expired signature are refused', async t => {
  const saved = t.mock.method(Announcement, 'createIncomingSms', async data => data);
  assert.equal((await httpSmsReply(t, { token: httpSmsToken('wrong-key') })).status, 401);
  assert.equal((await httpSmsReply(t, { token: httpSmsToken(HTTPSMS_KEY, { exp: Math.floor(Date.now() / 1000) - 3600 }) })).status, 401);
  assert.equal((await httpSmsReply(t, { token: 'not-a-token' })).status, 401);
  assert.equal(saved.mock.callCount(), 0);
});
