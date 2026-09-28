import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApprovedWfhLocation, normalizeAttendanceAssignment } from './attendanceAssignment.js';

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
      barangay: 'Santol',
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