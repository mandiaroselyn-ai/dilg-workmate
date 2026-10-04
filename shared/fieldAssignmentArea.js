import { MARINDUQUE_MUNICIPALITIES } from './marinduqueLocations.js';
import { MARINDUQUE_BARANGAY_AREAS } from './marinduqueBarangayAreas.js';

// A field assignment's area is its barangay's boundary on the PSA's map, which has every
// barangay in Marinduque. The server uses it for Time In, and the phone app uses it to
// check the assignment area when it has no internet.
export const resolveFieldAssignment = ({ municipality, barangay }) => {
  const area = MARINDUQUE_MUNICIPALITIES[municipality]?.includes(barangay)
    ? MARINDUQUE_BARANGAY_AREAS[municipality]?.[barangay]
    : null;
  if (!area) throw new Error('Choose a barangay from the selected municipality.');
  const [latitude, longitude] = area.center;
  const [south, north, west, east] = area.bounds;
  return {
    mode: 'field',
    municipality,
    barangay,
    label: `Brgy. ${barangay}, ${municipality}, Marinduque, Philippines`,
    query: `${barangay}, ${municipality}, Marinduque, Mimaropa, Philippines`,
    latitude,
    longitude,
    geometry: area.geometry,
    bounds: { south, north, west, east },
    displayName: `Brgy. ${barangay}, ${municipality}, Marinduque (PSA barangay boundary)`,
    fallbackToRadius: false,
    source: 'PSA barangay boundaries'
  };
};
