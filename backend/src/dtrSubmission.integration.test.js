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
const { DtrReport } = await import('./models/dtrReportModel.js');
const { PDFDocument } = await import('pdf-lib');
const { signedFormMarker } = await import('../../shared/signedForms.js');

// A signature appended to a PDF, as signing adds one.
const SIGNATURE = Buffer.from('\n91 0 obj\n<< /Type /Sig /ByteRange [0 100 200 300] /Contents <3082> >>\nendobj\n%%EOF\n', 'latin1');
// The form WorkMate makes with tag `marker` for `ref`, signed or not.
const signedForm = async (marker, ref, { signed = true } = {}) => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdf.setKeywords([signedFormMarker(marker, ref)]);
  const bytes = Buffer.from(await pdf.save({ useObjectStreams: false }));
  return signed ? Buffer.concat([bytes, SIGNATURE]) : bytes;
};
// The DTR as WorkMate makes it for submission `ref`, signed as the In-charge.
const signedDtr = (ref, options) => signedForm('dtr-incharge', ref, options);
const asUpload = (ref, bytes) => ({ kind: 'dtr-incharge', ref, fileName: 'DTR_JUAN_2026-10_signed.pdf', data: bytes.toString('base64') });

const app = createApiApp();

const employee = { _id: '64b000000000000000000061', email: 'juan@dilg.gov.ph', employeeId: 'EMP-61', name: 'Juan Dela Cruz', role: 'LGOO II', accessLevel: 'employee', accountStatus: 'Active', password: 'hash' };
const supervisor = { _id: '64b000000000000000000062', email: 'pd@dilg.gov.ph', employeeId: 'SUP-62', name: 'Ivan Stephen F. Fadri, CESE', role: 'Provincial Director', accessLevel: 'supervisor', accountStatus: 'Active', password: 'hash' };
// HR 1 (the HR/Admin desk) checks DTRs and prepares the report; HR 2's desk is for leave only.
const hr = { _id: '64b000000000000000000063', email: 'hr@dilg.gov.ph', employeeId: 'HR-63', name: 'Ma. Joane O. Salcedo', role: 'ADAS II', accessLevel: 'hr_admin', hrTask: 'leave-credits', accountStatus: 'Active', password: 'hash' };
const hr2 = { _id: '64b000000000000000000064', email: 'hr2@dilg.gov.ph', employeeId: 'HR-64', name: 'John Erick J. Matining', accessLevel: 'hr_admin', hrTask: 'pre-approval', accountStatus: 'Active', password: 'hash' };
const signature = 'data:image/png;base64,iVBORw0KGgo=';
const october = [
  { id: 'att-1', employeeId: 'EMP-61', date: '2026-10-05', timeIn: '07:55 AM', timeOut: '05:00 PM' },
  { id: 'att-2', employeeId: 'EMP-61', date: '2026-10-06', timeIn: '08:40 AM', timeOut: '05:40 PM' }
];

// Signs in as `as` on Nov 10, 2026, with October's records `records` and `password` as the right one.
const signIn = (t, { as = employee, records = october, password = 'right-password' } = {}) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-10T02:00:00Z') });
  t.mock.method(User, 'findByEmail', async email => [employee, supervisor, hr, hr2].find(person => person.email === email) || null);
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
    upload: body => request(app).post('/api/signed-documents').set(auth).send(body),
    reports: () => request(app).get('/api/dtr-reports').set(auth),
    reviewReport: body => request(app).patch('/api/dtr-reports').set(auth).send(body)
  };
};

test('an employee signs and submits an ended month\'s DTR, and HR is told', async t => {
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
  assert.equal(notice.recipientRole, 'hr_admin');
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
  assert.match(twice.body.error, /already submitted and waiting for HR/);
});

