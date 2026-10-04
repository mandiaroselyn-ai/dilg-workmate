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

test('field geofence uses the geocoder extent when only a barangay place pin is available', () => {
  const tanzaLocation = {
    mode: 'field',
    latitude: 13.4564372,
    longitude: 121.8429609,
    bounds: {
      south: 13.4364372,
      north: 13.4764372,
      west: 121.8229609,
      east: 121.8629609
    },
    geometry: { type: 'Point', coordinates: [121.8429609, 13.4564372] },
    fallbackToRadius: true
  };

  assert.equal(isWithinAssignedLocation(13.46, 121.845, tanzaLocation), true);
  assert.equal(isWithinAssignedLocation(13.477, 121.8429609, tanzaLocation), true);
  assert.equal(isWithinAssignedLocation(13.479, 121.8429609, tanzaLocation), false);
});

test('field geofence ignores invalid geocoder extents and falls back to the assigned pin', () => {
  const locationWithInvalidBounds = {
    mode: 'field',
    latitude: 13,
    longitude: 121,
    bounds: { south: 14, north: 13, west: 121, east: 122 },
    geometry: { type: 'Point', coordinates: [121, 13] },
    fallbackToRadius: true
  };

  assert.equal(isWithinAssignedLocation(13, 121, locationWithInvalidBounds), true);
  assert.equal(isWithinAssignedLocation(13.002, 121, locationWithInvalidBounds), false);
});
// Time In positions from the field: John Rey Sol in Libtangin, Gasan and Rimhelyn in Pawa,
// Boac. OpenStreetMap has neither barangay and named them Bangbang and Mampaitan.
const johnReyTimeIn = [13.344339, 121.82456];
const rimhelynTimeIn = [13.452351, 121.880056];
const provincialCapitol = [13.4474, 121.8344];

test('every barangay in the app has its boundary on the PSA map', async () => {
  const { MARINDUQUE_MUNICIPALITIES } = await import('../../../shared/marinduqueLocations.js');
  const { MARINDUQUE_BARANGAY_AREAS } = await import('../../../shared/marinduqueBarangayAreas.js');
  for (const [municipality, barangays] of Object.entries(MARINDUQUE_MUNICIPALITIES)) {
    assert.deepEqual(Object.keys(MARINDUQUE_BARANGAY_AREAS[municipality]), barangays);
    for (const barangay of barangays) {
      const { center, geometry } = MARINDUQUE_BARANGAY_AREAS[municipality][barangay];
      assert.ok(isWithinAssignedLocation(center[0], center[1], { mode: 'field', geometry }, 0), `the center of ${barangay}, ${municipality} is inside it`);
    }
  }
});

test('a field assignment uses its barangay\'s own boundary without asking OpenStreetMap', async t => {
  const { resolveAssignedLocation } = await import('./assignedLocationService.js');
  const lookup = t.mock.method(globalThis, 'fetch', async () => { throw new Error('OpenStreetMap should not be asked'); });

  const libtangin = await resolveAssignedLocation({ mode: 'field', municipality: 'Gasan', barangay: 'Libtangin' });
  assert.equal(libtangin.label, 'Brgy. Libtangin, Gasan, Marinduque, Philippines');
  assert.equal(libtangin.geometry.type, 'Polygon');
  assert.equal(libtangin.fallbackToRadius, false);
  assert.equal(isWithinAssignedLocation(...johnReyTimeIn, libtangin), true);
  assert.equal(isWithinAssignedLocation(...rimhelynTimeIn, libtangin), false);

  const pawa = await resolveAssignedLocation({ mode: 'field', municipality: 'Boac', barangay: 'Pawa' });
  assert.equal(isWithinAssignedLocation(...rimhelynTimeIn, pawa), true);
  assert.equal(isWithinAssignedLocation(...provincialCapitol, pawa), false, 'the Capitol in Santol is outside Pawa');

  const bangbang = await resolveAssignedLocation({ mode: 'field', municipality: 'Gasan', barangay: 'Bangbang' });
  assert.equal(isWithinAssignedLocation(...johnReyTimeIn, bangbang), false, 'the next barangay is not Libtangin');
  assert.equal(lookup.mock.callCount(), 0);
});

