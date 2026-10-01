import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'documents-test-secret';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { Announcement } = await import('./models/announcementModel.js');
const { EmployeeDocument } = await import('./models/employeeDocumentModel.js');
const { createAuthToken } = await import('./utils/authToken.js');
const { MAX_DOCUMENT_BYTES } = await import('../../shared/documentCatalog.js');

const app = createApiApp();

const juan = { _id: 'emp-1', name: 'Juan Dela Cruz', email: 'juan@dilg.gov.ph', employeeId: 'E1', accessLevel: 'employee', accountStatus: 'Active' };
const maria = { _id: 'emp-2', name: 'Maria Santos', email: 'maria@dilg.gov.ph', employeeId: 'E2', accessLevel: 'employee', accountStatus: 'Active' };
const hr = { _id: 'hr-1', name: 'HR Officer', email: 'hr@dilg.gov.ph', employeeId: 'HR1', accessLevel: 'hr_admin', accountStatus: 'Active' };
const supervisor = { _id: 'sup-1', name: 'Supervisor', email: 'sup@dilg.gov.ph', accessLevel: 'supervisor', accountStatus: 'Active' };
const accounts = [juan, maria, hr, supervisor];

const dataUrl = (type, bytes) => `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
const pdf = { name: 'scan.pdf', dataUrl: dataUrl('application/pdf', '%PDF-1.7 test') };

// Replaces the database with an in-memory list of documents and records notifications.
const useDatabase = (t, documents = []) => {
  const store = documents.map(doc => ({ ...doc }));
  let next = 1;
  const listed = doc => {
    const { fileData, ...rest } = doc;
    return { ...rest, hasFile: Boolean(doc.fileName) };
  };
  t.mock.method(User, 'findByEmail', async email => accounts.find(account => account.email === email) || null);
  t.mock.method(User, 'findByEmployeeId', async id => accounts.find(account => account.employeeId === id) || null);
  t.mock.method(EmployeeDocument, 'findFor', async user => (user.accessLevel === 'hr_admin'
    ? store
    : store.filter(doc => doc.employeeId === user.employeeId)).map(listed));
  t.mock.method(EmployeeDocument, 'findByCustomId', async (id, { withFile = false } = {}) => {
    const doc = store.find(item => item.id === id);
    return doc ? (withFile ? { ...doc } : listed(doc)) : null;
  });
  t.mock.method(EmployeeDocument, 'create', async data => {
    const doc = { ...data, id: `doc-${next++}` };
    store.push(doc);
    return listed(doc);
  });
  t.mock.method(EmployeeDocument, 'update', async (id, changes) => {
    const doc = store.find(item => item.id === id);
    if (!doc) return null;
    Object.assign(doc, changes);
    return listed(doc);
  });
  t.mock.method(EmployeeDocument, 'remove', async id => {
    const index = store.findIndex(item => item.id === id);
    if (index >= 0) store.splice(index, 1);
    return index >= 0;
  });
  const notifications = t.mock.method(Announcement, 'createNotification', async data => data);
  return { store, notifications };
};

const as = account => {
  const token = createAuthToken(account);
  const send = (method, path) => request(app)[method](path).set('Authorization', `Bearer ${token}`);
  return {
    get: path => send('get', path),
    post: (path, body) => send('post', path).send(body),
    patch: (path, body) => send('patch', path).send(body),
    delete: path => send('delete', path)
  };
};

test('HR files a 201 document for an employee, who is notified', async t => {
  const db = useDatabase(t);
  const response = await as(hr).post('/api/documents', {
    employeeId: 'E1', category: '201', docType: 'Oath of Office', documentDate: '2026-01-05', file: pdf
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.document.employeeId, 'E1');
  assert.equal(response.body.document.employeeName, 'Juan Dela Cruz');
  assert.equal(response.body.document.title, 'Oath of Office');
  assert.equal(response.body.document.uploadedByRole, 'hr_admin');
  assert.equal(response.body.document.fileData, undefined, 'the file is not sent back in lists');
  assert.equal(db.notifications.mock.callCount(), 1);
  assert.equal(db.notifications.mock.calls[0].arguments[0].employeeId, 'E1');
});

test('HR cannot file a document for an unknown or non-employee account', async t => {
  useDatabase(t);
  for (const employeeId of ['NOPE', 'HR1', '']) {
    const response = await as(hr).post('/api/documents', { employeeId, category: '201', docType: 'Appointment', file: pdf });
    assert.equal(response.status, 404, employeeId);
  }
});

test('an employee adds only their own training certificates', async t => {
  const db = useDatabase(t);
  const training = await as(juan).post('/api/documents', {
    employeeId: 'E2', category: 'training', docType: 'Webinar', title: 'Data Privacy Webinar', file: pdf
  });
  assert.equal(training.status, 201);
  assert.equal(training.body.document.employeeId, 'E1', 'the owner comes from the session');
  assert.equal(training.body.document.uploadedByRole, 'employee');
  assert.equal(db.notifications.mock.callCount(), 0);

  const record201 = await as(juan).post('/api/documents', { category: '201', docType: 'Appointment', file: pdf });
  assert.equal(record201.status, 400);
});

test('only real PDF, JPEG, and PNG files within the size limit are accepted', async t => {
  const db = useDatabase(t);
  const upload = file => as(juan).post('/api/documents', { category: 'training', docType: 'Webinar', file });
  const rejected = [
    { name: 'page.html', dataUrl: dataUrl('text/html', '<script>alert(1)</script>') },
    { name: 'fake.pdf', dataUrl: dataUrl('application/pdf', '<html><script>alert(1)</script></html>') },
    { name: 'big.pdf', dataUrl: dataUrl('application/pdf', Buffer.concat([Buffer.from('%PDF'), Buffer.alloc(MAX_DOCUMENT_BYTES)])) },
    { name: 'empty.pdf', dataUrl: 'data:application/pdf;base64,' },
    undefined
  ];
  for (const file of rejected) {
    const response = await upload(file);
    assert.equal(response.status, 400, file?.name || 'no file');
  }
  const png = await upload({ name: 'C:\\fakepath\\cert.png', dataUrl: dataUrl('image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])) });
  assert.equal(png.status, 201);
  assert.equal(png.body.document.fileName, 'cert.png');
  assert.equal(db.store.length, 1);
});

test('an employee requests a certificate, HR is told, and HR releases it once', async t => {
  const db = useDatabase(t);
  const missingPurpose = await as(juan).post('/api/documents/requests', { docType: 'Certificate of Employment' });
  assert.equal(missingPurpose.status, 400);
  const unknownType = await as(juan).post('/api/documents/requests', { docType: 'Oath of Office', purpose: 'Loan' });
  assert.equal(unknownType.status, 400);

  const requested = await as(juan).post('/api/documents/requests', { docType: 'Certificate of Employment', purpose: 'Pag-IBIG housing loan' });
  assert.equal(requested.status, 201);
  assert.equal(requested.body.document.status, 'Requested');
  assert.equal(requested.body.document.hasFile, false);
  assert.equal(db.notifications.mock.calls[0].arguments[0].recipientRole, 'hr_admin');
  const id = requested.body.document.id;

  assert.equal((await as(juan).patch(`/api/documents/${id}`, { action: 'release', file: pdf })).status, 403);
  assert.equal((await as(hr).patch(`/api/documents/${id}`, { action: 'release' })).status, 400);

  const released = await as(hr).patch(`/api/documents/${id}`, { action: 'release', file: pdf, notes: 'Signed by the PD.' });
  assert.equal(released.status, 200);
  assert.equal(released.body.document.status, 'Released');
  assert.equal(released.body.document.answeredBy, 'HR Officer');
  assert.equal(db.notifications.mock.calls.at(-1).arguments[0].employeeId, 'E1');

  const again = await as(hr).patch(`/api/documents/${id}`, { action: 'decline', reason: 'Duplicate.' });
  assert.equal(again.status, 409);
});

test('HR declines a certificate request only with a reason', async t => {
  useDatabase(t, [{ id: 'doc-req', employeeId: 'E1', employeeEmail: 'juan@dilg.gov.ph', category: 'certificate', docType: 'Statement of Leave Credits', status: 'Requested' }]);
  assert.equal((await as(hr).patch('/api/documents/doc-req', { action: 'decline' })).status, 400);
  const declined = await as(hr).patch('/api/documents/doc-req', { action: 'decline', reason: 'Request it after the payroll cut-off.' });
  assert.equal(declined.status, 200);
  assert.equal(declined.body.document.status, 'Declined');
});

test('employees open and list only their own documents; supervisors none', async t => {
  useDatabase(t, [
    { id: 'doc-juan', employeeId: 'E1', employeeEmail: 'juan@dilg.gov.ph', category: '201', docType: 'Appointment', status: 'Filed', fileName: 'a.pdf', fileType: 'application/pdf', fileData: pdf.dataUrl, uploadedByRole: 'hr_admin' },
    { id: 'doc-maria', employeeId: 'E2', employeeEmail: 'maria@dilg.gov.ph', category: '201', docType: 'Appointment', status: 'Filed', fileName: 'b.pdf', fileType: 'application/pdf', fileData: pdf.dataUrl, uploadedByRole: 'hr_admin' }
  ]);
  const list = await as(juan).get('/api/documents');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.map(doc => doc.id), ['doc-juan']);
  assert.ok(list.body.every(doc => doc.fileData === undefined));

  const own = await as(juan).get('/api/documents/doc-juan/file');
  assert.equal(own.status, 200);
  assert.equal(own.body.dataUrl, pdf.dataUrl);
  assert.equal((await as(juan).get('/api/documents/doc-maria/file')).status, 404);
  assert.equal((await as(hr).get('/api/documents/doc-maria/file')).status, 200);

  assert.equal((await as(supervisor).get('/api/documents')).status, 403);
  assert.equal((await as(supervisor).get('/api/documents/doc-juan/file')).status, 403);
});

test('employees remove only what they added and requests HR has not answered', async t => {
  const db = useDatabase(t, [
    { id: 'doc-201', employeeId: 'E1', category: '201', docType: 'Appointment', status: 'Filed', uploadedByRole: 'hr_admin' },
    { id: 'doc-training', employeeId: 'E1', category: 'training', docType: 'Webinar', status: 'Filed', uploadedByRole: 'employee' },
    { id: 'doc-request', employeeId: 'E1', category: 'certificate', docType: 'Certificate of Employment', status: 'Requested' },
    { id: 'doc-released', employeeId: 'E1', category: 'certificate', docType: 'Certificate of Employment', status: 'Released', uploadedByRole: 'hr_admin' },
    { id: 'doc-maria', employeeId: 'E2', category: 'training', docType: 'Webinar', status: 'Filed', uploadedByRole: 'employee' }
  ]);
  assert.equal((await as(juan).delete('/api/documents/doc-201')).status, 403);
  assert.equal((await as(juan).delete('/api/documents/doc-released')).status, 403);
  assert.equal((await as(juan).delete('/api/documents/doc-maria')).status, 404);
  assert.equal((await as(juan).delete('/api/documents/doc-training')).status, 200);
  assert.equal((await as(juan).delete('/api/documents/doc-request')).status, 200);
  assert.equal((await as(hr).delete('/api/documents/doc-201')).status, 200);
  assert.deepEqual(db.store.map(doc => doc.id), ['doc-released', 'doc-maria']);
});
