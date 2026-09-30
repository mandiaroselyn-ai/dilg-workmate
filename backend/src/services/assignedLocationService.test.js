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
// Shaped like OpenStreetMap's real answers for "Libtangin, Gasan": the barangay itself is
// not on the map, only a river, its delta, and a bridge that share its name.
const libtanginResults = [
  { category: 'waterway', type: 'river', name: 'Libtangin River', place_rank: 22, display_name: 'Libtangin River, Cabugao, Gasan, Marinduque, Philippines', lat: '13.3676722', lon: '121.8486156', boundingbox: ['13.3434201', '13.3835102', '121.8208526', '121.8648255'], geojson: { type: 'LineString' } },
  { category: 'waterway', type: 'stream', name: 'Libtangin River Delta', place_rank: 22, display_name: 'Libtangin River Delta, Bangbang, Gasan, Marinduque, Philippines', lat: '13.3446117', lon: '121.8217486', boundingbox: ['13.3437485', '13.3458611', '121.8207668', '121.8220940'], geojson: { type: 'LineString' } },
  { category: 'man_made', type: 'bridge', name: 'Libtangin Bridge', place_rank: 30, display_name: 'Libtangin Bridge, Bangbang, Gasan, Marinduque, Philippines', lat: '13.3500410', lon: '121.8323198', boundingbox: ['13.3494346', '13.3506473', '121.8319013', '121.8327383'], geojson: { type: 'Polygon', coordinates: [[[121.8319, 13.3494], [121.8327, 13.3494], [121.8327, 13.3506], [121.8319, 13.3506], [121.8319, 13.3494]]] } }
];
const bangbangResult = { category: 'place', type: 'village', name: 'Bangbang', place_rank: 19, display_name: 'Bangbang, Gasan, Marinduque, Philippines', lat: '13.3428773', lon: '121.8231', boundingbox: ['13.3228773', '13.3628773', '121.8031', '121.8431'], geojson: { type: 'Point', coordinates: [121.8231, 13.3428773] } };
const gasanResult = { category: 'boundary', type: 'administrative', name: 'Gasan', place_rank: 12, display_name: 'Gasan, Marinduque, Philippines', lat: '13.32', lon: '121.85', boundingbox: ['13.25', '13.40', '121.78', '121.93'], geojson: { type: 'Polygon', coordinates: [[[121.78, 13.25], [121.93, 13.25], [121.93, 13.40], [121.78, 13.40], [121.78, 13.25]]] } };

test('a river or bridge that shares a barangay\'s name is never used as the barangay', async () => {
  const { barangayMatches } = await import('./assignedLocationService.js');
  assert.deepEqual(barangayMatches(libtanginResults, { barangay: 'Libtangin', municipality: 'Gasan' }), []);
  assert.deepEqual(barangayMatches([gasanResult], { barangay: 'Libtangin', municipality: 'Gasan' }), [], 'the whole town is not a barangay');
  assert.deepEqual(barangayMatches([...libtanginResults, bangbangResult], { barangay: 'Bangbang', municipality: 'Gasan' }), [bangbangResult]);
  assert.deepEqual(barangayMatches([bangbangResult], { barangay: 'Bangbang', municipality: 'Boac' }), [], 'a barangay of another town');
});

test('the municipality boundary is found by its name', async () => {
  const { municipalityMatches } = await import('./assignedLocationService.js');
  assert.deepEqual(municipalityMatches([...libtanginResults, bangbangResult, gasanResult], { municipality: 'Gasan' }), [gasanResult]);
});

test('a barangay that is not on the map uses its whole municipality', async t => {
  const { resolveAssignedLocation } = await import('./assignedLocationService.js');
  const queries = [];
  t.mock.method(globalThis, 'fetch', async url => {
    queries.push(url.searchParams.get('q'));
    const body = url.searchParams.get('q').startsWith('Libtangin') ? libtanginResults : [gasanResult];
    return { ok: true, json: async () => body };
  });

  const site = await resolveAssignedLocation({ mode: 'field', municipality: 'Gasan', barangay: 'Libtangin' });

  assert.deepEqual(queries, ['Libtangin, Gasan, Marinduque, Mimaropa, Philippines', 'Gasan, Marinduque, Mimaropa, Philippines']);
  assert.match(site.label, /Brgy\. Libtangin is not on the map, so the whole town is used/);
  assert.equal(site.barangay, 'Libtangin');
  // The employee's GPS from the report: 1052 m from the bridge, inside Gasan.
  assert.equal(isWithinAssignedLocation(13.344325, 121.824574, site), true);
  assert.equal(isWithinAssignedLocation(13.4474, 121.8344, site), false, 'Boac is still outside');
});
