import { MARINDUQUE_MUNICIPALITIES, MARINDUQUE_OFFICES } from '../../../shared/marinduqueLocations.js';
import { isWithinAssignedLocation } from '../../../shared/assignmentGeofence.js';

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

class LocationNotFoundError extends Error {}

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

// A short name for a place from OpenStreetMap's address details, such as
// "Marinduque Circumferential Rd, Brgy. Sawi, Boac" (barangays are villages on the map).
export const shortPlaceName = result => {
  const address = result?.address || {};
  const barangay = address.village || address.suburb || address.quarter || address.neighbourhood || address.hamlet;
  const parts = [
    result?.name,
    address.road,
    barangay && `Brgy. ${barangay}`,
    address.town || address.city || address.municipality
  ].filter(Boolean);
  return parts.filter((part, index) => parts.findIndex(other => lower(other) === lower(part)) === index).join(', ');
};

// The name of the place at a GPS position, for HR's live map. Positions about 100 m
// apart share a cached name.
export const describePlace = async (latitude, longitude) => {
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
  const place = shortPlaceName(await response.json());
  cache.set(cacheKey, { value: place, expiresAt: Date.now() + CACHE_TTL_MS });
  return place;
};

const isArea = item => ['Polygon', 'MultiPolygon'].includes(item.geojson?.type);
const lower = value => String(value || '').trim().toLowerCase();

// OpenStreetMap results that are the barangay itself (a village or barangay boundary in
// the right municipality), not a river, bridge, or road that shares its name. A search
// for "Libtangin, Gasan" once returned only the Libtangin River and Libtangin Bridge, and
// the bridge became the assigned area. Exact name matches come first.
export const barangayMatches = (results, { barangay, municipality }) => results
  .filter(item => (item.category === 'place' || (item.category === 'boundary' && item.type === 'administrative'))
    && Number(item.place_rank) >= 17
    && lower(item.display_name).includes(lower(municipality)))
  .sort((a, b) => Number(lower(b.name) === lower(barangay)) - Number(lower(a.name) === lower(barangay)));

// The municipality's own boundary.
export const municipalityMatches = (results, { municipality }) => results
  .filter(item => item.category === 'boundary' && item.type === 'administrative' && lower(item.name) === lower(municipality));

// Finds a place on OpenStreetMap. `boundary` asks for its outline; `pick` keeps and orders
// the results that are the right kind of place (by default, all of them).
const geocode = async (query, { boundary: includeBoundary = false, kind = 'any', pick = results => results } = {}) => {
  const cacheKey = `${query}|${includeBoundary ? 'boundary' : 'point'}|${kind}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const existing = cache.get(`pending:${cacheKey}`);
  if (existing) return existing.promise;

  const promise = (async () => {
    await takeTurn();

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', includeBoundary ? '10' : '1');
    url.searchParams.set('countrycodes', 'ph');
    url.searchParams.set('viewbox', '121.45,13.10,122.25,13.65');
    url.searchParams.set('bounded', '1');
    url.searchParams.set('q', query);
    if (includeBoundary) url.searchParams.set('polygon_geojson', '1');

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT()
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('Location service is temporarily unavailable. Retry in a moment.');

    const results = await response.json();
    const candidates = pick(results.filter(item => item.lat && item.lon));
    const result = candidates.find(item => !includeBoundary || isArea(item))
      || (includeBoundary ? candidates[0] : null);
    if (!result) throw new LocationNotFoundError('Could not find coordinates for this address. Check the selected barangay/address and retry.');

    const [south, north, west, east] = (result.boundingbox || []).map(Number);
    const bounds = [south, north, west, east].every(Number.isFinite)
      ? { south, north, west, east }
      : null;
    const value = {
      latitude: Number(result.lat),
      longitude: Number(result.lon),
      geometry: result.geojson || null,
      bounds,
      displayName: result.display_name,
      fallbackToRadius: includeBoundary && !isArea(result),
      source: 'OpenStreetMap'
    };
    cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  })().finally(() => cache.delete(`pending:${cacheKey}`));

  cache.set(`pending:${cacheKey}`, { promise });
  return promise;
};

export const resolveAssignedLocation = async assignment => {
  const normalized = buildQuery(assignment);
  if (normalized.mode !== 'field') return { ...normalized, ...(await geocode(normalized.query)) };

  try {
    const area = await geocode(normalized.query, {
      boundary: true,
      kind: 'barangay',
      pick: results => barangayMatches(results, normalized)
    });
    return { ...normalized, ...area };
  } catch (error) {
    if (!(error instanceof LocationNotFoundError)) throw error;
  }

  // Some barangays are not on OpenStreetMap at all, so the whole municipality is used.
  const town = await geocode(`${normalized.municipality}, Marinduque, Mimaropa, Philippines`, {
    boundary: true,
    kind: 'municipality',
    pick: results => municipalityMatches(results, normalized)
  });
  return {
    ...normalized,
    ...town,
    label: `${normalized.municipality}, Marinduque - Brgy. ${normalized.barangay} is not on the map, so the whole town is used`
  };
};
