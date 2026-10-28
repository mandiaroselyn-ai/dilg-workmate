import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'profile-fields-test-secret';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { Leave } = await import('./models/leaveModel.js');
const { Announcement } = await import('./models/announcementModel.js');
const { createAuthToken } = await import('./utils/authToken.js');

const app = createApiApp();
const employee = { _id: 'emp-1', name: 'Juan Dela Cruz', email: 'juan@dilg.gov.ph', employeeId: 'DILG-2026-1', accessLevel: 'employee', accountStatus: 'Active', role: 'LGOO II', office: 'Boac' };
const supervisor = { _id: 'sup-1', name: 'Ana Reyes', email: 'ana@dilg.gov.ph', employeeId: 'DILG-2026-2', accessLevel: 'supervisor', accountStatus: 'Active' };
const hr = { _id: 'hr-1', name: 'HR Officer', email: 'hr@dilg.gov.ph', employeeId: 'DILG-2026-3', accessLevel: 'hr_admin', accountStatus: 'Active' };

// Saves the signed-in person's profile with the database replaced, and returns what
// would have been saved.
const saveProfile = async (t, person, body) => {
  t.mock.method(User, 'findByEmail', async () => person);
  const update = t.mock.method(User, 'update', async data => ({ ...person, ...data }));
  const response = await request(app)
    .post('/api/user')
    .set('Authorization', `Bearer ${createAuthToken(person)}`)
    .send(body);
  return { response, saved: update.mock.calls[0]?.arguments[0] };
};

// What HR fills in for a new employee account.
const newAccount = {
  name: 'Pedro Santos', email: 'pedro@dilg.gov.ph', employeeId: 'DILG-2026-9', role: 'LGOO II', office: 'Boac',
  region: 'DILG Region IV-B - MIMAROPA', employmentStatus: 'ACTIVE', dateHired: '2026-10-16', appointmentStatus: 'Permanent',
  password: 'a-long-initial-password'
};
const createAccount = body => request(app).post('/api/employees').set('Authorization', `Bearer ${createAuthToken(hr)}`).send(body);

test('an account HR makes is Active at once, with no approval', async t => {
  t.mock.method(User, 'findByEmail', async () => hr);
  const creates = t.mock.method(User, 'createEmployee', async data => ({ ...data, _id: 'emp-new' }));
  const make = accountStatus => request(app)
    .post('/api/employees')
    .set('Authorization', `Bearer ${createAuthToken(hr)}`)
    .send({ ...newAccount, accountStatus });

  const response = await make('Pending');
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.equal(creates.mock.calls[0].arguments[0].accountStatus, 'Active');
  assert.equal(response.body.employee.accountStatus, 'Active');
  // HR may still make one Inactive.
  await make('Inactive');
  assert.equal(creates.mock.calls[1].arguments[0].accountStatus, 'Inactive');
});

test('a new account needs its job designation, office, date hired, and status of appointment', async t => {
  t.mock.method(User, 'findByEmail', async () => hr);
  const creates = t.mock.method(User, 'createEmployee', async data => ({ ...data, _id: 'emp-new' }));
  for (const [field, message] of [
    ['role', /job designation, and office are required/],
    ['office', /job designation, and office are required/],
    ['dateHired', /date hired/],
    ['appointmentStatus', /status of appointment/]
  ]) {
    const response = await createAccount({ ...newAccount, [field]: '' });
    assert.equal(response.status, 400, field);
    assert.match(response.body.error, message);
  }
  assert.equal((await createAccount({ ...newAccount, dateHired: '2026-02-30' })).status, 400);
  const unlisted = await createAccount({ ...newAccount, appointmentStatus: 'Regular' });
  assert.equal(unlisted.status, 400);
  assert.match(unlisted.body.error, /Choose a Status of Appointment from the list/);
  assert.equal(creates.mock.callCount(), 0);

  const response = await createAccount(newAccount);
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const saved = creates.mock.calls[0].arguments[0];
  assert.equal(saved.region, 'DILG Region IV-B - MIMAROPA');
  assert.equal(saved.appointmentStatus, 'Permanent');
  assert.equal(saved.dateHired, '2026-10-16');
  // A new employee starts with no leave credits.
  assert.equal('vacationLeaveCredits' in saved, false);
});

