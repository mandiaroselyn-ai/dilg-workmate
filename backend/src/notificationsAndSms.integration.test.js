import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'notifications-sms-test-secret';
// The SMS provider is turned on only inside the tests that need it, and the network is
// replaced in each of them, so no real text message is ever sent.
process.env.UNISMS_API_KEY = '';
globalThis.fetch = async url => {
  throw new Error(`Tests must not call the network (${url}).`);
};

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { Announcement, notificationActionFields } = await import('./models/announcementModel.js');
const { createAuthToken } = await import('./utils/authToken.js');
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

test('only HR/Admins can load the SMS log, and loading it often is not rate limited', async t => {
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
  assert.equal((await as(supervisor)).status, 403);
  t.mock.restoreAll();
  assert.equal((await as(employee)).status, 403);
});
