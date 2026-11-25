import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApprovedWfhLocation, normalizeAttendanceAssignment, timeOutLocationError } from './attendanceAssignment.js';

test('canonicalizes a valid office assignment from the office catalog', () => {
  assert.deepEqual(normalizeAttendanceAssignment({
    dutyType: 'office',
    assignmentSite: { mode: 'office', municipality: 'Boac', officeId: 'provincial' },
    user: {}
  }), {
    dutyType: 'office',
    assignmentSite: {
      mode: 'office',
      municipality: 'Boac',
      barangay: 'Bangbangalon',
      officeId: 'provincial'
    }
  });
});

test('validates field barangay and assigned municipality', () => {
  const valid = normalizeAttendanceAssignment({
    dutyType: 'field',
    assignmentSite: { mode: 'field', municipality: 'Boac', barangay: 'Tanza' },
    user: { assignedLGU: 'Boac' }
  });
  assert.equal(valid.assignmentSite.barangay, 'Tanza');

  assert.throws(() => normalizeAttendanceAssignment({
    dutyType: 'field',
    assignmentSite: { mode: 'field', municipality: 'Gasan', barangay: 'Antipolo' },
    user: { assignedLGU: 'Boac' }
  }), /assigned LGU/i);
});

test('rejects invalid or mismatched duty type and assignment mode', () => {
  assert.throws(() => normalizeAttendanceAssignment({
    dutyType: 'remote',
    assignmentSite: { mode: 'remote', municipality: 'Boac' },
    user: {}
  }), /valid attendance duty type/i);
  assert.throws(() => normalizeAttendanceAssignment({
    dutyType: 'office',
    assignmentSite: { mode: 'field', municipality: 'Boac', barangay: 'Tanza' },
    user: {}
  }), /does not match/i);
});

test('requires WFH location to match an HR-approved employee location', () => {
  const approvedWfhLocation = normalizeApprovedWfhLocation({
    municipality: 'Boac',
    barangay: 'Tanza',
    street: '12 Main Street',
    landmark: 'Near Town Hall'
  }, 'HR-001');
  const user = { approvedWfhLocation };
  const result = normalizeAttendanceAssignment({
    dutyType: 'wfh',
    assignmentSite: {
      mode: 'wfh',
      municipality: 'Boac',
      barangay: 'Tanza',
      street: '12 Main Street',
      landmark: 'Near Town Hall'
    },
    user
  });
  assert.equal(result.assignmentSite.street, '12 Main Street');
  assert.throws(() => normalizeAttendanceAssignment({
    dutyType: 'wfh',
    assignmentSite: {
      mode: 'wfh',
      municipality: 'Boac',
      barangay: 'Tanza',
      street: '13 Main Street',
      landmark: 'Near Town Hall'
    },
    user
  }), /does not match.*approved location/i);
  assert.throws(() => normalizeAttendanceAssignment({
    dutyType: 'wfh',
    assignmentSite: { mode: 'wfh', municipality: 'Boac', barangay: 'Tanza' },
    user: {}
  }), /No HR-approved WFH location/i);
});

test('validates and records HR approval metadata for a WFH location', () => {
  assert.throws(() => normalizeApprovedWfhLocation('Boac, Tanza', 'HR-001'), /must be an object/i);
  assert.throws(() => normalizeApprovedWfhLocation({ municipality: 'Boac', barangay: 'invalid' }, 'HR-001'), /valid barangay/i);
  const approved = normalizeApprovedWfhLocation({ municipality: 'Boac', barangay: 'Tanza' }, 'HR-001');
  assert.equal(approved.municipality, 'Boac');
  assert.equal(approved.approvedBy, 'HR-001');
  assert.ok(approved.approvedAt instanceof Date);
});
test('Time Out GPS must be inside the assigned area the shift started in', () => {
  const office = { mode: 'office', latitude: 13.4474, longitude: 121.8344, label: 'DILG Provincial Office' };
  assert.equal(timeOutLocationError(office, { timeOutLatitude: 13.4475, timeOutLongitude: 121.8345, timeOutGpsAccuracy: 12 }), null);
  assert.match(timeOutLocationError(office, { timeOutLatitude: 13.5, timeOutLongitude: 121.9, timeOutGpsAccuracy: 12 }), /outside DILG Provincial Office/);
  assert.match(timeOutLocationError(office, { timeOutLatitude: 13.4475, timeOutLongitude: 121.8345, timeOutGpsAccuracy: 80 }), /50 meters/);
  assert.match(timeOutLocationError(office, {}), /GPS location is required/);
  assert.equal(timeOutLocationError(null, {}), null);
});

test('a new or changed WFH location must be pinned; the same one keeps its pin, or works as before pins', async () => {
  const { keepWfhPin } = await import('./attendanceAssignment.js');
  const pin = { latitude: 13.45147, longitude: 121.88398 };
  const pinned = normalizeApprovedWfhLocation({ municipality: 'Boac', barangay: 'Pawa', street: 'Purok 3', ...pin }, 'HR-001');
  assert.equal(pinned.latitude, pin.latitude);
  assert.equal(keepWfhPin(pinned, null).value, pinned);

  // Saved without a pin: a new one is refused.
  const unpinned = normalizeApprovedWfhLocation({ municipality: 'Boac', barangay: 'Pawa', street: 'Purok 3' }, 'HR-001');
  assert.equal(unpinned.latitude, null);
  assert.match(keepWfhPin(unpinned, null).error, /Pin the employee's house on the map/);
  // The same address as before keeps the earlier pin, or none for an approval made before pins.
  assert.deepEqual(keepWfhPin(unpinned, { ...pinned }).value, { ...unpinned, ...pin });
  const beforePins = { municipality: 'Boac', barangay: 'Pawa', street: 'Purok 3', landmark: '', approvedAt: new Date('2026-11-01') };
  assert.equal(keepWfhPin(unpinned, beforePins).value.latitude, null);
  // A changed address needs a pin.
  assert.match(keepWfhPin({ ...unpinned, street: 'Purok 4' }, { ...pinned }).error, /Pin the employee's house/);
  assert.equal(keepWfhPin(null, pinned).value, null);

  // A pin outside the barangay is refused.
  assert.throws(() => normalizeApprovedWfhLocation({ municipality: 'Boac', barangay: 'Pawa', latitude: 13.44099, longitude: 121.85443 }, 'HR-001'), /outside Brgy\. Pawa, Boac/);

  // Time In uses the approved pin, whatever the app sends.
  const result = normalizeAttendanceAssignment({
    dutyType: 'wfh',
    assignmentSite: { mode: 'wfh', municipality: 'Boac', barangay: 'Pawa', street: 'Purok 3', landmark: '', latitude: 13.5, longitude: 121.9 },
    user: { approvedWfhLocation: pinned }
  });
  assert.equal(result.assignmentSite.latitude, pin.latitude);
  assert.equal(result.assignmentSite.longitude, pin.longitude);
});
