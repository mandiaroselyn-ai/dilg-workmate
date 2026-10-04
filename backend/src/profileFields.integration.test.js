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
  const { response, saved } = await saveProfile(t, hr, { name: 'HR Officer', role: 'HRMO III', office: 'Provincial Office', dateHired: '2020-01-06', salaryGrade: 'SG 18', plantillaItemNumber: 'DILGB-HRMO3-1-2020' });
  assert.equal(response.status, 200);
  assert.equal(saved.role, 'HRMO III');
  assert.equal(saved.dateHired, '2020-01-06');
  assert.equal(saved.salaryGrade, 'SG 18');
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
      salary: 'PHP 36,619'
    });
  assert.equal(response.status, 200);
  const saved = update.mock.calls[0].arguments[1];
  assert.equal(saved.civilStatus, 'Single');
  assert.equal(saved.salary, 'PHP 36,619');
  assert.equal('gsisNumber' in saved, false);
  assert.equal(response.body.employee.salary, 'PHP 36,619');
  // The employee is told what HR changed.
  const notice = notify.mock.calls[0].arguments[0];
  assert.equal(notice.title, 'Profile Updated by HR');
  assert.equal(notice.message, 'HR updated your profile: Monthly salary. See your Profile for the details.');
  assert.equal(notice.view, 'profile');
});
