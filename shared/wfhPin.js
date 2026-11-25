import { MARINDUQUE_BARANGAY_AREAS } from './marinduqueBarangayAreas.js';
import { distanceToAreaMeters } from './assignmentGeofence.js';

// The house HR pins on the map when approving an employee's work-from-home location. A WFH Time
// In counts within 50 m of it. Before pins, the house was searched on OpenStreetMap by its street
// and barangay, which finds almost no purok or street in Marinduque ("Purok 3, Pawa, Boac" and
// "Rizal Street, Pawa, Boac" were not found, and "Pawa, Boac" gave Pawa Elementary School), so the
// WFH area was missing or somewhere else (the user's choice to pin, 2026-11-25). An approval saved
// before pins keeps working by that search until HR pins it.

// How far past its barangay's boundary on the PSA map a pinned house may be (the boundaries are
// simplified, and a house can be on the road that is the boundary).
export const PIN_OUTSIDE_BARANGAY_METERS = 200;

// The pin HR sends with the approved WFH location ({ latitude, longitude }), checked against the
// approved barangay. Returns { value: { latitude, longitude } }, { value: null } when no pin was
// sent, or { error }.
export const readWfhPin = (location, municipality, barangay) => {
  const given = location?.latitude != null && location?.latitude !== '' && location?.longitude != null && location?.longitude !== '';
  if (!given) return { value: null };
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { error: 'Pin the employee\'s house on the map.' };
  const area = MARINDUQUE_BARANGAY_AREAS[municipality]?.[barangay];
  if (!area) return { error: 'Choose the municipality and barangay of the WFH location first.' };
  if (distanceToAreaMeters(latitude, longitude, area.geometry) > PIN_OUTSIDE_BARANGAY_METERS) {
    return { error: `The pinned house is outside Brgy. ${barangay}, ${municipality}. Pin the house inside the barangay.` };
  }
  return { value: { latitude: Math.round(latitude * 1e6) / 1e6, longitude: Math.round(longitude * 1e6) / 1e6 } };
};

// Whether an approved WFH location has its house pinned.
export const isWfhPinned = location => Number.isFinite(Number(location?.latitude)) && Number.isFinite(Number(location?.longitude))
  && location?.latitude != null && location?.longitude != null;

// The WFH assignment area of a pinned house, shaped like the others: within 50 m of the pin
// (the Time In check's radius for an address).
export const wfhPinArea = site => {
  const address = [site.street, site.landmark, site.barangay, site.municipality, 'Marinduque', 'Philippines'].filter(Boolean).join(', ');
  return {
    mode: 'wfh',
    municipality: site.municipality,
    barangay: site.barangay,
    street: site.street || '',
    landmark: site.landmark || '',
    label: address,
    query: address,
    latitude: Number(site.latitude),
    longitude: Number(site.longitude),
    geometry: null,
    bounds: null,
    displayName: `${address} (pinned by HR)`,
    fallbackToRadius: false,
    source: 'Pinned by HR'
  };
};
