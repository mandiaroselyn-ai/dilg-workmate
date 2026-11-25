import assert from 'node:assert/strict';
import test from 'node:test';
import { FIELD_RANGE_METERS, dutyLabelOf, dutyRangeOf } from './dutyRange.js';
import { resolveFieldAssignment } from './fieldAssignmentArea.js';
import { resolveOfficeArea } from './officeAreas.js';
import { isWithinAssignedLocation } from './assignmentGeofence.js';

// About 1 m of latitude, in degrees.
const METER = 1 / 110574;
const timeIn = { latitude: 13.452351, longitude: 121.880056 }; // in Brgy. Pawa, Boac

test('field work in a whole barangay is watched within 50 m of where the employee timed in', () => {
  const pawa = resolveFieldAssignment({ municipality: 'Boac', barangay: 'Pawa' });
  const range = dutyRangeOf(pawa, timeIn);
  assert.equal(FIELD_RANGE_METERS, 50);
  assert.equal(range.radiusMeters, 50);
  assert.equal(range.latitude, timeIn.latitude);
  assert.equal(range.longitude, timeIn.longitude);
  assert.equal(range.barangay, 'Pawa');
  assert.match(range.label, /^Within 50 m of the Time In, Brgy\. Pawa, Boac/);
  assert.equal(isWithinAssignedLocation(timeIn.latitude + 40 * METER, timeIn.longitude, range), true);
  // Still in Pawa, but 80 m away: outside the range.
  assert.equal(isWithinAssignedLocation(timeIn.latitude + 80 * METER, timeIn.longitude, pawa), true);
  assert.equal(isWithinAssignedLocation(timeIn.latitude + 80 * METER, timeIn.longitude, range), false);
  // Given back, it stays the same; saved and read back, it counts the same.
  assert.deepEqual(dutyRangeOf(range, { latitude: 13.5, longitude: 121.9 }), range);
  assert.equal(isWithinAssignedLocation(timeIn.latitude + 150 * METER, timeIn.longitude, JSON.parse(JSON.stringify(range))), false);
});

test('an office, a work-from-home address, and the MarSU campus keep their own range', () => {
  const campus = resolveFieldAssignment({ municipality: 'Boac', barangay: 'Tanza' });
  assert.equal(dutyRangeOf(campus, { latitude: 13.4547, longitude: 121.8445 }), campus);
  const office = resolveOfficeArea('provincial');
  assert.equal(dutyRangeOf(office, timeIn), office);
  const home = { mode: 'wfh', latitude: 13.45, longitude: 121.88, label: 'Home' };
  assert.equal(dutyRangeOf(home, timeIn), home);
  // Without a Time In position there is nothing to center on, so the area stays.
  const pawa = resolveFieldAssignment({ municipality: 'Boac', barangay: 'Pawa' });
  assert.equal(dutyRangeOf(pawa, null), pawa);
  assert.equal(dutyRangeOf(pawa, { latitude: null, longitude: 121.88 }), pawa);
  assert.equal(dutyRangeOf(null, timeIn), null);
});

test('each employee is labeled Field, Office, or WFH', () => {
  assert.equal(dutyLabelOf('field'), 'Field');
  assert.equal(dutyLabelOf('office'), 'Office');
  assert.equal(dutyLabelOf('WFH'), 'WFH');
  assert.equal(dutyLabelOf(undefined), '');
});
