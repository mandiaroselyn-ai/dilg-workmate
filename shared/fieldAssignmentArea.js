import { MARINDUQUE_MUNICIPALITIES } from './marinduqueLocations.js';
import { MARINDUQUE_BARANGAY_AREAS } from './marinduqueBarangayAreas.js';

// A barangay whose field area is one site inside it instead of the whole barangay. Field work in
// Brgy. Tanza, Boac counts only inside the Marinduque State University main campus: the whole
// campus, and nothing around it (the user's choice, 2026-11-25). The outline is OpenStreetMap
// way 817497101, "Marinduque State University" (© OpenStreetMap contributors, ODbL), as
// [longitude, latitude].
const FIELD_SITES = {
  Boac: {
    Tanza: {
      name: 'Marinduque State University campus',
      outline: [
        [121.8431304, 13.4541102], [121.8451931, 13.4526899], [121.8462405, 13.4542302],
        [121.845637, 13.4552854], [121.8447492, 13.4559584], [121.8437829, 13.4555708],
        [121.8436971, 13.4553431], [121.8433973, 13.4545654], [121.8431304, 13.4541102]
      ],
      marginMeters: 0,
      source: 'OpenStreetMap way 817497101 (Marinduque State University)'
    }
  }
};

// The area of one of FIELD_SITES, shaped like a barangay's.
const fieldSiteArea = (municipality, barangay, site) => {
  const corners = site.outline.slice(0, -1);
  const latitudes = corners.map(([, latitude]) => latitude);
  const longitudes = corners.map(([longitude]) => longitude);
  const average = values => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 1e6) / 1e6;
  return {
    mode: 'field',
    municipality,
    barangay,
    label: `${site.name}, Brgy. ${barangay}, ${municipality}, Marinduque, Philippines`,
    query: `${barangay}, ${municipality}, Marinduque, Mimaropa, Philippines`,
    latitude: average(latitudes),
    longitude: average(longitudes),
    geometry: { type: 'Polygon', coordinates: [site.outline] },
    bounds: { south: Math.min(...latitudes), north: Math.max(...latitudes), west: Math.min(...longitudes), east: Math.max(...longitudes) },
    displayName: `${site.name}, Brgy. ${barangay}, ${municipality} (the whole campus)`,
    fallbackToRadius: false,
    areaMarginMeters: site.marginMeters,
    source: site.source
  };
};

// A field assignment's area is its barangay's boundary on the PSA's map, which has every
// barangay in Marinduque, or the one site FIELD_SITES names for it. The server uses it for Time
// In, and the phone app uses it to check the assignment area when it has no internet.
export const resolveFieldAssignment = ({ municipality, barangay }) => {
  const site = MARINDUQUE_MUNICIPALITIES[municipality]?.includes(barangay) ? FIELD_SITES[municipality]?.[barangay] : null;
  if (site) return fieldSiteArea(municipality, barangay, site);
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
