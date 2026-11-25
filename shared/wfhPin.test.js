import assert from 'node:assert/strict';
import test from 'node:test';
import { isWfhPinned, readWfhPin, wfhPinArea } from './wfhPin.js';
import { isWithinAssignedLocation } from './assignmentGeofence.js';

// A house in Brgy. Pawa, Boac (a point inside it on the PSA map).
const house = { latitude: 13.45147, longitude: 121.88398 };
const METER = 1 / 110574;

test('HR pins the WFH house inside the approved barangay', () => {
  assert.deepEqual(readWfhPin({ ...house }, 'Boac', 'Pawa').value, house);
  assert.deepEqual(readWfhPin({ latitude: '13.4514700', longitude: '121.8839800' }, 'Boac', 'Pawa').value, house);
  // No pin sent.
  assert.equal(readWfhPin({}, 'Boac', 'Pawa').value, null);
  assert.equal(readWfhPin({ latitude: null, longitude: null }, 'Boac', 'Pawa').value, null);
  // A pin in another barangay (Brgy. Sawi's middle), or not a position.
  assert.match(readWfhPin({ latitude: 13.44099, longitude: 121.85443 }, 'Boac', 'Pawa').error, /outside Brgy\. Pawa, Boac/);
  assert.match(readWfhPin({ latitude: 'x', longitude: 121.88 }, 'Boac', 'Pawa').error, /Pin the employee's house/);
  assert.match(readWfhPin(house, 'Boac', 'Nowhere').error, /municipality and barangay/);
});

test('a WFH Time In counts within 50 m of the pinned house', () => {
  const area = wfhPinArea({ municipality: 'Boac', barangay: 'Pawa', street: 'Purok 3', landmark: '', ...house });
  assert.equal(area.mode, 'wfh');
  assert.equal(area.source, 'Pinned by HR');
  assert.equal(area.label, 'Purok 3, Pawa, Boac, Marinduque, Philippines');
  assert.equal(isWithinAssignedLocation(house.latitude + 45 * METER, house.longitude, area), true);
  assert.equal(isWithinAssignedLocation(house.latitude + 60 * METER, house.longitude, area), false);
  assert.equal(isWfhPinned(house), true);
  assert.equal(isWfhPinned({ latitude: null, longitude: null }), false);
  assert.equal(isWfhPinned(null), false);
});
