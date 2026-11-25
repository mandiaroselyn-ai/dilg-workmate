import { MARINDUQUE_MUNICIPALITIES } from './marinduqueLocations.js';
import { MARINDUQUE_BARANGAY_AREAS } from './marinduqueBarangayAreas.js';
import { distanceToAreaMeters } from './assignmentGeofence.js';
import { SITE_OUTSIDE_BARANGAY_METERS, fieldSiteArea } from './fieldSites.js';

// A barangay whose field area is one site inside it, built in, instead of the whole barangay.
// Field work in Brgy. Tanza, Boac counts only inside the Marinduque State University main
// campus: the whole campus, and nothing around it (the user's choice, 2026-11-25). The outline
// is OpenStreetMap way 817497101, "Marinduque State University" (© OpenStreetMap contributors,
// ODbL), as [longitude, latitude]. HR cannot set another site for it (shared/fieldSites.js).
const BUILT_IN_FIELD_SITES = {
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

// The name of the built-in site of a barangay, or '' when it has none.
export const builtInFieldSiteName = (municipality, barangay) => BUILT_IN_FIELD_SITES[municipality]?.[barangay]?.name || '';

// The area of one of BUILT_IN_FIELD_SITES, shaped like a barangay's.
const builtInSiteArea = (municipality, barangay, site) => {
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
    areaName: site.name,
    displayName: `${site.name}, Brgy. ${barangay}, ${municipality} (the whole campus)`,
    fallbackToRadius: false,
    areaMarginMeters: site.marginMeters,
    source: site.source
  };
};

// Why HR's field site `site` ({ municipality, barangay, latitude, longitude }) cannot be saved,
// or '' when it can: a barangay with a built-in site keeps it, and the site must be in its
// barangay (or within SITE_OUTSIDE_BARANGAY_METERS of its boundary on the PSA map).
export const fieldSiteProblem = site => {
  const builtIn = builtInFieldSiteName(site.municipality, site.barangay);
  if (builtIn) return `Field work in Brgy. ${site.barangay}, ${site.municipality} already counts only inside the ${builtIn}.`;
  const area = MARINDUQUE_BARANGAY_AREAS[site.municipality]?.[site.barangay];
  if (!area) return 'Choose the municipality and barangay of the field site.';
  return distanceToAreaMeters(site.latitude, site.longitude, area.geometry) > SITE_OUTSIDE_BARANGAY_METERS
    ? `The marked place is outside Brgy. ${site.barangay}, ${site.municipality}. Mark the site inside the barangay.`
    : '';
};

// A field assignment's area, the server's for Time In and the phone app's when it has no
// internet: the barangay's built-in site (Brgy. Tanza's campus), else the field site HR set for
// it (among `sites`, as shared/fieldSites.js keeps them), else the whole barangay on the PSA's
// map, which has every barangay in Marinduque.
export const resolveFieldAssignment = ({ municipality, barangay }, sites = []) => {
  const known = MARINDUQUE_MUNICIPALITIES[municipality]?.includes(barangay);
  const builtIn = known ? BUILT_IN_FIELD_SITES[municipality]?.[barangay] : null;
  if (builtIn) return builtInSiteArea(municipality, barangay, builtIn);
  const site = known ? (sites || []).find(item => item?.municipality === municipality && item?.barangay === barangay) : null;
  if (site) return fieldSiteArea(site);
  const area = known ? MARINDUQUE_BARANGAY_AREAS[municipality]?.[barangay] : null;
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
