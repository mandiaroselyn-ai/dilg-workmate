import { MARINDUQUE_MUNICIPALITIES, MARINDUQUE_OFFICES } from '../../../shared/marinduqueLocations.js';
import { distanceToAreaMeters } from '../../../shared/assignmentGeofence.js';
import { MARINDUQUE_BARANGAY_AREAS } from '../data/marinduqueBarangayAreas.js';

export { isWithinAssignedLocation } from '../../../shared/assignmentGeofence.js';

const cache = new Map();
let lastRequestAt = 0;
let pendingRequest = Promise.resolve();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_REQUEST_GAP_MS = 1100;

const normalize = value => typeof value === 'string' ? value.trim() : '';

const buildQuery = assignment => {
  const mode = normalize(assignment?.mode);
  const municipality = normalize(assignment?.municipality);
  if (!['field', 'office', 'wfh'].includes(mode) || !MARINDUQUE_MUNICIPALITIES[municipality]) {
    throw new Error('Choose a valid Marinduque work location.');
  }

  if (mode === 'office') {
    const office = MARINDUQUE_OFFICES.find(item => item.id === assignment.officeId);
    if (!office || office.municipality !== municipality) throw new Error('Choose a valid DILG office.');
    return {
      mode,
      municipality,
      barangay: office.barangay,
      label: `${office.name}, Brgy. ${office.barangay}, ${municipality}, Marinduque, Philippines`,
      query: `${office.address}, Philippines`
    };
  }

  const barangay = normalize(assignment.barangay);
  if (!MARINDUQUE_MUNICIPALITIES[municipality].includes(barangay)) {
    throw new Error('Choose a barangay from the selected municipality.');
  }

  if (mode === 'field') {
    return {
      mode,
      municipality,
      barangay,
      label: `Brgy. ${barangay}, ${municipality}, Marinduque, Philippines`,
      query: `${barangay}, ${municipality}, Marinduque, Mimaropa, Philippines`
    };
  }

  const street = normalize(assignment.street).slice(0, 120);
  const landmark = normalize(assignment.landmark).slice(0, 120);
  const address = [street, landmark, barangay, municipality, 'Marinduque', 'Philippines'].filter(Boolean);
  return {
    mode,
    municipality,
    barangay,
    street,
    landmark,
    label: address.join(', '),
    query: address.join(', ')
  };
};

const USER_AGENT = () => `DILGWorkMate/1.0 (${process.env.FRONTEND_URL || 'https://dilg-workmate.vercel.app'})`;

