import assert from 'node:assert/strict';
import test from 'node:test';
import { assignmentOfShift, homeOfficeOf } from './shiftAssignment.js';

test('a field shift keeps the barangay it was timed in at', () => {
  const site = { mode: 'field', municipality: 'Boac', barangay: 'Bangbangalon', label: 'Brgy. Bangbangalon, Boac, Marinduque, Philippines', latitude: 13.44061, longitude: 121.82688 };
  assert.deepEqual(assignmentOfShift(site), { mode: 'field', municipality: 'Boac', barangay: 'Bangbangalon', street: '', landmark: '' });
});

test('an office shift finds its office from the saved town and barangay', () => {
  // The area saved with an office Time In has no office id.
  assert.equal(assignmentOfShift({ mode: 'office', municipality: 'Boac', barangay: 'Isok I (Pob.)' }).officeId, 'boac');
  assert.equal(assignmentOfShift({ mode: 'office', municipality: 'Gasan', barangay: 'Barangay II (Pob.)' }).officeId, 'gasan');
  // A Time In still waiting on the phone has the office id.
  assert.equal(assignmentOfShift({ mode: 'office', municipality: 'Boac', officeId: 'provincial' }).officeId, 'provincial');
});

test('a work-from-home shift keeps its address', () => {
  const site = { mode: 'wfh', municipality: 'Gasan', barangay: 'Bangbang', street: '12 Rizal St.', landmark: 'Near the chapel' };
  assert.deepEqual(assignmentOfShift(site), { mode: 'wfh', municipality: 'Gasan', barangay: 'Bangbang', street: '12 Rizal St.', landmark: 'Near the chapel' });
});

test('a shift with no saved area leaves the page as it is', () => {
  assert.equal(assignmentOfShift(null), null);
  assert.equal(assignmentOfShift({}), null);
  assert.equal(assignmentOfShift({ mode: 'field', municipality: 'Boac', barangay: 'Not a barangay' }), null);
  assert.equal(assignmentOfShift({ mode: 'office', municipality: 'Boac', barangay: 'Somewhere else' }), null);
});

test('the attendance page starts at the office the employee reports to', () => {
  // The assigned station HR set comes first.
  assert.equal(homeOfficeOf({ assignedStation: 'DILG Municipal Office - Gasan', office: 'Office of the MLGOO - Boac' }).id, 'gasan');
  // An MLGOO office is in its town hall.
  assert.equal(homeOfficeOf({ office: 'Office of the MLGOO - Santa Cruz' }).id, 'santa-cruz');
  assert.equal(homeOfficeOf({ office: 'Office of the MLGOO - Boac' }).id, 'boac');
  // The Provincial Office's sections, and an account saved before the list, are in the Capitol.
  assert.equal(homeOfficeOf({ office: 'Finance and Administrative Section (FAS)' }).id, 'provincial');
  assert.equal(homeOfficeOf({ office: 'Marinduque Provincial Office' }).id, 'provincial');
  assert.equal(homeOfficeOf({ office: 'Provincial Office' }).barangay, 'Bangbangalon');
  // Unknown: the page starts on Field.
  assert.equal(homeOfficeOf({ office: '' }), null);
  assert.equal(homeOfficeOf(null), null);
});
