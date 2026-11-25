import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'field-sites-test-secret';

const { createApiApp } = await import('./app.js');
const { User } = await import('./models/User.js');
const { FieldSite } = await import('./models/fieldSiteModel.js');
const { createAuthToken } = await import('./utils/authToken.js');
const { currentAssignedArea, forgetFieldSites } = await import('./services/assignedLocationService.js');
const { resolveFieldAssignment } = await import('../../shared/fieldAssignmentArea.js');

const app = createApiApp();
const hr = { _id: '64b000000000000000000061', email: 'hr@dilg.gov.ph', employeeId: 'HR-6', name: 'Ma. Joane O. Salcedo', accessLevel: 'hr_admin', hrTask: 'leave-credits', accountStatus: 'Active' };
const employee = { _id: '64b000000000000000000062', email: 'juan@dilg.gov.ph', employeeId: 'EMP-6', name: 'Juan Dela Cruz', accessLevel: 'employee', accountStatus: 'Active' };
const pawaHall = { municipality: 'Boac', barangay: 'Pawa', name: 'Pawa Barangay Hall', latitude: 13.45147, longitude: 121.88398, radiusMeters: 100 };

// Signed in as `as`, with the field sites kept in `stored`.
const signIn = (t, as, stored = []) => {
  forgetFieldSites();
  t.mock.method(User, 'findByEmail', async email => (email === as.email ? as : null));
  t.mock.method(FieldSite, 'findAll', async () => stored);
  t.mock.method(FieldSite, 'save', async site => {
    stored.splice(0, stored.length, ...stored.filter(item => item.municipality !== site.municipality || item.barangay !== site.barangay), site);
    return site;
  });
  t.mock.method(FieldSite, 'remove', async (municipality, barangay) => {
    const before = stored.length;
    stored.splice(0, stored.length, ...stored.filter(item => item.municipality !== municipality || item.barangay !== barangay));
    return stored.length < before;
  });
  const auth = { Authorization: `Bearer ${createAuthToken(as)}` };
  return {
    list: () => request(app).get('/api/field-sites').set(auth),
    save: body => request(app).put('/api/field-sites').set(auth).send(body),
    remove: (municipality, barangay) => request(app).delete(`/api/field-sites?municipality=${encodeURIComponent(municipality)}&barangay=${encodeURIComponent(barangay)}`).set(auth),
    resolve: assignmentSite => request(app).post('/api/dtr/action?action=geofence-resolve').set(auth).send({ assignmentSite })
  };
};

test('HR sets a barangay\'s field site, and the Attendance page gets it for that barangay', async t => {
  const stored = [];
  const asHr = signIn(t, hr, stored);
  const saved = await asHr.save(pawaHall);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(saved.body.sites, [pawaHall]);
  assert.equal(FieldSite.save.mock.calls[0].arguments[1], hr.name);

  t.mock.restoreAll();
  const asEmployee = signIn(t, employee, stored);
  assert.deepEqual((await asEmployee.list()).body.sites, [pawaHall]);
  const area = (await asEmployee.resolve({ mode: 'field', municipality: 'Boac', barangay: 'Pawa' })).body.location;
  assert.equal(area.radiusMeters, 100);
  assert.match(area.label, /^Pawa Barangay Hall/);
  // Another barangay still counts as a whole.
  assert.equal((await asEmployee.resolve({ mode: 'field', municipality: 'Boac', barangay: 'Sawi' })).body.location.radiusMeters, undefined);
});

test('only HR sets or removes field sites, and a site must be a real place in its barangay', async t => {
  const asEmployee = signIn(t, employee, []);
  assert.equal((await asEmployee.save(pawaHall)).status, 403);
  assert.equal((await asEmployee.remove('Boac', 'Pawa')).status, 403);
  assert.equal(FieldSite.save.mock.callCount(), 0);
  t.mock.restoreAll();

  const asHr = signIn(t, hr, []);
  const outside = await asHr.save({ ...pawaHall, latitude: 13.44099, longitude: 121.85443 });
  assert.equal(outside.status, 400);
  assert.match(outside.body.error, /outside Brgy\. Pawa, Boac/);
  const tanza = await asHr.save({ municipality: 'Boac', barangay: 'Tanza', latitude: 13.4547, longitude: 121.8445 });
  assert.equal(tanza.status, 400);
  assert.match(tanza.body.error, /Marinduque State University campus/);
  assert.equal((await asHr.save({ ...pawaHall, radiusMeters: 75 })).status, 400);
  assert.equal(FieldSite.save.mock.callCount(), 0);
});

test('HR removes a field site, and the barangay counts as a whole again', async t => {
  const stored = [{ ...pawaHall }];
  const asHr = signIn(t, hr, stored);
  const removed = await asHr.remove('Boac', 'Pawa');
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.body.sites, []);
  assert.equal((await asHr.remove('Boac', 'Pawa')).status, 404);
  assert.equal((await asHr.resolve({ mode: 'field', municipality: 'Boac', barangay: 'Pawa' })).body.location.radiusMeters, undefined);
});

test('a shift timed in before HR set the site is checked against the site from then on', async t => {
  forgetFieldSites();
  // Timed in when Pawa counted as a whole; HR has set the barangay hall since.
  const savedAtTimeIn = JSON.parse(JSON.stringify(resolveFieldAssignment({ municipality: 'Boac', barangay: 'Pawa' })));
  t.mock.method(FieldSite, 'findAll', async () => [pawaHall]);
  const now = await currentAssignedArea(savedAtTimeIn);
  assert.equal(now.radiusMeters, 100);
  // A work-from-home address stays as it was saved.
  const home = { mode: 'wfh', municipality: 'Boac', latitude: 13.45, longitude: 121.88, label: 'Home' };
  assert.equal(await currentAssignedArea(home), home);
  assert.equal(await currentAssignedArea(null), null);
  forgetFieldSites();
});
