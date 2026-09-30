import assert from 'node:assert/strict';
import test from 'node:test';
import { liveLocationFromLog } from './dtrLogModel.js';

// An open attendance record: timed in by phone in Libtangin, Gasan (12 m accuracy), then the
// app sent a position from a laptop whose browser guessed Boac from its internet connection.
const openLog = {
  customId: 'dtr-1',
  employeeId: 'DILG-2026-111111',
  employeeName: 'John Rey Sol',
  date: '2026-09-30',
  timeIn: '08:14 AM',
  latitude: 13.3443,
  longitude: 121.8246,
  gpsStatus: 'In Range',
  assignmentMatch: true,
  distanceToAssignmentMeters: 40,
  currentLatitude: 13.4474,
  currentLongitude: 121.8344,
  currentGpsStatus: 'Out of Range',
  currentWithinGeofence: false,
  locationHistory: [{ latitude: 13.3443, longitude: 121.8246, accuracy: 12, timestamp: '2026-09-30T00:14:00Z' }],
  assignmentSite: { label: 'Gasan, Marinduque' }
};

test('HR\'s map uses the GPS taken at Time In, not positions sent later', () => {
  const entry = liveLocationFromLog(openLog);
  assert.equal(entry.latitude, 13.3443);
  assert.equal(entry.longitude, 121.8246);
  assert.equal(entry.gpsStatus, 'In Range');
  assert.equal(entry.assignmentMatch, true);
  assert.equal(entry.distanceToAssignmentMeters, 40);
  assert.equal(entry.gpsAccuracy, 12);
  assert.equal(entry.timeIn, '08:14 AM');
  assert.deepEqual(entry.assignmentArea, { label: 'Gasan, Marinduque' });
});

test('an entry without location history still has its Time In position', () => {
  const entry = liveLocationFromLog({ ...openLog, locationHistory: [] });
  assert.equal(entry.latitude, 13.3443);
  assert.equal(entry.gpsAccuracy, null);
});
