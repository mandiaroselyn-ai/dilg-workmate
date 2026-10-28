import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'downloads-test-secret';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { Download } = await import('./models/downloadModel.js');
const { createAuthToken } = await import('./utils/authToken.js');

const app = createApiApp();
const employee = { _id: '64b000000000000000000051', email: 'juan@dilg.gov.ph', employeeId: 'EMP-5', name: 'Juan Dela Cruz', accessLevel: 'employee', accountStatus: 'Active' };
const pdf = Buffer.from('%PDF-1.7 sample DTR');

test('the Android app hands a file to the server and the phone downloads it from its link, without signing in', async t => {
  t.mock.method(User, 'findByEmail', async () => employee);
  const kept = [];
  const creates = t.mock.method(Download, 'create', async file => {
    kept.push(file);
    return 'link-token';
  });
  t.mock.method(Download, 'find', async token => (token === 'link-token' ? { ...kept[0] } : null));

  const created = await request(app)
    .post('/api/downloads')
    .set('Authorization', `Bearer ${createAuthToken(employee)}`)
    .send({ fileName: 'DTR_JUAN_2026-10.pdf', mimeType: 'application/pdf', data: pdf.toString('base64') });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.url, '/api/downloads?token=link-token');
  const [file] = creates.mock.calls[0].arguments;
  assert.equal(file.fileName, 'DTR_JUAN_2026-10.pdf');
  assert.equal(file.owner, 'EMP-5');
  assert.deepEqual(file.data, pdf);

  // The phone's download manager sends no sign-in.
  const fetched = await request(app).get('/api/downloads?token=link-token').buffer(true).parse((response, done) => {
    const parts = [];
    response.on('data', part => parts.push(part));
    response.on('end', () => done(null, Buffer.concat(parts)));
  });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.headers['content-type'], 'application/pdf');
  assert.match(fetched.headers['content-disposition'], /^attachment; filename="DTR_JUAN_2026-10\.pdf"/);
  assert.equal(fetched.headers['cache-control'], 'no-store');
  assert.deepEqual(fetched.body, pdf);

  const expired = await request(app).get('/api/downloads?token=old-token');
  assert.equal(expired.status, 404);
  assert.match(expired.text, /expired/);
});

test('only a signed-in person can hand over a file, of at most 3 MB, never served as a page', async t => {
  t.mock.method(User, 'findByEmail', async () => employee);
  const creates = t.mock.method(Download, 'create', async () => 'link-token');
  const send = body => request(app).post('/api/downloads').set('Authorization', `Bearer ${createAuthToken(employee)}`).send(body);

  assert.equal((await request(app).post('/api/downloads').send({ fileName: 'a.pdf', data: pdf.toString('base64') })).status, 401);
  assert.equal((await send({ fileName: 'a.pdf', data: 'not base64!' })).status, 400);
  const large = await send({ fileName: 'big.pdf', mimeType: 'application/pdf', data: Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64') });
  assert.equal(large.status, 413);
  assert.equal(creates.mock.callCount(), 0);

  assert.equal((await send({ fileName: 'page.html', mimeType: 'text/html', data: pdf.toString('base64') })).status, 201);
  assert.equal(creates.mock.calls[0].arguments[0].mimeType, 'application/octet-stream');
  assert.equal((await send({ fileName: '../../x:y.pdf', mimeType: 'application/pdf', data: pdf.toString('base64') })).status, 201);
  assert.equal(creates.mock.calls[1].arguments[0].fileName, '.._.._x_y.pdf');
});
