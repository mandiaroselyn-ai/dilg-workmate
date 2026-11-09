import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'registration-test-secret';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { Announcement } = await import('./models/announcementModel.js');

const app = createApiApp();

const signUp = {
  name: 'Juan Dela Cruz',
  email: 'Juan.DelaCruz@dilg.gov.ph',
  role: 'Administrative Aide IV',
  office: 'Office of the MLGOO - Boac',
  region: 'DILG Region IV-B - MIMAROPA',
  phoneNumber: '09171234567',
  address: 'Tampus (Pob.), Boac, Marinduque',
  appointmentStatus: 'Permanent',
  password: 'a-long-password-42'
};

test('a sign-up form account waits for HR approval and is not signed in', async t => {
  t.mock.method(User, 'findByEmail', async () => null);
  t.mock.method(Announcement, 'createNotification', async data => data);
  const create = t.mock.method(User, 'createSelfServiceEmployee', async data => ({ ...data, _id: 'new-1', employeeId: 'DILG-2026-123456', accessLevel: 'employee' }));

  const response = await request(app).post('/api/register').send({ ...signUp, accessLevel: 'hr_admin', accountStatus: 'Active' });

  assert.equal(response.status, 201);
  const saved = create.mock.calls[0].arguments[0];
  assert.equal(saved.accountStatus, 'Pending');
  assert.equal(saved.signUpMethod, 'form');
  assert.equal(saved.phoneNumber, '09171234567');
  assert.equal(saved.email, 'juan.delacruz@dilg.gov.ph');
  // Only the sign-up fields are used, so nobody can sign themselves up as HR/Admin or active.
  assert.equal(saved.accessLevel, undefined);
  assert.equal(response.body.token, undefined);
  assert.match(response.body.message, /HR Administrator must activate it/);
});

test('HR is told a new account is waiting for approval', async t => {
  t.mock.method(User, 'findByEmail', async () => null);
  t.mock.method(User, 'createSelfServiceEmployee', async data => ({ ...data, _id: 'new-2', employeeId: 'DILG-2026-654321', accessLevel: 'employee' }));
  const notify = t.mock.method(Announcement, 'createNotification', async data => data);

  await request(app).post('/api/register').send(signUp);

  const notice = notify.mock.calls[0].arguments[0];
  assert.equal(notice.title, 'New Account Awaiting Approval');
  assert.equal(notice.recipientRole, 'hr_admin');
  assert.match(notice.message, /waiting for HR activation/);
  // HR's notification has a Review account button that opens this employee.
  assert.equal(notice.action, 'review_account');
  assert.equal(notice.targetId, 'DILG-2026-654321');
});

test('a sign-up takes its office from the list', async t => {
  t.mock.method(User, 'findByEmail', async () => null);
  const create = t.mock.method(User, 'createSelfServiceEmployee', async data => data);

  const response = await request(app).post('/api/register').send({ ...signUp, office: 'DILG Marinduque - Boac' });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /office from the list/);
  assert.equal(create.mock.callCount(), 0);
});

test('a sign-up saves the employment details the employee fills in, and needs the status of appointment', async t => {
  t.mock.method(User, 'findByEmail', async () => null);
  t.mock.method(Announcement, 'createNotification', async data => data);
  const create = t.mock.method(User, 'createSelfServiceEmployee', async data => ({ ...data, _id: 'new-3', employeeId: 'DILG-2026-111111', accessLevel: 'employee' }));

  const noStatus = await request(app).post('/api/register').send({ ...signUp, appointmentStatus: '' });
  assert.equal(noStatus.status, 400);
  assert.match(noStatus.body.error, /status of appointment/);
  const unlisted = await request(app).post('/api/register').send({ ...signUp, appointmentStatus: 'Volunteer' });
  assert.equal(unlisted.status, 400);
  assert.equal(create.mock.callCount(), 0);

  const response = await request(app).post('/api/register').send({
    ...signUp,
    appointmentStatus: 'Casual',
    designation: 'MLGOO',
    division: 'LGMED',
    plantillaItemNumber: 'DILGB-ADA4-1-2020',
    salaryGrade: 'SG 4',
    salaryStep: 'Step 2',
    salary: 'PHP 999,999',
    immediateSupervisor: 'Provincial Director',
    // HR's to fill in, so a sign-up cannot set them.
    dateHired: '2020-01-06',
    vacationLeaveCredits: 50
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const saved = create.mock.calls[0].arguments[0];
  assert.equal(saved.appointmentStatus, 'Casual');
  assert.equal(saved.designation, 'MLGOO');
  assert.equal(saved.division, 'LGMED');
  assert.equal(saved.plantillaItemNumber, 'DILGB-ADA4-1-2020');
  assert.equal(saved.salaryGrade, 'SG 4');
  assert.equal(saved.salaryStep, 'Step 2');
  // The monthly salary comes from the salary schedule, not from what was sent.
  assert.notEqual(saved.salary, 'PHP 999,999');
  assert.match(saved.salary, /^PHP /);
  assert.equal(saved.immediateSupervisor, 'Provincial Director');
  assert.equal(saved.dateHired, undefined);
  assert.equal(saved.vacationLeaveCredits, undefined);
});

test('an email that already has an account cannot sign up again', async t => {
  t.mock.method(User, 'findByEmail', async () => ({ email: 'juan.delacruz@dilg.gov.ph' }));
  const create = t.mock.method(User, 'createSelfServiceEmployee', async () => null);

  const response = await request(app).post('/api/register').send(signUp);

  assert.equal(response.status, 409);
  assert.equal(create.mock.callCount(), 0);
});