test('HR checks a submitted DTR, or returns it with remarks; HR 2, the PD, and employees do not', async t => {
  const session = signIn(t, { as: hr });
  const submitted = { id: 'dtr-1', employeeId: 'EMP-61', employeeEmail: employee.email, month: '2026-10', status: 'Submitted', contentHash: dtrContentHash(october, '2026-10') };
  t.mock.method(DtrSubmission, 'findById', async () => submitted);
  t.mock.method(DtrReport, 'findByMonth', async () => null);
  const check = t.mock.method(DtrSubmission, 'check', async (id, by) => ({ ...submitted, status: 'Checked', checked: { name: by } }));
  const checked = await session.review({ id: 'dtr-1', action: 'check' });
  assert.equal(checked.status, 200, JSON.stringify(checked.body));
  assert.equal(check.mock.calls[0].arguments[1], 'Ma. Joane O. Salcedo');

  const giveBack = t.mock.method(DtrSubmission, 'returnToEmployee', async (id, details) => ({ id, status: 'Returned', remarks: details.remarks }));
  assert.match((await session.review({ id: 'dtr-1', action: 'return', remarks: ' ' })).body.error, /what the employee needs to fix/);
  const returned = await session.review({ id: 'dtr-1', action: 'return', remarks: 'Oct 6 Time Out is missing.' });
  assert.equal(returned.status, 200, JSON.stringify(returned.body));
  assert.equal(giveBack.mock.calls[0].arguments[1].remarks, 'Oct 6 Time Out is missing.');
  assert.match(Announcement.createNotification.mock.calls.at(-1).arguments[0].message, /returned by Ma\. Joane O\. Salcedo\..*Remarks: Oct 6 Time Out is missing\./);
  t.mock.restoreAll();
  t.mock.timers.reset();

  for (const as of [hr2, supervisor, employee]) {
    const other = signIn(t, { as });
    assert.equal((await other.review({ id: 'dtr-1', action: 'check' })).status, 403);
    t.mock.restoreAll();
    t.mock.timers.reset();
  }
});

test('HR cannot check a DTR that changed since it was signed, or change one whose report is with the PD', async t => {
  const session = signIn(t, { as: hr, records: [{ ...october[0], timeIn: '07:30 AM' }, october[1]] });
  t.mock.method(DtrSubmission, 'findById', async () => ({ id: 'dtr-1', employeeId: 'EMP-61', month: '2026-10', status: 'Submitted', contentHash: dtrContentHash(october, '2026-10') }));
  const report = { value: null };
  t.mock.method(DtrReport, 'findByMonth', async () => report.value);
  const check = t.mock.method(DtrSubmission, 'check', async () => null);
  const changed = await session.review({ id: 'dtr-1', action: 'check' });
  assert.equal(changed.status, 409);
  assert.match(changed.body.error, /changed after the employee signed it/);

  report.value = { id: 'rep-1', month: '2026-10', status: 'For PD', submissionIds: ['dtr-1'] };
  const locked = await session.review({ id: 'dtr-1', action: 'return', remarks: 'Fix it.' });
  assert.equal(locked.status, 409);
  assert.match(locked.body.error, /already with the Provincial Director/);
  assert.equal(check.mock.callCount(), 0);
});

