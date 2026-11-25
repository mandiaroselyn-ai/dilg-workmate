import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_FIELD_SITE_NAME, DEFAULT_FIELD_SITE_RADIUS, fieldSiteArea, readFieldSite } from './fieldSites.js';
import { fieldSiteProblem, resolveFieldAssignment } from './fieldAssignmentArea.js';
import { isWithinAssignedLocation } from './assignmentGeofence.js';

// A spot in Brgy. Pawa, Boac (a point inside it on the PSA map).
const pawaHall = { municipality: 'Boac', barangay: 'Pawa', name: 'Pawa Barangay Hall', latitude: 13.45147, longitude: 121.88398, radiusMeters: 100 };
// About 1 m of latitude, in degrees.
const METER = 1 / 110574;

test('HR\'s field site is checked: a real barangay, a place in Marinduque, and one of the ranges', () => {
  assert.deepEqual(readFieldSite({ ...pawaHall, name: '  Pawa   Barangay Hall ' }).value, pawaHall);
  // The name and range have defaults.
  const plain = readFieldSite({ municipality: 'Boac', barangay: 'Pawa', latitude: 13.45147, longitude: 121.88398 }).value;
  assert.equal(plain.name, DEFAULT_FIELD_SITE_NAME);
  assert.equal(plain.radiusMeters, DEFAULT_FIELD_SITE_RADIUS);

  assert.match(readFieldSite({ ...pawaHall, barangay: 'Nowhere' }).error, /municipality and barangay/);
  assert.match(readFieldSite({ ...pawaHall, municipality: 'Gasan' }).error, /municipality and barangay/);
  for (const [latitude, longitude] of [[null, 121.88], [13.45, undefined], ['x', 121.88], [14.6, 121.0]]) {
    assert.match(readFieldSite({ ...pawaHall, latitude, longitude }).error, /Mark the field site on the map/, `${latitude},${longitude}`);
  }
  for (const radiusMeters of [0, 75, 1000, 'far']) {
    assert.match(readFieldSite({ ...pawaHall, radiusMeters }).error, /Choose the range/, String(radiusMeters));
  }
  assert.match(readFieldSite({ ...pawaHall, name: 'x'.repeat(81) }).error, /80 characters/);
});

test('a field site must be in its barangay, and Brgy. Tanza keeps the campus', () => {
  assert.equal(fieldSiteProblem(pawaHall), '');
  // Brgy. Sawi's middle is not in Pawa.
  assert.match(fieldSiteProblem({ ...pawaHall, latitude: 13.44099, longitude: 121.85443 }), /outside Brgy\. Pawa, Boac/);
  assert.match(fieldSiteProblem({ municipality: 'Boac', barangay: 'Tanza', latitude: 13.4547, longitude: 121.8445 }), /Marinduque State University campus/);
});

test('field work in a barangay with a site counts within its range, and elsewhere in the barangay it does not', () => {
  const area = resolveFieldAssignment({ municipality: 'Boac', barangay: 'Pawa' }, [pawaHall]);
  assert.deepEqual(area, fieldSiteArea(pawaHall));
  assert.equal(area.radiusMeters, 100);
  assert.match(area.label, /^Pawa Barangay Hall, Brgy\. Pawa, Boac/);
  assert.equal(isWithinAssignedLocation(pawaHall.latitude, pawaHall.longitude, area), true);
  assert.equal(isWithinAssignedLocation(pawaHall.latitude + 95 * METER, pawaHall.longitude, area), true);
  assert.equal(isWithinAssignedLocation(pawaHall.latitude + 110 * METER, pawaHall.longitude, area), false);
  // Saved with a record and read back, it counts the same.
  assert.equal(isWithinAssignedLocation(pawaHall.latitude + 110 * METER, pawaHall.longitude, JSON.parse(JSON.stringify(area))), false);

  // Without a site, the whole barangay (and 50 m past it) counts, as before.
  const whole = resolveFieldAssignment({ municipality: 'Boac', barangay: 'Pawa' }, []);
  assert.equal(whole.radiusMeters, undefined);
  assert.equal(isWithinAssignedLocation(pawaHall.latitude + 110 * METER, pawaHall.longitude, whole), true);
  // Another barangay's site does not apply.
  assert.equal(resolveFieldAssignment({ municipality: 'Boac', barangay: 'Sawi' }, [pawaHall]).radiusMeters, undefined);
  // Brgy. Tanza is the campus, even with a site saved for it.
  const tanza = resolveFieldAssignment({ municipality: 'Boac', barangay: 'Tanza' }, [{ ...pawaHall, barangay: 'Tanza' }]);
  assert.match(tanza.label, /^Marinduque State University campus/);
});
