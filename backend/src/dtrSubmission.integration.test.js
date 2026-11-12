import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'dtr-submission-test-secret';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { DtrLog } = await import('./models/dtrLogModel.js');
const { Leave } = await import('./models/leaveModel.js');
const { Announcement } = await import('./models/announcementModel.js');
const { DtrSubmission, dtrContentHash } = await import('./models/dtrSubmissionModel.js');
const { createAuthToken } = await import('./utils/authToken.js');
const { SignedDocument } = await import('./models/signedDocumentModel.js');
const { PDFDocument } = await import('pdf-lib');
const { signedFormMarker } = await import('../../shared/signedForms.js');

// The DTR as WorkMate makes it for submission `ref`, signed in Adobe (an appended signature).
const signedDtr = async (ref, { signed = true } = {}) => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdf.setKeywords([signedFormMarker('dtr-incharge', ref)]);
  const bytes = Buffer.from(await pdf.save({ useObjectStreams: false }));
  return signed ? Buffer.concat([bytes, Buffer.from('\n91 0 obj\n<< /Type /Sig /ByteRange [0 100 200 300] /Contents <3082> >>\nendobj\n%%EOF\n', 'latin1')]) : bytes;
};
const asUpload = (ref, bytes) => ({ kind: 'dtr-incharge', ref, fileName: 'DTR_JUAN_2026-10_signed.pdf', data: bytes.toString('base64') });

const app = createApiApp();

const employee = { _id: '64b000000000000000000061', email: 'juan@dilg.gov.ph', employeeId: 'EMP-61', name: 'Juan Dela Cruz', role: 'LGOO II', accessLevel: 'employee', accountStatus: 'Active', password: 'hash' };
const supervisor = { _id: '64b000000000000000000062', email: 'pd@dilg.gov.ph', employeeId: 'SUP-62', name: 'Ivan Stephen F. Fadri, CESE', role: 'Provincial Director', accessLevel: 'supervisor', accountStatus: 'Active', password: 'hash' };
const hr = { _id: '64b000000000000000000063', email: 'hr@dilg.gov.ph', employeeId: 'HR-63', name: 'HR Officer', accessLevel: 'hr_admin', hrTask: 'pre-approval', accountStatus: 'Active', password: 'hash' };
const signature = 'data:image/png;base64,iVBORw0KGgo=';
const october = [
  { id: 'att-1', employeeId: 'EMP-61', date: '2026-10-05', timeIn: '07:55 AM', timeOut: '05:00 PM' },
  { id: 'att-2', employeeId: 'EMP-61', date: '2026-10-06', timeIn: '08:40 AM', timeOut: '05:40 PM' }
];

// Signs in as `as` on Nov 10, 2026, with October's records `records` and `password` as the right one.
const signIn = (t, { as = employee, records = october, password = 'right-password' } = {}) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-10T02:00:00Z') });
  t.mock.method(User, 'findByEmail', async email => [employee, supervisor, hr].find(person => person.email === email) || null);
  t.mock.method(User, 'findByEmployeeId', async id => [employee].find(person => person.employeeId === id) || null);
  t.mock.method(User, 'verifyPassword', async (user, typed) => typed === password);
  t.mock.method(DtrLog, 'findMonthForEmployee', async () => records);
  t.mock.method(Leave, 'findAllRequests', async () => []);
  t.mock.method(Announcement, 'createNotification', async notice => notice);
  const auth = { Authorization: `Bearer ${createAuthToken(as)}` };
  return {
    submit: body => request(app).post('/api/dtr-submissions').set(auth).send(body),
    review: body => request(app).patch('/api/dtr-submissions').set(auth).send(body),
    list: query => request(app).get(`/api/dtr-submissions${query || ''}`).set(auth),
    upload: body => request(app).post('/api/signed-documents').set(auth).send(body)
  };
};