test('HR sends the month\'s report with the checked DTRs to the PD, signing nothing', async t => {
  const session = signIn(t, { as: hr });
  const hash = dtrContentHash(october, '2026-10');
  const month = { submissions: [
    { id: 'dtr-1', employeeId: 'EMP-61', employeeName: 'Juan Dela Cruz', month: '2026-10', status: 'Submitted', contentHash: hash }
  ] };
  t.mock.method(DtrSubmission, 'findMonth', async () => month.submissions);
  t.mock.method(DtrReport, 'findByMonth', async () => null);
  const saved = t.mock.method(SignedDocument, 'save', async () => {});
  const send = t.mock.method(DtrReport, 'send', async details => ({ id: 'rep-1', status: 'For PD', ...details }));
  const rows = [
    { employeeId: 'EMP-61', name: 'Juan Dela Cruz', position: 'LGOO II', office: 'Office of the MLGOO - Boac', dtr: 'made up by the page' },
    { employeeId: 'EMP-70', name: 'Ana Cruz', position: 'ADAS II', office: 'FAS' },
    { employeeId: 'EMP-80', name: 'Ben Reyes', position: 'LGOO V', office: 'LGCDS' }
  ];
  const report = (month = '2026-10', list = rows) => request(app).post('/api/dtr-reports').set({ Authorization: `Bearer ${createAuthToken(hr)}` }).send({ month, rows: list });

  // A DTR still waiting for HR's check holds the report.
  const waiting = await report();
  assert.equal(waiting.status, 409);
  assert.match(waiting.body.error, /Check or return the DTR still waiting for you first: Juan Dela Cruz/);
  // Only a month that has ended, with the list of employees.
  assert.match((await report('2026-11')).body.error, /month that has ended/);
  assert.match((await report('2026-10', [])).body.error, /list of employees/);

  month.submissions = [{ ...month.submissions[0], status: 'Checked' }, { id: 'dtr-2', employeeId: 'EMP-70', employeeName: 'Ana Cruz', month: '2026-10', status: 'Returned' }];
  const sent = await report();
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  const details = send.mock.calls[0].arguments[0];
  assert.deepEqual(details.submissionIds, ['dtr-1']);
  assert.equal(details.sentBy.name, 'Ma. Joane O. Salcedo');
  // What each row says of the DTR is the server's.
  assert.deepEqual(details.rows.map(row => row.dtr), ['Attached', 'Returned to employee', 'Not submitted']);
  // No signed file from HR.
  assert.equal(saved.mock.callCount(), 0);
  const notice = Announcement.createNotification.mock.calls.at(-1).arguments[0];
  assert.equal(notice.recipientRole, 'supervisor');
  assert.match(notice.message, /DTR report for October 2026 with 1 DTR\./);
  t.mock.restoreAll();
  t.mock.timers.reset();

  // The Consolidated Report of Attendance goes with it, kept as HR's page made it, cleaned.
  signIn(t, { as: hr });
  t.mock.method(DtrSubmission, 'findMonth', async () => month.submissions);
  t.mock.method(DtrReport, 'findByMonth', async () => null);
  const sendAgain = t.mock.method(DtrReport, 'send', async details => ({ id: 'rep-1', status: 'For PD', ...details }));
  const consolidated = {
    director: 'Ivan Stephen F. Fadri, CESE',
    vacant: '1; drop table',
    counts: { personnel: 2, male: 1, female: -4 },
    rows: [
      { no: 7, name: 'Dela Cruz, Juan', position: 'LGOO II', station: 'DILG-Boac', vl: '12-15', tardy: '30 min - October 5', remarks: 'SPL - 21', extra: 'dropped' },
      { name: '', remarks: 42 }
    ]
  };
  const withConsolidated = await request(app).post('/api/dtr-reports').set({ Authorization: `Bearer ${createAuthToken(hr)}` }).send({ month: '2026-10', rows, consolidated });
  assert.equal(withConsolidated.status, 200, JSON.stringify(withConsolidated.body));
  const kept = sendAgain.mock.calls[0].arguments[0].consolidated;
  assert.equal(kept.director, 'Ivan Stephen F. Fadri, CESE');
  assert.equal(kept.vacant, '');
  assert.deepEqual(kept.counts, { personnel: 2, male: 1, female: 0 });
  assert.deepEqual(kept.rows.map(row => [row.no, row.name, row.vl, row.sl, row.remarks]), [[1, 'Dela Cruz, Juan', '12-15', '', 'SPL - 21'], [2, 'Employee', '', '', '']]);
  assert.equal('extra' in kept.rows[0], false);
  assert.match(Announcement.createNotification.mock.calls.at(-1).arguments[0].message, /with 1 DTR and the Consolidated Report of Attendance\./);
  t.mock.restoreAll();
  t.mock.timers.reset();

  for (const as of [hr2, supervisor, employee]) {
    signIn(t, { as });
    const refused = await request(app).post('/api/dtr-reports').set({ Authorization: `Bearer ${createAuthToken(as)}` }).send({ month: '2026-10', rows });
    assert.equal(refused.status, 403);
    t.mock.restoreAll();
    t.mock.timers.reset();
  }
});

