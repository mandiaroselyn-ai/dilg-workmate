import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'staff-controller-test-secret';
const { User } = await import('../models/User.js');
const { Announcement } = await import('../models/announcementModel.js');
const controller = await import('./staffController.js');

// Replaces database calls with in-memory stand-ins for one test.
const withFakes = async (fakes, run) => {
  const originals = {};
  for (const [name, fake] of Object.entries(fakes)) {
    originals[name] = User[name];
    User[name] = fake;
  }
  const originalNotify = Announcement.createNotification;
  Announcement.createNotification = async () => ({});
  try {
    return await run();
  } finally {
    Object.assign(User, originals);
    Announcement.createNotification = originalNotify;
  }
};

const call = async (handler, { user, params = {}, body = {} }) => {
  let statusCode = 200;
  let json;
  const res = { status(code) { statusCode = code; return this; }, json(value) { json = value; return this; } };
  await handler({ user, params, body }, res);
  return { statusCode, json };
};

const account = fields => {
  const target = { accountStatus: 'Active', saved: false, ...fields };
  target.save = async () => { target.saved = true; };
  target.toObject = () => ({ ...target });
  return target;
};

const hr = account({ _id: 'hr-1', name: 'HR One', email: 'hr1@dilg.gov.ph', accessLevel: 'hr_admin' });

test('creating an HR/Admin account requires the HR password', async () => {
  const body = { name: 'New Admin', email: 'new@dilg.gov.ph', role: 'HRMO', office: 'Boac', accessLevel: 'hr_admin', password: 'initial-password-1' };
  let created = false;
  await withFakes({
    verifyPassword: async (_user, password) => password === 'correct-password',
    createStaffAccount: async data => { created = true; return { ...data, _id: 'new-1' }; }
  }, async () => {
    assert.equal((await call(controller.createStaff, { user: hr, body })).statusCode, 403);
    assert.equal(created, false);
    const ok = await call(controller.createStaff, { user: hr, body: { ...body, adminPassword: 'correct-password' } });
    assert.equal(ok.statusCode, 201);
    assert.equal(created, true);
  });
});

test('supervisor accounts can be created without the HR password', async () => {
  const body = { name: 'Sup', email: 'sup@dilg.gov.ph', role: 'Director', office: 'Boac', accessLevel: 'supervisor', password: 'initial-password-1' };
  await withFakes({ createStaffAccount: async data => ({ ...data, _id: 'sup-1' }) }, async () => {
    assert.equal((await call(controller.createStaff, { user: hr, body })).statusCode, 201);
  });
});

test('HR cannot change their own access', async () => {
  await withFakes({ findAccount: async () => hr, countActiveAdmins: async () => 2 }, async () => {
    const result = await call(controller.changeAccess, { user: hr, params: { identifier: hr.email }, body: { accessLevel: 'employee' } });
    assert.equal(result.statusCode, 409);
    assert.match(result.json.error, /own access/);
  });
});

test('the last active HR/Admin cannot be deactivated', async () => {
  const onlyOtherAdmin = account({ _id: 'hr-2', name: 'HR Two', email: 'hr2@dilg.gov.ph', accessLevel: 'hr_admin' });
  await withFakes({ findAccount: async () => onlyOtherAdmin, countActiveAdmins: async () => 1 }, async () => {
    const result = await call(controller.changeStaffStatus, { user: hr, params: { identifier: 'hr2@dilg.gov.ph' }, body: { accountStatus: 'Inactive', adminPassword: 'x' } });
    assert.equal(result.statusCode, 409);
    assert.equal(onlyOtherAdmin.saved, false);
  });
});

test('promoting an employee to supervisor saves the new access level', async () => {
  const employee = account({ _id: 'emp-1', name: 'Juan', email: 'juan@dilg.gov.ph', accessLevel: 'employee', employeeId: 'E1' });
  await withFakes({ findAccount: async () => employee, countActiveAdmins: async () => 1 }, async () => {
    const result = await call(controller.changeAccess, { user: hr, params: { identifier: 'E1' }, body: { accessLevel: 'supervisor' } });
    assert.equal(result.statusCode, 200);
    assert.equal(employee.accessLevel, 'supervisor');
    assert.equal(employee.saved, true);
  });
});