test('a new account left without an employee ID is given one like DILG-2026-123456', async t => {
  t.mock.method(User, 'findByEmail', async () => hr);
  t.mock.method(User, 'findAccount', async () => null);
  const creates = t.mock.method(User, 'createEmployee', async data => ({ ...data, _id: 'emp-new' }));
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-28T02:00:00Z') });

  const response = await createAccount({ ...newAccount, employeeId: '' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.match(creates.mock.calls[0].arguments[0].employeeId, /^DILG-2026-\d{6}$/);
});

test('HR enters a transferee\'s leave balance from the leave card, but none for COS or JO workers', async t => {
  t.mock.method(User, 'findByEmail', async () => hr);
  const creates = t.mock.method(User, 'createEmployee', async data => ({ ...data, _id: 'emp-new' }));

  const response = await createAccount({ ...newAccount, openingVacationLeaveCredits: '23.5', openingSickLeaveCredits: '41.25' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const saved = creates.mock.calls[0].arguments[0];
  assert.equal(saved.vacationLeaveCredits, 23.5);
  assert.equal(saved.sickLeaveCredits, 41.25);
  assert.equal(saved.leaveCreditHistory.length, 1);
  assert.equal(saved.leaveCreditHistory[0].reason, 'Opening balance from the leave card');
  assert.equal(saved.leaveCreditHistory[0].changedBy, 'HR Officer');
  assert.equal(saved.leaveCreditHistory[0].previousVacationLeaveCredits, 0);

  assert.equal((await createAccount({ ...newAccount, openingVacationLeaveCredits: '-1' })).status, 400);
  const jobOrder = await createAccount({ ...newAccount, appointmentStatus: 'Job Order', openingVacationLeaveCredits: '5' });
  assert.equal(jobOrder.status, 400);
  assert.match(jobOrder.body.error, /do not earn leave credits/);
  // Without a balance, a job order worker's account is made.
  assert.equal((await createAccount({ ...newAccount, appointmentStatus: 'Job Order' })).status, 201);
});

test('HR cannot give a COS or JO worker leave credits by adjustment, only clear them', async t => {
  const worker = { ...employee, appointmentStatus: 'Contract of Service', vacationLeaveCredits: 3, sickLeaveCredits: 0 };
  t.mock.method(User, 'findByEmail', async email => (email === hr.email ? hr : null));
  t.mock.method(User, 'findAccount', async () => worker);
  t.mock.method(Announcement, 'createNotification', async notice => notice);
  const sets = t.mock.method(User, 'setLeaveCredits', async (identifier, value) => ({ ...worker, ...value }));
  const adjust = body => request(app).patch(`/api/employees/${worker.employeeId}/leave-credits`).set('Authorization', `Bearer ${createAuthToken(hr)}`).send(body);

  const given = await adjust({ vacationLeaveCredits: 5, sickLeaveCredits: 0, reason: 'Leave card' });
  assert.equal(given.status, 400);
  assert.match(given.body.error, /do not earn leave credits/);
  assert.equal(sets.mock.callCount(), 0);
  assert.equal((await adjust({ vacationLeaveCredits: 0, sickLeaveCredits: 0, reason: 'Cleared: job order' })).status, 200);
});

test('employees save their own personal details and ID numbers, but not HR\'s employment details', async t => {
  const { response, saved } = await saveProfile(t, employee, {
    name: 'Juan Dela Cruz',
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    civilStatus: 'Married',
    gsisNumber: ' 2004-123-456 ',
    emergencyContactNumber: '0917 123 4567',
    role: 'Regional Director',
    office: 'Central Office',
    region: 'NCR',
    salary: 'PHP 200,000',
    division: 'Finance'
  });
  assert.equal(response.status, 200);
  assert.equal(saved.civilStatus, 'Married');
  assert.equal(saved.gsisNumber, '2004-123-456');
  assert.equal(saved.lastName, 'Dela Cruz');
  assert.equal(saved.emergencyContactNumber, '0917 123 4567');
  for (const field of ['role', 'office', 'region', 'salary', 'division']) {
    assert.equal(field in saved, false, `${field} is kept by HR`);
  }
});

test('supervisors also leave their employment details to HR', async t => {
  const { response, saved } = await saveProfile(t, supervisor, { name: 'Ana Reyes', role: 'Provincial Director', salaryGrade: 'SG 26', address: 'Boac' });
  assert.equal(response.status, 200);
  assert.equal(saved.address, 'Boac');
  assert.equal('role' in saved, false);
  assert.equal('salaryGrade' in saved, false);
});

test('an HR/Admin keeps their own position, office, and employment details', async t => {
  const { response, saved } = await saveProfile(t, hr, { name: 'HR Officer', role: 'HRMO III', office: 'Provincial Office', dateHired: '2020-01-06', salaryGrade: 'SG 18', salaryStep: 'Step 2', salary: 'PHP 999,999', plantillaItemNumber: 'DILGB-HRMO3-1-2020' });
  assert.equal(response.status, 200);
  assert.equal(saved.role, 'HRMO III');
  assert.equal(saved.dateHired, '2020-01-06');
  assert.equal(saved.salaryGrade, 'SG 18');
  // The salary sent is ignored: it comes from SG 18, Step 2 in the salary schedule.
  assert.equal(saved.salaryStep, 'Step 2');
  assert.equal(saved.salary, 'PHP 54,371');
  assert.equal(saved.plantillaItemNumber, 'DILGB-HRMO3-1-2020');
});

test('a profile save needs a full name, and an HR/Admin\'s needs a position and office', async t => {
  const blankName = await saveProfile(t, employee, { name: '   ' });
  assert.equal(blankName.response.status, 400);
  assert.equal(blankName.response.body.error, 'Enter your full name.');
  assert.equal(blankName.saved, undefined);

  const blankPosition = await saveProfile(t, hr, { name: 'HR Officer', role: '' });
  assert.equal(blankPosition.response.status, 400);
  assert.equal(blankPosition.response.body.error, 'Enter your position.');
});

test('profile details must be text of a sensible length', async t => {
  const notText = await saveProfile(t, employee, { name: 'Juan Dela Cruz', tinNumber: 123456789 });
  assert.equal(notText.response.status, 400);
  assert.equal(notText.response.body.error, 'TIN must be text.');

  const tooLong = await saveProfile(t, employee, { name: 'Juan Dela Cruz', suffix: 'J'.repeat(21) });
  assert.equal(tooLong.response.status, 400);
  assert.equal(tooLong.response.body.error, 'Suffix is too long.');
});

test('supervisors get only what reviewing a request needs about the requester', async t => {
  t.mock.method(User, 'findByEmail', async () => supervisor);
  t.mock.method(Leave, 'findAllRequests', async () => [{ id: 'LV-1', type: 'Leave Request', status: 'Pending', employeeId: employee.employeeId }]);
  t.mock.method(User, 'findByEmployeeId', async () => ({
    ...employee,
    password: 'hashed',
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    salary: 'PHP 36,619',
    profilePicture: 'data:image/png;base64,AAAA',
    address: 'Boac, Marinduque',
    dateOfBirth: '1990-03-05',
    gsisNumber: '2004-123-456',
    tinNumber: '123-456-789',
    emergencyContactName: 'Maria Dela Cruz',
    leaveCreditHistory: [{ reason: 'Leave card' }]
  }));
  const response = await request(app)
    .get('/api/requests')
    .set('Authorization', `Bearer ${createAuthToken(supervisor)}`);
  assert.equal(response.status, 200);
  const requester = response.body[0].employee;
  // The leave form's name, position, office, and salary are there.
  assert.equal(requester.name, 'Juan Dela Cruz');
  assert.equal(requester.lastName, 'Dela Cruz');
  assert.equal(requester.role, 'LGOO II');
  assert.equal(requester.salary, 'PHP 36,619');
  for (const field of ['password', 'profilePicture', 'address', 'dateOfBirth', 'gsisNumber', 'tinNumber', 'emergencyContactName', 'leaveCreditHistory']) {
    assert.equal(field in requester, false, `${field} is not sent with requests`);
  }
});

test('HR saving an employee changes only the profile details the form sent', async t => {
  t.mock.method(User, 'findByEmail', async () => hr);
  t.mock.method(User, 'findAccount', async () => ({ ...employee, employmentStatus: 'ACTIVE' }));
  const update = t.mock.method(User, 'updateEmployee', async (_identifier, data) => ({ ...employee, ...data }));
  const notify = t.mock.method(Announcement, 'createNotification', async data => data);
  const response = await request(app)
    .patch(`/api/employees/${employee.employeeId}`)
    .set('Authorization', `Bearer ${createAuthToken(hr)}`)
    .send({
      name: employee.name,
      email: employee.email,
      employeeId: employee.employeeId,
      role: employee.role,
      office: employee.office,
      employmentStatus: 'ACTIVE',
      accountStatus: 'Active',
      civilStatus: 'Single',
      salaryGrade: 'SG 13',
      salaryStep: 'Step 2'
    });
  assert.equal(response.status, 200);
  const saved = update.mock.calls[0].arguments[1];
  assert.equal(saved.civilStatus, 'Single');
  // SG 13, Step 2 in the salary schedule.
  assert.equal(saved.salary, 'PHP 36,283');
  assert.equal('gsisNumber' in saved, false);
  assert.equal(response.body.employee.salary, 'PHP 36,283');
  // The employee is told what HR changed.
  const notice = notify.mock.calls[0].arguments[0];
  assert.equal(notice.title, 'Profile Updated by HR');
  assert.equal(notice.message, 'HR updated your profile: Salary grade, Salary step, Monthly salary. See your Profile for the details.');
  assert.equal(notice.view, 'profile');
});