test('the PD signs each DTR of the report as the In-charge, then the report, and the employee is told', async t => {
  const session = signIn(t, { as: supervisor });
  const hash = dtrContentHash(october, '2026-10');
  const dtr = { id: 'dtr-1', employeeId: 'EMP-61', employeeEmail: employee.email, employeeName: 'Juan Dela Cruz', month: '2026-10', status: 'Checked', contentHash: hash };
  const state = { report: { id: 'rep-1', month: '2026-10', status: 'For PD', submissionIds: ['dtr-1'] }, dtr };
  t.mock.method(DtrSubmission, 'findById', async () => state.dtr);
  t.mock.method(DtrSubmission, 'findMonth', async () => [state.dtr]);
  t.mock.method(DtrReport, 'findByMonth', async () => state.report);
  const cover = await signedForm('dtr-report', '2026-10');
  const saved = t.mock.method(SignedDocument, 'save', async () => {});
  const verify = t.mock.method(DtrSubmission, 'verify', async (id, signed, note) => ({ ...state.dtr, status: 'Verified', verification: signed, signedForm: note }));
  const approve = t.mock.method(DtrReport, 'approve', async (id, details) => ({ ...state.report, status: 'Signed by PD', ...details }));
  const pdCover = bytes => session.upload({ kind: 'dtr-report-pd', ref: '2026-10', fileName: 'DTR_Report_2026-10_signed.pdf', data: bytes.toString('base64') });

  // The report waits until every DTR in it is signed.
  const early = await pdCover(cover);
  assert.equal(early.status, 409);
  assert.match(early.body.error, /Sign these DTRs as the In-charge first: Juan Dela Cruz/);

  // The DTR must be this one, signed.
  assert.match((await session.upload(asUpload('dtr-1', await signedDtr('dtr-2')))).body.error, /not the form WorkMate made/);
  assert.match((await session.upload(asUpload('dtr-1', await signedDtr('dtr-1', { signed: false })))).body.error, /no digital signature/);
  assert.equal(verify.mock.callCount(), 0);
  const verified = await session.upload(asUpload('dtr-1', await signedDtr('dtr-1')));
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  const [, signed, note] = verify.mock.calls[0].arguments;
  assert.equal(signed.name, 'Ivan Stephen F. Fadri, CESE');
  assert.equal(signed.position, 'Provincial Director');
  assert.equal(note.uploadedBy, 'Ivan Stephen F. Fadri, CESE');
  const told = Announcement.createNotification.mock.calls.at(-1).arguments[0];
  assert.equal(told.employeeId, 'EMP-61');
  assert.equal(told.title, 'DTR Verified');

  state.dtr = { ...dtr, status: 'Verified' };
  // The report must be this month's, signed by the PD (its only signature).
  assert.match((await pdCover(await signedForm('dtr-report', '2026-09'))).body.error, /not the form WorkMate made/);
  assert.match((await pdCover(await signedForm('dtr-report', '2026-10', { signed: false }))).body.error, /no digital signature/);
  const done = await pdCover(cover);
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(approve.mock.calls[0].arguments[1].approvedBy.name, 'Ivan Stephen F. Fadri, CESE');
  assert.equal(saved.mock.calls.at(-1).arguments[0].kind, 'dtr-report-pd');
  assert.equal(Announcement.createNotification.mock.calls.at(-1).arguments[0].recipientRole, 'hr_admin');
});

