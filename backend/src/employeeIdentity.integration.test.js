import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'employee-identity-test-secret';
for (const key of ['UNISMS_API_KEY', 'HTTPSMS_API_KEY', 'HTTPSMS_FROM', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM']) {
  process.env[key] = '';
}
globalThis.fetch = async url => {
  throw new Error(`Tests must not call the network (${url}).`);
};

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { Announcement } = await import('./models/announcementModel.js');
const { DtrLog } = await import('./models/dtrLogModel.js');
const { Leave } = await import('./models/leaveModel.js');
const { DtrSubmission } = await import('./models/dtrSubmissionModel.js');
const { TravelDocument } = await import('./models/travelDocumentModel.js');
const { OvertimeOrder } = await import('./models/overtimeOrderModel.js');
const { createAuthToken } = await import('./utils/authToken.js');
const { ownRecordsFilter, ownerChanges } = await import('./utils/recordOwner.js');
const { carryRecordsToNewIdentity, RECORDS_NOT_MOVED } = await import('./services/employeeIdentity.js');

const app = createApiApp();
const hr = { _id: 'hr-1', email: 'hr@dilg.gov.ph', accessLevel: 'hr_admin', accountStatus: 'Active' };
const roselyn = {
  _id: 'emp-7',
  name: 'Roselyn Mandia',
  email: 'roselyn@gmail.com',
  employeeId: 'DILG-2026-540013',
  accessLevel: 'employee',
  accountStatus: 'Active',
  role: 'Administrative Aide IV',
  office: 'Office of the MLGOO - Boac',
  phoneNumber: '0917 123 4567',
  dateHired: '2024-02-01',
  appointmentStatus: 'Permanent'
};

// The record moves, kept in memory instead of MongoDB.
const mockMoves = t => ({
  dtr: t.mock.method(DtrLog, 'reassignOwner', async () => 3),
  leave: t.mock.method(Leave, 'reassignOwner', async () => 1),
  submissions: t.mock.method(DtrSubmission, 'reassignOwner', async () => 1),
  documents: t.mock.method(TravelDocument, 'reassignOwner', async () => 0),
  overtime: t.mock.method(OvertimeOrder, 'replaceEmployeeId', async () => 1)
});

test('an account\'s own records are those with its old ID and its old name or none', () => {
  const filter = ownRecordsFilter({ employeeId: 'DILG-2026-7689', email: 'a@x.test', name: 'Roselyn Mandia' });
  assert.equal(filter.employeeId, 'DILG-2026-7689');
  const [byName, noName] = filter.$or;
  assert.ok(byName.employeeName.test('  roselyn mandia '));
  // Another account that shared the old default ID keeps its records.
  assert.equal(byName.employeeName.test('Lara Montiano'), false);
  assert.deepEqual(noName, { employeeName: { $in: ['', null] } });
  // Without an Employee ID, the email.
  assert.ok(ownRecordsFilter({ email: 'A@X.test' }).employeeEmail.test('a@x.test'));
  assert.equal(ownRecordsFilter({}), null);
  // A travel document keeps its uploader's details under uploadedBy.
  const fields = { idField: 'uploadedBy.employeeId', emailField: 'uploadedBy.email', nameField: 'uploadedBy.name' };
  assert.equal(ownRecordsFilter({ employeeId: 'E1' }, fields)['uploadedBy.employeeId'], 'E1');
  assert.deepEqual(ownerChanges({ employeeId: 'E2', name: 'New' }, fields), { 'uploadedBy.employeeId': 'E2', 'uploadedBy.name': 'New' });
});

test('a new name or Employee ID moves every kind of record; nothing moves when neither changed', async t => {
  const moves = mockMoves(t);
  assert.equal(await carryRecordsToNewIdentity(roselyn, { ...roselyn }), null);
  assert.equal(moves.dtr.mock.callCount(), 0);

  const moved = await carryRecordsToNewIdentity(roselyn, { ...roselyn, name: 'Roselyn M. Mandia' });
  assert.equal(moved, 5);
  const owner = { employeeId: 'DILG-2026-540013', email: 'roselyn@gmail.com', name: 'Roselyn Mandia' };
  for (const move of [moves.dtr, moves.leave, moves.submissions, moves.documents]) {
    assert.deepEqual(move.mock.calls[0].arguments, [owner, { name: 'Roselyn M. Mandia' }]);
  }
  // The overtime orders list Employee IDs only.
  assert.equal(moves.overtime.mock.callCount(), 0);

  await carryRecordsToNewIdentity(roselyn, { ...roselyn, employeeId: 'DILG-0042' });
  assert.deepEqual(moves.dtr.mock.calls[1].arguments[1], { employeeId: 'DILG-0042' });
  assert.deepEqual(moves.overtime.mock.calls[0].arguments, ['DILG-2026-540013', 'DILG-0042']);
});

test('HR renaming an employee moves their earlier records to the new name', async t => {
  t.mock.method(User, 'findByEmail', async () => hr);
  t.mock.method(User, 'findAccount', async () => roselyn);
  t.mock.method(User, 'updateEmployee', async (_id, data) => ({ ...roselyn, ...data }));
  t.mock.method(Announcement, 'createNotification', async data => data);
  const moves = mockMoves(t);
  const response = await request(app)
    .patch(`/api/employees/${roselyn.employeeId}`)
    .set('Authorization', `Bearer ${createAuthToken(hr)}`)
    .send({ ...roselyn, name: 'Roselyn M. Mandia', employmentStatus: 'ACTIVE' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.recordsWarning, undefined);
  assert.deepEqual(moves.dtr.mock.calls[0].arguments[1], { name: 'Roselyn M. Mandia' });
  assert.equal(moves.dtr.mock.calls[0].arguments[0].name, 'Roselyn Mandia');
});

test('when the records cannot be moved, the account stays saved and HR is told how to retry', async t => {
  t.mock.method(User, 'findByEmail', async () => hr);
  t.mock.method(User, 'findAccount', async () => roselyn);
  t.mock.method(User, 'updateEmployee', async (_id, data) => ({ ...roselyn, ...data }));
  t.mock.method(Announcement, 'createNotification', async data => data);
  mockMoves(t);
  t.mock.method(DtrLog, 'reassignOwner', async () => { throw new Error('MongoDB is not connected.'); });
  t.mock.method(console, 'error', () => {});
  const response = await request(app)
    .patch(`/api/employees/${roselyn.employeeId}`)
    .set('Authorization', `Bearer ${createAuthToken(hr)}`)
    .send({ ...roselyn, employeeId: 'DILG-0042', employmentStatus: 'ACTIVE' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.employee.employeeId, 'DILG-0042');
  assert.equal(response.body.recordsWarning, RECORDS_NOT_MOVED);
});

test('an employee\'s full name follows the name parts they save on their Profile, and their records follow it', async t => {
  t.mock.method(User, 'findByEmail', async () => roselyn);
  const update = t.mock.method(User, 'update', async data => ({ ...roselyn, ...data }));
  const moves = mockMoves(t);
  const response = await request(app)
    .post('/api/user')
    .set('Authorization', `Bearer ${createAuthToken(roselyn)}`)
    .send({ name: 'Roselyn Mandia', firstName: 'Roselyn', middleName: 'Mendoza', lastName: 'Mandia' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(update.mock.calls[0].arguments[0].name, 'Roselyn Mendoza Mandia');
  assert.deepEqual(moves.dtr.mock.calls[0].arguments[1], { name: 'Roselyn Mendoza Mandia' });
});

test('HR\'s saved name parts make the full name', async t => {
  t.mock.method(User, 'findByEmail', async () => hr);
  t.mock.method(User, 'findAccount', async () => roselyn);
  const update = t.mock.method(User, 'updateEmployee', async (_id, data) => ({ ...roselyn, ...data }));
  t.mock.method(Announcement, 'createNotification', async data => data);
  mockMoves(t);
  const response = await request(app)
    .patch(`/api/employees/${roselyn.employeeId}`)
    .set('Authorization', `Bearer ${createAuthToken(hr)}`)
    .send({ ...roselyn, name: 'Roselyn Mandia', firstName: 'Roselyn', lastName: 'Mandia-Reyes', employmentStatus: 'ACTIVE' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(update.mock.calls[0].arguments[1].name, 'Roselyn Mandia-Reyes');
});

test('an account with records is kept Inactive instead of deleted; one without records is deleted', async t => {
  const inactive = { ...roselyn, accountStatus: 'Inactive' };
  t.mock.method(User, 'findByEmail', async () => hr);
  t.mock.method(User, 'findAccount', async () => inactive);
  t.mock.method(Announcement, 'createNotification', async data => data);
  const remove = t.mock.method(User, 'deleteEmployee', async () => ({ deleted: inactive }));
  t.mock.method(DtrLog, 'hasOwnRecords', async () => true);
  t.mock.method(Leave, 'hasOwnRecords', async () => false);
  t.mock.method(DtrSubmission, 'hasOwnRecords', async () => false);
  const kept = await request(app).delete(`/api/employees/${roselyn.employeeId}`).set('Authorization', `Bearer ${createAuthToken(hr)}`);
  assert.equal(kept.status, 409);
  assert.match(kept.body.error, /Keep the account Inactive instead/);
  assert.equal(remove.mock.callCount(), 0);

  DtrLog.hasOwnRecords.mock.mockImplementation(async () => false);
  const deleted = await request(app).delete(`/api/employees/${roselyn.employeeId}`).set('Authorization', `Bearer ${createAuthToken(hr)}`);
  assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
  assert.equal(remove.mock.callCount(), 1);
});

test("HR saves the date and cause of separation, checked against the date hired", async t => {
  t.mock.method(User, 'findByEmail', async () => hr);
  t.mock.method(User, 'findAccount', async () => roselyn);
  const update = t.mock.method(User, 'updateEmployee', async (_id, data) => ({ ...roselyn, ...data }));
  t.mock.method(Announcement, 'createNotification', async data => data);
  mockMoves(t);
  const save = body => request(app)
    .patch(`/api/employees/${roselyn.employeeId}`)
    .set('Authorization', `Bearer ${createAuthToken(hr)}`)
    .send({ ...roselyn, employmentStatus: 'ACTIVE', ...body });
  const saved = await save({ separationDate: '2026-11-15', separationReason: 'Resignation' });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(update.mock.calls[0].arguments[1].separationDate, '2026-11-15');
  assert.equal(update.mock.calls[0].arguments[1].separationReason, 'Resignation');
  // Before the date hired, without a cause, or with a cause not on the list: not saved.
  assert.equal((await save({ separationDate: '2024-01-31', separationReason: 'Resignation' })).status, 400);
  assert.equal((await save({ separationDate: '2026-11-15', separationReason: '' })).status, 400);
  assert.equal((await save({ separationDate: '2026-11-15', separationReason: 'Went home' })).status, 400);
  assert.equal(update.mock.callCount(), 1);
});