// OpenStreetMap's free service allows about one request a second, so requests wait
// their turn.
const takeTurn = () => {
  pendingRequest = pendingRequest.then(async () => {
    const delay = Math.max(0, MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    lastRequestAt = Date.now();
  });
  return pendingRequest;
};

const lower = value => String(value || '').trim().toLowerCase();

// The barangay at a GPS position on the PSA's barangay map: the one it is inside, or else
// the nearest one within 150 m (the simplified boundaries leave thin gaps along shared
// borders and the shore). Null when the position is not in Marinduque.
export const barangayAt = (latitude, longitude) => {
  let nearest = null;
  for (const [municipality, barangays] of Object.entries(MARINDUQUE_BARANGAY_AREAS)) {
    for (const [barangay, area] of Object.entries(barangays)) {
      const [south, north, west, east] = area.bounds;
      if (latitude < south - 0.002 || latitude > north + 0.002 || longitude < west - 0.002 || longitude > east + 0.002) continue;
      const distance = distanceToAreaMeters(latitude, longitude, area.geometry);
      if (distance === 0) return { municipality, barangay };
      if (distance <= 150 && (!nearest || distance < nearest.distance)) nearest = { municipality, barangay, distance };
    }
  }
  return nearest && { municipality: nearest.municipality, barangay: nearest.barangay };
};

// A short name for a place from OpenStreetMap's address details, such as
// "Marinduque Circumferential Rd, Brgy. Sawi, Boac". `area` is the barangay from the PSA's
// map, which replaces OpenStreetMap's barangay and town (OpenStreetMap is missing many
// barangays and names a neighboring one instead).
export const shortPlaceName = (result, area = null) => {
  const address = result?.address || {};
  const mapBarangay = address.village || address.suburb || address.quarter || address.neighbourhood || address.hamlet;
  const mapTown = address.town || address.city || address.municipality;
  const barangay = area?.barangay || mapBarangay;
  const street = [result?.name, address.road]
    .filter(part => part && ![mapBarangay, mapTown].some(name => lower(name) === lower(part)));
  const parts = [...street, barangay && `Brgy. ${barangay}`, area?.municipality || mapTown].filter(Boolean);
  return parts.filter((part, index) => parts.findIndex(other => lower(other) === lower(part)) === index).join(', ');
};

// OpenStreetMap's address details at a GPS position. Positions about 100 m apart share a
// cached answer.
const reverseLookup = async (latitude, longitude) => {
  const cacheKey = `reverse|${latitude.toFixed(3)},${longitude.toFixed(3)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  await takeTurn();
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('zoom', '18');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'en');
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT() },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('Place names are temporarily unavailable. Retry in a moment.');
  const value = await response.json();
  cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
};

// The name of the place at a GPS position, for HR's live map: the road from
// OpenStreetMap, and the barangay and town from the PSA's map. When OpenStreetMap is
// unavailable, the barangay and town alone.
export const describePlace = async (latitude, longitude) => {
  const area = barangayAt(latitude, longitude);
  try {
    return shortPlaceName(await reverseLookup(latitude, longitude), area);
  } catch (error) {
    if (!area) throw error;
    return shortPlaceName(null, area);
  }
};

// Finds the point for an address on OpenStreetMap.
const geocode = async query => {
  const cached = cache.get(query);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const existing = cache.get(`pending:${query}`);
  if (existing) return existing.promise;

  const promise = (async () => {
    await takeTurn();

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'ph');
    url.searchParams.set('viewbox', '121.45,13.10,122.25,13.65');
    url.searchParams.set('bounded', '1');
    url.searchParams.set('q', query);

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT()
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('Location service is temporarily unavailable. Retry in a moment.');

    const result = (await response.json()).find(item => item.lat && item.lon);
    if (!result) throw new Error('Could not find coordinates for this address. Check the selected barangay/address and retry.');

    const [south, north, west, east] = (result.boundingbox || []).map(Number);
    const bounds = [south, north, west, east].every(Number.isFinite)
      ? { south, north, west, east }
      : null;
    const value = {
      latitude: Number(result.lat),
      longitude: Number(result.lon),
      geometry: null,
      bounds,
      displayName: result.display_name,
      fallbackToRadius: false,
      source: 'OpenStreetMap'
    };
    cache.set(query, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  })().finally(() => cache.delete(`pending:${query}`));

  cache.set(`pending:${query}`, { promise });
  return promise;
};

// A field assignment's area is its barangay's boundary on the PSA's map, which has every
// barangay in Marinduque. Offices and WFH addresses are points found on OpenStreetMap.
export const resolveAssignedLocation = async assignment => {
  const normalized = buildQuery(assignment);
  if (normalized.mode !== 'field') return { ...normalized, ...(await geocode(normalized.query)) };

  const area = MARINDUQUE_BARANGAY_AREAS[normalized.municipality][normalized.barangay];
  const [latitude, longitude] = area.center;
  const [south, north, west, east] = area.bounds;
  return {
    ...normalized,
    latitude,
    longitude,
    geometry: area.geometry,
    bounds: { south, north, west, east },
    displayName: `Brgy. ${normalized.barangay}, ${normalized.municipality}, Marinduque (PSA barangay boundary)`,
    fallbackToRadius: false,
    source: 'PSA barangay boundaries'
  };
};