test('the PD certifies the Consolidated Report of Attendance sent with the report before signing the report', async t => {
  const session = signIn(t, { as: supervisor });
  const dtr = { id: 'dtr-1', employeeId: 'EMP-61', month: '2026-10', status: 'Verified' };
  const consolidated = { director: 'Ivan Stephen F. Fadri, CESE', vacant: '1', counts: { personnel: 1, male: 1, female: 0 }, rows: [{ no: 1, name: 'Dela Cruz, Juan' }] };
  const state = { report: { id: 'rep-1', month: '2026-10', status: 'For PD', submissionIds: ['dtr-1'], consolidated, signedForms: {} } };
  t.mock.method(DtrSubmission, 'findMonth', async () => [dtr]);
  t.mock.method(DtrReport, 'findByMonth', async () => state.report);
  const saved = t.mock.method(SignedDocument, 'save', async () => {});
  const signConsolidated = t.mock.method(DtrReport, 'signConsolidated', async (id, note) => ({ ...state.report, signedForms: { consolidated: note } }));
  const approve = t.mock.method(DtrReport, 'approve', async (id, details) => ({ ...state.report, status: 'Signed by PD', ...details }));
  const upload = (kind, bytes) => session.upload({ kind, ref: '2026-10', fileName: 'signed.pdf', data: bytes.toString('base64') });

  // The report waits for the Consolidated Report of Attendance.
  const early = await upload('dtr-report-pd', await signedForm('dtr-report', '2026-10'));
  assert.equal(early.status, 409);
  assert.match(early.body.error, /Sign the Consolidated Report of Attendance sent with this report first/);
  assert.equal(approve.mock.callCount(), 0);

  // It must be this month's, signed.
  assert.match((await upload('dtr-consolidated-pd', await signedForm('dtr-consolidated-pd', '2026-09'))).body.error, /not the form WorkMate made/);
  assert.match((await upload('dtr-consolidated-pd', await signedForm('dtr-consolidated-pd', '2026-10', { signed: false }))).body.error, /no digital signature/);
  const certified = await upload('dtr-consolidated-pd', await signedForm('dtr-consolidated-pd', '2026-10'));
  assert.equal(certified.status, 200, JSON.stringify(certified.body));
  assert.equal(saved.mock.calls.at(-1).arguments[0].kind, 'dtr-consolidated-pd');
  assert.equal(signConsolidated.mock.calls[0].arguments[1].uploadedBy, 'Ivan Stephen F. Fadri, CESE');
  assert.ok(certified.body.report.signedForms.consolidated);

  state.report = { ...state.report, signedForms: { consolidated: { uploadedBy: 'Ivan Stephen F. Fadri, CESE' } } };
  const done = await upload('dtr-report-pd', await signedForm('dtr-report', '2026-10'));
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(approve.mock.callCount(), 1);
  t.mock.restoreAll();
  t.mock.timers.reset();

  // Only the PD signs it, and only a report sent with one.
  const hrSession = signIn(t, { as: hr });
  t.mock.method(DtrReport, 'findByMonth', async () => state.report);
  assert.equal((await hrSession.upload({ kind: 'dtr-consolidated-pd', ref: '2026-10', fileName: 'x.pdf', data: (await signedForm('dtr-consolidated-pd', '2026-10')).toString('base64') })).status, 403);
  t.mock.restoreAll();
  t.mock.timers.reset();
  const pdSession = signIn(t, { as: supervisor });
  t.mock.method(DtrReport, 'findByMonth', async () => ({ ...state.report, consolidated: null }));
  assert.equal((await pdSession.upload({ kind: 'dtr-consolidated-pd', ref: '2026-10', fileName: 'x.pdf', data: (await signedForm('dtr-consolidated-pd', '2026-10')).toString('base64') })).status, 404);
  t.mock.restoreAll();
  t.mock.timers.reset();

  // An employee cannot open it.
  signIn(t, { as: employee });
  const find = t.mock.method(SignedDocument, 'find', async () => ({ data: Buffer.from('%PDF-') }));
  const opened = await request(app).get('/api/signed-documents?kind=dtr-consolidated-pd&ref=2026-10').set({ Authorization: `Bearer ${createAuthToken(employee)}` });
  assert.equal(opened.status, 404);
  assert.equal(find.mock.callCount(), 0);
});

