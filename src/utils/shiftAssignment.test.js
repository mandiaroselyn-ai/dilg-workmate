import assert from 'node:assert/strict';
import test from 'node:test';
import { assignmentOfShift } from './shiftAssignment.js';

test('a field shift keeps the barangay it was timed in at', () => {
  const site = { mode: 'field', municipality: 'Boac', barangay: 'Bangbangalon', label: 'Brgy. Bangbangalon, Boac, Marinduque, Philippines', latitude: 13.44061, longitude: 121.82688 };
  assert.deepEqual(assignmentOfShift(site), { mode: 'field', municipality: 'Boac', barangay: 'Bangbangalon', street: '', landmark: '' });
});

test('an office shift finds its office from the saved town and barangay', () => {
  // The area saved with an office Time In has no office id.
  assert.equal(assignmentOfShift({ mode: 'office', municipality: 'Boac', barangay: 'Tampus (Pob.)' }).officeId, 'boac');
  assert.equal(assignmentOfShift({ mode: 'office', municipality: 'Gasan', barangay: 'Barangay I (Pob.)' }).officeId, 'gasan');
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
