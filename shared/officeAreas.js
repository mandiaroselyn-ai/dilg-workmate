import { MARINDUQUE_OFFICES } from './marinduqueLocations.js';

// DILG offices whose grounds are mapped, so their geofence is the whole compound instead of a
// radius around one map point. The DILG Provincial Office is in the Marinduque Provincial
// Capitol Compound in Brgy. Bangbangalon, Boac. Its outline is the government lot around the
// Capitol on OpenStreetMap (way 813008012, © OpenStreetMap contributors, ODbL), between the
// Marinduque Circumferential Road, Bangbangalon Elementary School, and the Provincial Hospital,
// with the Capitol and the Hall of Justice inside it.
const OFFICE_AREAS = {
  provincial: {
    name: 'Marinduque Provincial Capitol Compound',
    // The Capitol building (OpenStreetMap way 813008047), where the map is centered.
    center: [13.4419838, 121.8277131],
    // [longitude, latitude], as GeoJSON writes them.
    outline: [
      [121.8276051, 13.4409606],
      [121.8289436, 13.4420282],
      [121.8277461, 13.4433978],
      [121.8270896, 13.4428784],
      [121.8269299, 13.4427691],
      [121.8267362, 13.4426720],
      [121.8270278, 13.4422956],
      [121.8265926, 13.4419917],
      [121.8276051, 13.4409606]
    ]
  }
};

// The assignment area of an office whose grounds are mapped (`officeId`, such as 'provincial'),
// shaped like the other assignment areas, or null for an office found on OpenStreetMap by its
// address. The server uses it for Time In and Time Out, and the phone app when it has no internet.
export const resolveOfficeArea = officeId => {
  const area = OFFICE_AREAS[officeId];
  const office = MARINDUQUE_OFFICES.find(item => item.id === officeId);
  if (!area || !office) return null;
  const [latitude, longitude] = area.center;
  const longitudes = area.outline.map(([lon]) => lon);
  const latitudes = area.outline.map(([, lat]) => lat);
  return {
    mode: 'office',
    municipality: office.municipality,
    barangay: office.barangay,
    officeId: office.id,
    label: `${office.name}, ${area.name}, Brgy. ${office.barangay}, ${office.municipality}, Marinduque, Philippines`,
    query: office.address,
    latitude,
    longitude,
    geometry: { type: 'Polygon', coordinates: [area.outline] },
    bounds: { south: Math.min(...latitudes), north: Math.max(...latitudes), west: Math.min(...longitudes), east: Math.max(...longitudes) },
    displayName: `${area.name}, Brgy. ${office.barangay}, ${office.municipality} (OpenStreetMap)`,
    fallbackToRadius: false,
    source: 'OpenStreetMap way 813008012'
  };
};
