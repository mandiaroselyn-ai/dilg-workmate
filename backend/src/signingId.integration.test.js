import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'signing-id-test-secret';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { createAuthToken } = await import('./utils/authToken.js');

const app = createApiApp();

const hr2 = { _id: 'hr-2', name: 'JOHN ERICK J. MATINING', email: 'erick@dilg.gov.ph', password: 'hash', accessLevel: 'hr_admin', accountStatus: 'Active' };
const head = { _id: 'pd-1', name: 'IVAN STEPHEN F. FADRI', email: 'pd@dilg.gov.ph', password: 'hash', accessLevel: 'supervisor', accountStatus: 'Active' };
// An account made with Google sign-in, with no WorkMate password yet.
const googleHead = { _id: 'pd-2', name: 'OIC', email: 'oic@dilg.gov.ph', password: '', accessLevel: 'supervisor', accountStatus: 'Active' };
const employee = { _id: 'emp-1', name: 'Juan Dela Cruz', email: 'juan@dilg.gov.ph', accessLevel: 'employee', accountStatus: 'Active' };
// A PKCS #12 file starts with a DER SEQUENCE, "M" in base64.
const p12 = { data: 'MIIKAgIBAzCCCbwGCSqGSIb3DQEHAaCCCa0Eggmp', name: 'JOHN ERICK J. MATINING', password: 'right-password' };

// The accounts' kept digital IDs, as the database would hold them.
const withStore = t => {
  const store = new Map();
  t.mock.method(User, 'findByEmail', async email => [hr2, head, googleHead, employee].find(account => account.email === email) || null);
  t.mock.method(User, 'verifyPassword', async (account, password) => Boolean(account.password) && password === 'right-password');
  t.mock.method(User, 'getSigningId', async id => store.get(id) || null);
  t.mock.method(User, 'setSigningId', async (id, value) => {
    if (value) store.set(id, { ...value, createdAt: new Date() });
    else store.delete(id);
    return true;
  });
  return store;
};
const as = account => ({ Authorization: `Bearer ${createAuthToken(account)}` });

test('a signer keeps their digital ID in WorkMate and gets it back on any device', async t => {
  withStore(t);
  assert.equal((await request(app).get('/api/signing-id').set(as(hr2))).body.signingId, null);
  assert.equal((await request(app).put('/api/signing-id').set(as(hr2)).send(p12)).status, 200);
  const saved = (await request(app).get('/api/signing-id').set(as(hr2))).body.signingId;
  assert.equal(saved.data, p12.data);
  assert.equal(saved.name, p12.name);
  // Each signer gets only their own.
  assert.equal((await request(app).get('/api/signing-id').set(as(head))).body.signingId, null);
  // A forgotten signing password: the old one is removed.
  assert.equal((await request(app).delete('/api/signing-id').set(as(hr2))).status, 200);
  assert.equal((await request(app).get('/api/signing-id').set(as(hr2))).body.signingId, null);
});

test('only HR and the Supervisor keep a digital ID, and only a PKCS #12 file is kept', async t => {
  const store = withStore(t);
  assert.equal((await request(app).get('/api/signing-id').set(as(employee))).status, 403);
  assert.equal((await request(app).put('/api/signing-id').set(as(employee)).send(p12)).status, 403);
  assert.equal((await request(app).get('/api/signing-id')).status, 401);
  for (const body of [{ ...p12, data: '' }, { ...p12, data: 'not base64!' }, { ...p12, data: 'QUJD' }, { ...p12, name: ' ' }, { ...p12, data: `M${'A'.repeat(20000)}` }]) {
    assert.equal((await request(app).put('/api/signing-id').set(as(head)).send(body)).status, 400, JSON.stringify(body).slice(0, 60));
  }
  assert.equal(store.size, 0);
});

test('keeping a digital ID checks the WorkMate password it is locked with', async t => {
  const store = withStore(t);
  const wrong = await request(app).put('/api/signing-id').set(as(hr2)).send({ ...p12, password: 'wrong-password' });
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.error, /WorkMate password is incorrect/);
  assert.equal((await request(app).put('/api/signing-id').set(as(hr2)).send({ ...p12, password: '' })).status, 400);
  const google = await request(app).put('/api/signing-id').set(as(googleHead)).send(p12);
  assert.equal(google.status, 400);
  assert.match(google.body.error, /Set a WorkMate password in Settings first/);
  assert.equal(store.size, 0);
  assert.equal((await request(app).put('/api/signing-id').set(as(hr2)).send(p12)).status, 200);
  assert.equal(store.size, 1);
  // The password is not kept with the digital ID.
  assert.equal(JSON.stringify(store.get('hr-2')).includes('right-password'), false);
});

test('the kept digital ID is never listed with the account', () => {
  assert.equal(mongoose.model('User').schema.path('signingId').options.select, false);
});