test('the PD verifies a DTR only from a report with them, and only if it did not change', async t => {
  const session = signIn(t, { as: supervisor, records: [{ ...october[0], timeIn: '07:30 AM' }, october[1]] });
  const state = { dtr: { id: 'dtr-1', employeeId: 'EMP-61', month: '2026-10', status: 'Submitted', contentHash: dtrContentHash(october, '2026-10') }, report: null };
  t.mock.method(DtrSubmission, 'findById', async () => state.dtr);
  t.mock.method(DtrReport, 'findByMonth', async () => state.report);
  t.mock.method(SignedDocument, 'save', async () => {});
  const verify = t.mock.method(DtrSubmission, 'verify', async () => null);
  assert.match((await session.upload(asUpload('dtr-1', await signedDtr('dtr-1')))).body.error, /HR has not checked this DTR yet/);
  state.dtr = { ...state.dtr, status: 'Checked' };
  assert.match((await session.upload(asUpload('dtr-1', await signedDtr('dtr-1')))).body.error, /not in a DTR report waiting for your signature/);
  state.report = { id: 'rep-1', month: '2026-10', status: 'For PD', submissionIds: ['dtr-1'] };
  const changed = await session.upload(asUpload('dtr-1', await signedDtr('dtr-1')));
  assert.equal(changed.status, 409);
  assert.match(changed.body.error, /changed after the employee signed it/);
  assert.equal(verify.mock.callCount(), 0);
  t.mock.restoreAll();
  t.mock.timers.reset();

  for (const as of [hr, employee]) {
    const other = signIn(t, { as });
    assert.equal((await other.upload(asUpload('dtr-1', await signedDtr('dtr-1')))).status, 403);
    t.mock.restoreAll();
    t.mock.timers.reset();
  }
});

test('the PD returns the report to HR with remarks, or marks a signed one forwarded to the Regional Office', async t => {
  const session = signIn(t, { as: supervisor });
  const state = { report: { id: 'rep-1', month: '2026-10', status: 'For PD', submissionIds: ['dtr-1'] } };
  t.mock.method(DtrReport, 'findById', async () => state.report);
  const giveBack = t.mock.method(DtrReport, 'returnToHr', async (id, details) => ({ ...state.report, status: 'Returned to HR', remarks: details.remarks }));
  const forward = t.mock.method(DtrReport, 'forward', async (id, details) => ({ ...state.report, status: 'Forwarded to Regional Office', forwarded: details }));
  assert.match((await session.reviewReport({ id: 'rep-1', action: 'return', remarks: '' })).body.error, /what HR needs to fix/);
  assert.match((await session.reviewReport({ id: 'rep-1', action: 'forward' })).body.error, /Sign the DTR report first/);
  const returned = await session.reviewReport({ id: 'rep-1', action: 'return', remarks: 'Juan\'s Oct 6 needs a Time Out.' });
  assert.equal(returned.status, 200, JSON.stringify(returned.body));
  assert.equal(giveBack.mock.calls[0].arguments[1].remarks, 'Juan\'s Oct 6 needs a Time Out.');
  assert.match(Announcement.createNotification.mock.calls.at(-1).arguments[0].message, /returned the DTR report for October 2026/);

  state.report = { ...state.report, status: 'Signed by PD' };
  const sent = await session.reviewReport({ id: 'rep-1', action: 'forward', reference: 'DTS 2026-11-0042' });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(forward.mock.calls[0].arguments[1].reference, 'DTS 2026-11-0042');
  assert.match(Announcement.createNotification.mock.calls.at(-1).arguments[0].message, /forwarded the signed DTR report for October 2026 to the Regional Office\. Reference: DTS 2026-11-0042/);
  t.mock.restoreAll();
  t.mock.timers.reset();

  const desk = signIn(t, { as: hr });
  assert.equal((await desk.reviewReport({ id: 'rep-1', action: 'forward' })).status, 403);
  t.mock.method(DtrReport, 'findAll', async () => [{ id: 'rep-1' }]);
  assert.equal((await desk.reports()).body.reports.length, 1);
  t.mock.restoreAll();
  t.mock.timers.reset();
  const staff = signIn(t);
  assert.equal((await staff.reports()).status, 403);
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
