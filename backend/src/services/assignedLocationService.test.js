import test from 'node:test';
import assert from 'node:assert/strict';
import { isWithinAssignedLocation } from '../../../shared/assignmentGeofence.js';

const barangayLocation = {
  mode: 'field',
  latitude: 13.0005,
  longitude: 121.0005,
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [121, 13], [121.001, 13], [121.001, 13.001], [121, 13.001], [121, 13]
    ]]
  }
};

test('field geofence accepts points inside the barangay polygon', () => {
  assert.equal(isWithinAssignedLocation(13.0005, 121.0005, barangayLocation), true);
});

test('field geofence tolerates up to 150m outside the barangay boundary', () => {
  assert.equal(isWithinAssignedLocation(13.0005, 121.0019, barangayLocation), true);
  assert.equal(isWithinAssignedLocation(13.0005, 121.003, barangayLocation), false);
});

test('field geofence respects polygon holes and multiple polygons', () => {
  const locationWithHole = {
    ...barangayLocation,
    geometry: {
      type: 'Polygon',
      coordinates: [
        barangayLocation.geometry.coordinates[0],
        [[121.0004, 13.0004], [121.0006, 13.0004], [121.0006, 13.0006], [121.0004, 13.0006], [121.0004, 13.0004]]
      ]
    }
  };
  assert.equal(isWithinAssignedLocation(13.0005, 121.0005, locationWithHole, 0), false);

  const multiPolygon = {
    ...barangayLocation,
    geometry: { type: 'MultiPolygon', coordinates: [barangayLocation.geometry.coordinates] }
  };
  assert.equal(isWithinAssignedLocation(13.0005, 121.0005, multiPolygon), true);
});

test('WFH and office geofences use a 150m radius around the resolved address', () => {
  const address = { mode: 'office', latitude: 13, longitude: 121 };
  assert.equal(isWithinAssignedLocation(13.0005, 121, address), true);
  assert.equal(isWithinAssignedLocation(13.002, 121, address), false);
  assert.equal(isWithinAssignedLocation(13, 121, { ...address, mode: 'wfh' }), true);
});

test('field geofence fails closed when no administrative boundary is available', () => {
  assert.equal(isWithinAssignedLocation(13, 121, { mode: 'field', latitude: 13, longitude: 121 }), false);
});

test('field geofence uses the resolved point when the map has no administrative boundary', () => {
  const pointLocation = {
    mode: 'field',
    latitude: 13,
    longitude: 121,
    geometry: { type: 'Point', coordinates: [121, 13] },
    fallbackToRadius: true
  };
  assert.equal(isWithinAssignedLocation(13.0005, 121, pointLocation), true);
  assert.equal(isWithinAssignedLocation(13.002, 121, pointLocation), false);
});