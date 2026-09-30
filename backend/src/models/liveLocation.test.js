import assert from 'node:assert/strict';
import test from 'node:test';
import { liveLocationFromLog } from './dtrLogModel.js';

// An open attendance record: timed in by phone in Libtangin, Gasan (12 m accuracy) at 8:14.
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
  locationHistory: [{ latitude: 13.3443, longitude: 121.8246, accuracy: 12, timestamp: '2026-09-30T00:14:00Z' }],
  lastLocationUpdate: '2026-09-30T00:14:00Z',
  createdAt: '2026-09-30T00:14:00Z',
  assignmentSite: { label: 'Brgy. Libtangin, Gasan, Marinduque, Philippines' }
};
// The phone's GPS at 10:02, after the employee walked out of Libtangin.
const trackedOutside = {
  currentLatitude: 13.3600,
  currentLongitude: 121.8500,
  currentWithinGeofence: false,
  currentDistanceMeters: 2100,
  currentAccuracy: 18,
  lastLocationUpdate: '2026-09-30T02:02:00Z',
  geofenceEvents: [{ eventType: 'exit', timestamp: '2026-09-30T01:55:00Z', latitude: 13.35, longitude: 121.84 }]
};
const at = iso => new Date(iso);

test('before any tracked GPS arrives, HR sees the Time In position and its time', () => {
  const entry = liveLocationFromLog(openLog, at('2026-09-30T00:16:00Z'));
  assert.equal(entry.latitude, 13.3443);
  assert.equal(entry.longitude, 121.8246);
  assert.equal(entry.gpsStatus, 'In Range');
  assert.equal(entry.gpsAccuracy, 12);
  assert.equal(entry.lastGpsAt, '2026-09-30T00:14:00.000Z');
  assert.equal(entry.lastGpsAgeSeconds, 120);
  assert.equal(entry.leftAreaAt, null);
  assert.deepEqual(entry.timeInGps, { latitude: 13.3443, longitude: 121.8246, gpsStatus: 'In Range', accuracy: 12 });
  assert.deepEqual(entry.assignmentArea, { label: 'Brgy. Libtangin, Gasan, Marinduque, Philippines' });
});

test('HR sees the latest phone GPS, outside the area since the employee left it', () => {
  const entry = liveLocationFromLog({ ...openLog, ...trackedOutside }, at('2026-09-30T02:03:30Z'));
  assert.equal(entry.latitude, 13.36);
  assert.equal(entry.longitude, 121.85);
  assert.equal(entry.gpsStatus, 'Out of Range');
  assert.equal(entry.assignmentMatch, false);
  assert.equal(entry.distanceToAssignmentMeters, 2100);
  assert.equal(entry.gpsAccuracy, 18);
  assert.equal(entry.lastGpsAt, '2026-09-30T02:02:00.000Z');
  assert.equal(entry.lastGpsAgeSeconds, 90);
  assert.equal(entry.leftAreaAt, '2026-09-30T01:55:00.000Z');
  assert.equal(entry.timeInGps.gpsStatus, 'In Range', 'the Time In result stays as recorded');
});

test('back inside the area, the employee is green again', () => {
  const entry = liveLocationFromLog({
    ...openLog,
    ...trackedOutside,
    currentWithinGeofence: true,
    geofenceEvents: [{ eventType: 'entry', timestamp: '2026-09-30T02:10:00Z' }]
  });
  assert.equal(entry.gpsStatus, 'In Range');
  assert.equal(entry.leftAreaAt, null);
});

test('positions without a phone-grade accuracy are not shown', () => {
  // Sent before accuracy was recorded (possibly by a laptop guessing from its connection).
  const unknownAccuracy = liveLocationFromLog({ ...openLog, ...trackedOutside, currentAccuracy: undefined });
  assert.equal(unknownAccuracy.latitude, 13.3443);
  assert.equal(unknownAccuracy.gpsStatus, 'In Range');
  assert.equal(unknownAccuracy.lastGpsAt, '2026-09-30T00:14:00.000Z');

  const rough = liveLocationFromLog({ ...openLog, ...trackedOutside, currentAccuracy: 850 });
  assert.equal(rough.latitude, 13.3443);
});

test('an entry without location history still has its Time In position', () => {
  const entry = liveLocationFromLog({ ...openLog, locationHistory: [] }, at('2026-09-30T00:15:00Z'));
  assert.equal(entry.latitude, 13.3443);
  assert.equal(entry.gpsAccuracy, null);
  assert.equal(entry.lastGpsAgeSeconds, 60);
});
