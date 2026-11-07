import { GEOFENCE_METERS } from './assignmentGeofence.js';
import { MARINDUQUE_OFFICES } from './marinduqueLocations.js';

// The grounds of the DILG offices on OpenStreetMap (© OpenStreetMap contributors, ODbL), so each
// office's geofence is its own building or compound instead of a radius around a map search,
// which finds nothing for most of them. `marginMeters` is how far past the outline still counts.
// - The DILG Provincial Office is in the Marinduque Provincial Capitol Compound in Brgy.
//   Bangbangalon, Boac: the government lot around the Capitol (way 813008012), between the
//   Marinduque Circumferential Road, Bangbangalon Elementary School, and the Provincial
//   Hospital, with the Capitol and the Hall of Justice inside it. It counts only inside.
// - Each MLGOO's office is in its town hall, a single building, so 50 m around it counts too,
//   for GPS that wanders inside a building. Torrijos's town hall is the one unnamed town hall
//   in its poblacion.
// Outlines are [longitude, latitude], as GeoJSON writes them.
const OFFICE_AREAS = {
  provincial: {
    name: 'Marinduque Provincial Capitol Compound',
    way: 813008012,
    // The Capitol building (way 813008047), where the map is centered.
    center: [13.4419838, 121.8277131],
    marginMeters: 0,
    outline: [[121.8276051, 13.4409606], [121.8289436, 13.4420282], [121.8277461, 13.4433978], [121.8270896, 13.4428784], [121.8269299, 13.4427691], [121.8267362, 13.4426720], [121.8270278, 13.4422956], [121.8265926, 13.4419917], [121.8276051, 13.4409606]]
  },
  boac: {
    name: 'Boac Municipal Hall',
    way: 535064376,
    marginMeters: GEOFENCE_METERS,
    outline: [[121.8412851, 13.4467951], [121.8414707, 13.4466862], [121.8415754, 13.4464098], [121.8419366, 13.4465569], [121.8418251, 13.4468166], [121.8417802, 13.4468210], [121.8416304, 13.4472062], [121.8415388, 13.4471476], [121.8414615, 13.4470640], [121.8412851, 13.4467951]]
  },
  buenavista: {
    name: 'Buenavista Municipal Hall',
    way: 1537036823,
    marginMeters: GEOFENCE_METERS,
    outline: [[121.9429844, 13.2563376], [121.9430737, 13.2565101], [121.9432627, 13.2564174], [121.9431735, 13.2562449], [121.9429844, 13.2563376]]
  },
  gasan: {
    name: 'Gasan Municipal Building',
    way: 679954486,
    marginMeters: GEOFENCE_METERS,
    outline: [[121.8464188, 13.3243026], [121.8466102, 13.3243172], [121.8466343, 13.3240183], [121.8464430, 13.3240037], [121.8464188, 13.3243026]]
  },
  mogpog: {
    name: 'Mogpog Municipal Hall',
    way: 534745295,
    marginMeters: GEOFENCE_METERS,
    outline: [[121.8598507, 13.4739400], [121.8600720, 13.4735748], [121.8606654, 13.4739211], [121.8604448, 13.4742947], [121.8598507, 13.4739400]]
  },
  'santa-cruz': {
    name: 'Santa Cruz Town Hall',
    way: 316170127,
    marginMeters: GEOFENCE_METERS,
    outline: [[122.0283334, 13.4762739], [122.0284070, 13.4762339], [122.0283022, 13.4760514], [122.0282286, 13.4760914], [122.0282685, 13.4761609], [122.0282258, 13.4761840], [122.0282609, 13.4762451], [122.0283036, 13.4762219], [122.0283334, 13.4762739]]
  },
  torrijos: {
    name: 'Torrijos Municipal Hall',
    way: 420152681,
    marginMeters: GEOFENCE_METERS,
    outline: [[122.0860290, 13.3210596], [122.0861600, 13.3209046], [122.0860113, 13.3207737], [122.0858751, 13.3209339], [122.0860290, 13.3210596]]
  }
};

// The middle of an outline's corners, for where the map is centered.
const middleOf = outline => {
  const corners = outline.slice(0, -1);
  return [corners.reduce((sum, [, lat]) => sum + lat, 0) / corners.length, corners.reduce((sum, [lon]) => sum + lon, 0) / corners.length];
};

// The assignment area of a DILG office (`officeId`, such as 'provincial' or 'boac'), shaped like
// the other assignment areas, or null for an office with no mapped grounds. The server uses it
// for Time In and Time Out, and the phone app when it has no internet.
export const resolveOfficeArea = officeId => {
  const area = OFFICE_AREAS[officeId];
  const office = MARINDUQUE_OFFICES.find(item => item.id === officeId);
  if (!area || !office) return null;
  const [latitude, longitude] = area.center || middleOf(area.outline);
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
    areaName: area.name,
    areaMarginMeters: area.marginMeters,
    bounds: { south: Math.min(...latitudes), north: Math.max(...latitudes), west: Math.min(...longitudes), east: Math.max(...longitudes) },
    displayName: `${area.name}, Brgy. ${office.barangay}, ${office.municipality} (OpenStreetMap)`,
    fallbackToRadius: false,
    source: `OpenStreetMap way ${area.way}`
  };
};
