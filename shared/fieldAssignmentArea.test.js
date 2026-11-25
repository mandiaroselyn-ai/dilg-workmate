import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveFieldAssignment } from './fieldAssignmentArea.js';
import { isWithinAssignedLocation } from './assignmentGeofence.js';

test('field work in Brgy. Tanza, Boac counts only inside the Marinduque State University campus', () => {
  const campus = resolveFieldAssignment({ municipality: 'Boac', barangay: 'Tanza' });
  assert.equal(campus.mode, 'field');
  assert.equal(campus.barangay, 'Tanza');
  assert.match(campus.label, /^Marinduque State University campus, Brgy\. Tanza, Boac/);
  assert.equal(campus.geometry.type, 'Polygon');
  assert.equal(campus.areaMarginMeters, 0);
  // Its center is inside the campus.
  assert.equal(isWithinAssignedLocation(campus.latitude, campus.longitude, campus), true);
  // Near the campus's edges, inside.
  assert.equal(isWithinAssignedLocation(13.4545, 121.8435, campus), true);
  assert.equal(isWithinAssignedLocation(13.4542, 121.8460, campus), true);
  // Elsewhere in Tanza, outside the campus: Tanza Elementary School, about 90 m west of it, and
  // a point 20 m past its eastern corner.
  assert.equal(isWithinAssignedLocation(13.4552059, 121.8422974, campus), false);
  assert.equal(isWithinAssignedLocation(13.4542302, 121.8464250, campus), false);
  // The same counts after the area is saved with the record and read back.
  assert.equal(isWithinAssignedLocation(13.4552059, 121.8422974, JSON.parse(JSON.stringify(campus))), false);
});

test('field work in other barangays still counts the whole barangay and 50 m past it', () => {
  const sawi = resolveFieldAssignment({ municipality: 'Boac', barangay: 'Sawi' });
  assert.equal(sawi.areaMarginMeters, undefined);
  assert.match(sawi.displayName, /PSA barangay boundary/);
  assert.equal(isWithinAssignedLocation(sawi.latitude, sawi.longitude, sawi), true);
  // Sawi Elementary School is in Sawi.
  assert.equal(isWithinAssignedLocation(13.4416856, 121.8576054, sawi), true);
  assert.throws(() => resolveFieldAssignment({ municipality: 'Boac', barangay: 'Nowhere' }), /Choose a barangay/);
});