test('the barangay at a position comes from the PSA map', async () => {
  const { barangayAt } = await import('./assignedLocationService.js');
  assert.deepEqual(barangayAt(...johnReyTimeIn), { municipality: 'Gasan', barangay: 'Libtangin' });
  assert.deepEqual(barangayAt(...rimhelynTimeIn), { municipality: 'Boac', barangay: 'Pawa' });
  assert.deepEqual(barangayAt(...provincialCapitol), { municipality: 'Boac', barangay: 'Santol' });
  assert.equal(barangayAt(13.40, 121.80), null, 'out at sea');
});

test('a place name is built from the road, barangay, and town', async () => {
  const { shortPlaceName } = await import('./assignedLocationService.js');
  // OpenStreetMap's real answers for two employee positions.
  assert.equal(shortPlaceName({ name: '', address: { village: 'Bangbang', town: 'Gasan', state: 'Marinduque' } }), 'Brgy. Bangbang, Gasan');
  assert.equal(shortPlaceName({ name: '', address: { village: 'Sawi', town: 'Boac' } }), 'Brgy. Sawi, Boac');
  assert.equal(
    shortPlaceName({ name: 'Marinduque Circumferential Road', address: { road: 'Marinduque Circumferential Road', village: 'Tabionan', town: 'Gasan' } }),
    'Marinduque Circumferential Road, Brgy. Tabionan, Gasan'
  );
  assert.equal(shortPlaceName({ name: 'Marinduque State University', address: { road: 'Tanza Road', suburb: 'Tanza', town: 'Boac' } }), 'Marinduque State University, Tanza Road, Brgy. Tanza, Boac');
  assert.equal(shortPlaceName({}), '');
});

test('the PSA barangay replaces the neighboring one OpenStreetMap names', async () => {
  const { shortPlaceName } = await import('./assignedLocationService.js');
  const area = { municipality: 'Gasan', barangay: 'Libtangin' };
  assert.equal(shortPlaceName({ name: '', address: { village: 'Bangbang', town: 'Gasan' } }, area), 'Brgy. Libtangin, Gasan');
  assert.equal(shortPlaceName({ name: 'Bangbang', address: { village: 'Bangbang', town: 'Gasan' } }, area), 'Brgy. Libtangin, Gasan');
  assert.equal(
    shortPlaceName({ name: '', address: { road: 'Marinduque Circumferential Road', village: 'Bangbang', town: 'Gasan' } }, area),
    'Marinduque Circumferential Road, Brgy. Libtangin, Gasan'
  );
  assert.equal(shortPlaceName(null, area), 'Brgy. Libtangin, Gasan');
});

test('place names use the PSA barangay and look up the road once for positions about 100 m apart', async t => {
  const { describePlace } = await import('./assignedLocationService.js');
  const lookup = t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ address: { village: 'Bangbang', town: 'Gasan' } }) }));
  assert.equal(await describePlace(13.3443, 121.8246), 'Brgy. Libtangin, Gasan');
  assert.equal(await describePlace(13.3444, 121.8247), 'Brgy. Libtangin, Gasan');
  assert.equal(lookup.mock.callCount(), 1);
  const url = lookup.mock.calls[0].arguments[0];
  assert.equal(url.pathname, '/reverse');
  assert.equal(url.searchParams.get('lat'), '13.3443');
});

test('the barangay is still named when OpenStreetMap is unavailable', async t => {
  const { describePlace } = await import('./assignedLocationService.js');
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 503 }));
  assert.equal(await describePlace(...rimhelynTimeIn), 'Brgy. Pawa, Boac');
  await assert.rejects(describePlace(13.40, 121.80), /temporarily unavailable/, 'out at sea there is nothing to name');
});
