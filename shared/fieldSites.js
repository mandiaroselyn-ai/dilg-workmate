import { MARINDUQUE_MUNICIPALITIES } from './marinduqueLocations.js';

// A barangay's field site: the one place in the barangay where field work there counts, such as
// its barangay hall, set by HR on the map. Field work in a barangay with a site counts within
// `radiusMeters` of it, instead of anywhere in the barangay (a Marinduque barangay is often 1 to
// 3 km across, so anywhere in it was too wide; the user's choice, 2026-11-25). A barangay without
// one still counts as a whole. Most barangay halls in Marinduque are not on OpenStreetMap, so HR
// marks each one once.

export const FIELD_SITE_RADIUS_OPTIONS = [50, 100, 150, 200, 300];
export const DEFAULT_FIELD_SITE_RADIUS = 100;
export const DEFAULT_FIELD_SITE_NAME = 'Barangay Hall';
const NAME_MAX = 80;

// Marinduque and its islets, with room to spare: a site outside this is a mistake.
const MARINDUQUE_BOX = { south: 13.05, north: 13.65, west: 121.75, east: 122.25 };

// The site HR sends ({ municipality, barangay, name, latitude, longitude, radiusMeters }), checked.
// Returns { value } or { error }. Whether the point is in the barangay is checked by the server
// against the barangay map (see fieldSiteInBarangayProblem).
export const readFieldSite = body => {
  const municipality = typeof body?.municipality === 'string' ? body.municipality.trim() : '';
  const barangay = typeof body?.barangay === 'string' ? body.barangay.trim() : '';
  if (!MARINDUQUE_MUNICIPALITIES[municipality]?.includes(barangay)) return { error: 'Choose the municipality and barangay of the field site.' };
  const name = (typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '') || DEFAULT_FIELD_SITE_NAME;
  if (name.length > NAME_MAX) return { error: `The site name must be ${NAME_MAX} characters or fewer.` };
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  if (body?.latitude == null || body?.longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < MARINDUQUE_BOX.south || latitude > MARINDUQUE_BOX.north || longitude < MARINDUQUE_BOX.west || longitude > MARINDUQUE_BOX.east) {
    return { error: 'Mark the field site on the map, in Marinduque.' };
  }
  const radiusMeters = body?.radiusMeters == null || body.radiusMeters === '' ? DEFAULT_FIELD_SITE_RADIUS : Number(body.radiusMeters);
  if (!FIELD_SITE_RADIUS_OPTIONS.includes(radiusMeters)) return { error: `Choose the range: ${FIELD_SITE_RADIUS_OPTIONS.join(', ')} meters.` };
  return {
    value: {
      municipality,
      barangay,
      name,
      latitude: Math.round(latitude * 1e6) / 1e6,
      longitude: Math.round(longitude * 1e6) / 1e6,
      radiusMeters
    }
  };
};

// How far past its barangay's boundary a site may be (the PSA boundaries are simplified, and a
// barangay hall can sit on the road that is the boundary).
export const SITE_OUTSIDE_BARANGAY_METERS = 150;

// The assignment area of a barangay's field site, shaped like the other field areas: a circle
// of `radiusMeters` around the site.
export const fieldSiteArea = site => {
  const latitudeSpan = site.radiusMeters / 110574;
  const longitudeSpan = site.radiusMeters / (111320 * Math.cos(site.latitude * Math.PI / 180));
  return {
    mode: 'field',
    municipality: site.municipality,
    barangay: site.barangay,
    label: `${site.name}, Brgy. ${site.barangay}, ${site.municipality}, Marinduque, Philippines`,
    query: `${site.barangay}, ${site.municipality}, Marinduque, Mimaropa, Philippines`,
    latitude: site.latitude,
    longitude: site.longitude,
    radiusMeters: site.radiusMeters,
    areaName: site.name,
    bounds: {
      south: site.latitude - latitudeSpan,
      north: site.latitude + latitudeSpan,
      west: site.longitude - longitudeSpan,
      east: site.longitude + longitudeSpan
    },
    displayName: `${site.name}, Brgy. ${site.barangay}, ${site.municipality} (within ${site.radiusMeters} m)`,
    fallbackToRadius: false,
    source: 'Field site set by HR'
  };
};
