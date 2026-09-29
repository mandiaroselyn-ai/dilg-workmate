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

test('HR can set a temporary password for an employee', async () => {
  const employee = account({ _id: 'emp-1', name: 'Juan Dela Cruz', email: 'juan@dilg.gov.ph', employeeId: 'DILG-2026-1', accessLevel: 'employee' });
  let changedTo = null;
  await withFakes({
    findAccount: async () => employee,
    changePassword: async (_user, password) => { changedTo = password; }
  }, async () => {
    const short = await call(controller.resetAccountPassword, { user: hr, params: { identifier: 'DILG-2026-1' }, body: { newPassword: 'short' } });
    assert.equal(short.statusCode, 400);
    assert.equal(changedTo, null);
    const ok = await call(controller.resetAccountPassword, { user: hr, params: { identifier: 'DILG-2026-1' }, body: { newPassword: 'Temporary-Pass-42' } });
    assert.equal(ok.statusCode, 200);
    assert.equal(changedTo, 'Temporary-Pass-42');
  });
});

test('resetting an HR/Admin password needs HR\'s own password, and HR cannot reset their own here', async () => {
  const otherHr = account({ _id: 'hr-2', name: 'HR Two', email: 'hr2@dilg.gov.ph', accessLevel: 'hr_admin' });
  let changed = false;
  await withFakes({
    findAccount: async identifier => (identifier === 'hr1@dilg.gov.ph' ? hr : otherHr),
    verifyPassword: async (_user, password) => password === 'correct-password',
    changePassword: async () => { changed = true; }
  }, async () => {
    const own = await call(controller.resetAccountPassword, { user: hr, params: { identifier: 'hr1@dilg.gov.ph' }, body: { newPassword: 'Temporary-Pass-42' } });
    assert.equal(own.statusCode, 400);
    const noConfirm = await call(controller.resetAccountPassword, { user: hr, params: { identifier: 'hr2@dilg.gov.ph' }, body: { newPassword: 'Temporary-Pass-42' } });
    assert.equal(noConfirm.statusCode, 403);
    assert.equal(changed, false);
    const confirmed = await call(controller.resetAccountPassword, { user: hr, params: { identifier: 'hr2@dilg.gov.ph' }, body: { newPassword: 'Temporary-Pass-42', adminPassword: 'correct-password' } });
    assert.equal(confirmed.statusCode, 200);
    assert.equal(changed, true);
  });
});

test('resetting the password of an unknown account is refused', async () => {
  await withFakes({ findAccount: async () => null }, async () => {
    const result = await call(controller.resetAccountPassword, { user: hr, params: { identifier: 'nobody' }, body: { newPassword: 'Temporary-Pass-42' } });
    assert.equal(result.statusCode, 404);
  });
});