test('an employee signs and submits an ended month\'s DTR, and the Supervisor is told', async t => {
  const session = signIn(t);
  const save = t.mock.method(DtrSubmission, 'submit', async ({ employee: person, month, signature: signed, contentHash }) => ({ id: 'dtr-1', employeeId: person.employeeId, month, status: 'Submitted', employeeSignature: signed, contentHash }));
  const response = await session.submit({ month: '2026-10', signature, password: 'right-password' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const saved = save.mock.calls[0].arguments[0];
  assert.equal(saved.month, '2026-10');
  assert.equal(saved.signature.image, signature);
  assert.equal(saved.signature.name, 'Juan Dela Cruz');
  assert.ok(saved.signature.signedAt instanceof Date);
  assert.equal(saved.contentHash, dtrContentHash(october, '2026-10'));
  const notice = Announcement.createNotification.mock.calls[0].arguments[0];
  assert.equal(notice.recipientRole, 'supervisor');
  assert.match(notice.message, /Juan Dela Cruz signed and submitted their DTR for October 2026/);
});

test('a DTR is submitted only for an ended month, with a signature and the right password', async t => {
  const session = signIn(t);
  const save = t.mock.method(DtrSubmission, 'submit', async () => ({ id: 'dtr-1' }));
  assert.match((await session.submit({ month: '2026-11', signature, password: 'right-password' })).body.error, /month that has ended/);
  assert.match((await session.submit({ month: '2026-10', signature: '', password: 'right-password' })).body.error, /Add your signature/);
  assert.match((await session.submit({ month: '2026-10', signature: 'https://example.com/sig.png', password: 'right-password' })).body.error, /Add your signature/);
  assert.match((await session.submit({ month: '2026-10', signature, password: 'wrong' })).body.error, /password is incorrect/);
  assert.equal(save.mock.callCount(), 0);
});

test('a DTR waits while HR still has to decide an offline punch, and is submitted once', async t => {
  const pending = [...october, { id: 'att-3', employeeId: 'EMP-61', date: '2026-10-07', timeIn: '08:00 AM', offlineTimeIn: { reviewReasons: ['clock'], decision: '' } }];
  const session = signIn(t, { records: pending });
  const waiting = await session.submit({ month: '2026-10', signature, password: 'right-password' });
  assert.equal(waiting.status, 409);
  assert.match(waiting.body.error, /HR still has to decide your offline Time In or Time Out on 2026-10-07/);
  t.mock.restoreAll();
  t.mock.timers.reset();

  const again = signIn(t);
  t.mock.method(DtrSubmission, 'submit', async () => null);
  t.mock.method(DtrSubmission, 'findOne', async () => ({ status: 'Submitted' }));
  const twice = await again.submit({ month: '2026-10', signature, password: 'right-password' });
  assert.equal(twice.status, 409);
  assert.match(twice.body.error, /already submitted and waiting for the Supervisor/);
});

test('the Supervisor verifies a submitted DTR by uploading it signed in Adobe, and the employee is told', async t => {
  const session = signIn(t, { as: supervisor });
  const submitted = { id: 'dtr-1', employeeId: 'EMP-61', employeeEmail: employee.email, month: '2026-10', status: 'Submitted', contentHash: dtrContentHash(october, '2026-10') };
  t.mock.method(DtrSubmission, 'findById', async () => submitted);
  const saved = t.mock.method(SignedDocument, 'save', async () => {});
  const verify = t.mock.method(DtrSubmission, 'verify', async (id, signed, note) => ({ ...submitted, status: 'Verified', verification: signed, signedForm: note }));
  // The in-app e-signature no longer verifies a DTR.
  assert.match((await session.review({ id: 'dtr-1', action: 'verify', signature, password: 'right-password' })).body.error, /sign it in Adobe as the In-charge/);
  // The upload must be this DTR, signed.
  assert.match((await session.upload(asUpload('dtr-1', await signedDtr('dtr-2')))).body.error, /not the form WorkMate made/);
  assert.match((await session.upload(asUpload('dtr-1', await signedDtr('dtr-1', { signed: false })))).body.error, /no digital signature/);
  assert.equal(verify.mock.callCount(), 0);

  const response = await session.upload(asUpload('dtr-1', await signedDtr('dtr-1')));
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const [, signed, note] = verify.mock.calls[0].arguments;
  assert.equal(signed.name, 'Ivan Stephen F. Fadri, CESE');
  assert.equal(signed.position, 'Provincial Director');
  assert.equal(note.uploadedBy, 'Ivan Stephen F. Fadri, CESE');
  assert.equal(saved.mock.calls[0].arguments[0].kind, 'dtr-incharge');
  const notice = Announcement.createNotification.mock.calls.at(-1).arguments[0];
  assert.equal(notice.employeeId, 'EMP-61');
  assert.equal(notice.title, 'DTR Verified');
  assert.equal(notice.view, 'documents');
});

test('a DTR that changed after the employee signed it cannot be verified', async t => {
  const changed = [{ ...october[0], timeIn: '07:30 AM' }, october[1]];
  const session = signIn(t, { as: supervisor, records: changed });
  t.mock.method(DtrSubmission, 'findById', async () => ({ id: 'dtr-1', employeeId: 'EMP-61', month: '2026-10', status: 'Submitted', contentHash: dtrContentHash(october, '2026-10') }));
  const verify = t.mock.method(DtrSubmission, 'verify', async () => null);
  t.mock.method(SignedDocument, 'save', async () => {});
  const response = await session.upload(asUpload('dtr-1', await signedDtr('dtr-1')));
  assert.equal(response.status, 409);
  assert.match(response.body.error, /changed after the employee signed it/);
  assert.equal(verify.mock.callCount(), 0);
});

test('the Supervisor returns a DTR with remarks, and only the Supervisor reviews DTRs', async t => {
  const session = signIn(t, { as: supervisor });
  t.mock.method(DtrSubmission, 'findById', async () => ({ id: 'dtr-1', employeeId: 'EMP-61', month: '2026-10', status: 'Submitted' }));
  const giveBack = t.mock.method(DtrSubmission, 'returnToEmployee', async (id, details) => ({ id, status: 'Returned', remarks: details.remarks }));
  assert.match((await session.review({ id: 'dtr-1', action: 'return', remarks: ' ' })).body.error, /what the employee needs to fix/);
  const response = await session.review({ id: 'dtr-1', action: 'return', remarks: 'Oct 6 Time Out is missing.' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(giveBack.mock.calls[0].arguments[1].remarks, 'Oct 6 Time Out is missing.');
  assert.match(Announcement.createNotification.mock.calls.at(-1).arguments[0].message, /returned by Ivan Stephen F\. Fadri, CESE\..*Remarks: Oct 6 Time Out is missing\./);
  t.mock.restoreAll();
  t.mock.timers.reset();

  for (const as of [hr, employee]) {
    const other = signIn(t, { as });
    assert.equal((await other.review({ id: 'dtr-1', action: 'verify', signature, password: 'right-password' })).status, 403);
    assert.equal((await other.upload(asUpload('dtr-1', await signedDtr('dtr-1')))).status, 403);
    t.mock.restoreAll();
    t.mock.timers.reset();
  }
});

test('the Supervisor opens a submitted DTR with the records it is made from; employees list only their own', async t => {
  const session = signIn(t, { as: supervisor });
  t.mock.method(DtrSubmission, 'findById', async () => ({ id: 'dtr-1', employeeId: 'EMP-61', employeeEmail: employee.email, month: '2026-10', status: 'Submitted' }));
  const opened = await session.list('?id=dtr-1');
  assert.equal(opened.status, 200, JSON.stringify(opened.body));
  assert.equal(opened.body.records.length, 2);
  assert.equal(opened.body.employee.employeeId, 'EMP-61');
  t.mock.restoreAll();
  t.mock.timers.reset();

  const own = signIn(t);
  const mine = t.mock.method(DtrSubmission, 'findForEmployee', async () => [{ id: 'dtr-1' }]);
  assert.equal((await own.list()).body.submissions.length, 1);
  assert.equal(mine.mock.calls[0].arguments[0], 'EMP-61');
  // Another employee's submission is not theirs to open.
  t.mock.method(DtrSubmission, 'findById', async () => ({ id: 'dtr-9', employeeId: 'EMP-99', month: '2026-10', status: 'Submitted' }));
  assert.equal((await own.list('?id=dtr-9')).status, 404);
});
