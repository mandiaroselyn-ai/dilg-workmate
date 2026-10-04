// Builds shared/marinduqueBarangayAreas.js: the boundary of every barangay in
// Marinduque, from the PSA/NAMRIA barangay shapefile (PSGC as of 31 December 2023) as
// published by altcoder/philippines-psgc-shapefiles (MIT License). OpenStreetMap is
// missing about 90 of Marinduque's 218 barangays, so assigned areas and place names use
// this map instead. Boundaries are kept within 5 m of the original.
//
// 1. Download and unzip (383 MB) https://media.githubusercontent.com/media/altcoder/philippines-psgc-shapefiles/main/dist/PH_Adm4_BgySubMuns.shp.zip
// 2. In the folder you run this from: npm install shapefile proj4
// 3. node <repo>/backend/scripts/buildBarangayAreas.mjs <unzipped folder>/PH_Adm4_BgySubMuns.shp.shp
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { MARINDUQUE_MUNICIPALITIES } from '../../shared/marinduqueLocations.js';

const require = createRequire(path.join(process.cwd(), 'noop.js'));
const shapefile = require('shapefile');
const proj4 = require('proj4');

const LICENSE_URL = 'https://raw.githubusercontent.com/altcoder/philippines-psgc-shapefiles/main/LICENSE';
const MARINDUQUE = 1704000000;
const TOWN_CODES = { 1704001000: 'Boac', 1704002000: 'Buenavista', 1704003000: 'Gasan', 1704004000: 'Mogpog', 1704005000: 'Santa Cruz', 1704006000: 'Torrijos' };
const TOLERANCE_METERS = 5;
const OUTPUT = new URL('../../shared/marinduqueBarangayAreas.js', import.meta.url);

const shpPath = process.argv[2];
if (!shpPath) throw new Error('Give the path of PH_Adm4_BgySubMuns.shp.shp');

// The shapefile is in meters (UTM zone 51N).
const toLonLat = point => proj4('+proj=utm +zone=51 +datum=WGS84 +units=m +no_defs', 'WGS84', point);
const round = value => Math.round(value * 1e5) / 1e5;

// Drops the points of a ring (in meters) that are within the tolerance of the line
// between their neighbors (Douglas-Peucker). Rings too small to keep a shape stay whole.
const simplify = ring => {
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    const [startX, startY] = ring[start];
    const segmentX = ring[end][0] - startX;
    const segmentY = ring[end][1] - startY;
    const lengthSquared = segmentX * segmentX + segmentY * segmentY;
    let farthest = -1;
    let farthestDistance = 0;
    for (let index = start + 1; index < end; index += 1) {
      const [x, y] = ring[index];
      const t = lengthSquared ? Math.max(0, Math.min(1, ((x - startX) * segmentX + (y - startY) * segmentY) / lengthSquared)) : 0;
      const distance = Math.hypot(x - startX - t * segmentX, y - startY - t * segmentY);
      if (distance > farthestDistance) {
        farthest = index;
        farthestDistance = distance;
      }
    }
    if (farthestDistance > TOLERANCE_METERS) {
      keep[farthest] = 1;
      stack.push([start, farthest], [farthest, end]);
    }
  }
  const simplified = ring.filter((_, index) => keep[index]);
  return simplified.length >= 4 ? simplified : ring;
};

const toRing = ring => simplify(ring)
  .map(point => toLonLat(point).map(round))
  .filter((point, index, points) => index === 0 || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1]);

const ringArea = ring => ring.reduce((sum, [x, y], index) => {
  const [nextX, nextY] = ring[(index + 1) % ring.length];
  return sum + x * nextY - nextX * y;
}, 0) / 2;

// Where a horizontal line crosses a polygon's rings, left to right.
const crossings = (polygon, latitude) => polygon.flatMap(ring => ring.slice(1).flatMap(([x, y], index) => {
  const [previousX, previousY] = ring[index];
  if ((y > latitude) === (previousY > latitude)) return [];
  return [previousX + (latitude - previousY) * (x - previousX) / (y - previousY)];
})).sort((a, b) => a - b);

// A point inside the barangay near its middle: the midpoint of the widest stretch of the
// largest polygon along the line through its centroid.
const centerOf = polygons => {
  const largest = polygons.reduce((best, polygon) => Math.abs(ringArea(polygon[0])) > Math.abs(ringArea(best[0])) ? polygon : best);
  const ring = largest[0];
  const area = ringArea(ring);
  let latitude = 0;
  ring.forEach(([x, y], index) => {
    const [nextX, nextY] = ring[(index + 1) % ring.length];
    latitude += (y + nextY) * (x * nextY - nextX * y);
  });
  latitude /= 6 * area;
  const xs = crossings(largest, latitude);
  let widest = [xs[0], xs[1]];
  for (let index = 0; index + 1 < xs.length; index += 2) {
    if (xs[index + 1] - xs[index] > widest[1] - widest[0]) widest = [xs[index], xs[index + 1]];
  }
  return [round(latitude), round((widest[0] + widest[1]) / 2)];
};

const licenseResponse = await fetch(LICENSE_URL);
if (!licenseResponse.ok) throw new Error(`License download failed: ${licenseResponse.status}`);
const license = (await licenseResponse.text())
  .trim()
  .split(/\r?\n/)
  .map(line => `// ${line.trim()}`.trimEnd())
  .join('\n');

const features = [];
const source = await shapefile.open(shpPath, shpPath.replace(/\.shp$/, '.dbf'));
for (let record = await source.read(); !record.done; record = await source.read()) {
  if (record.value.properties.adm2_psgc === MARINDUQUE) features.push(record.value);
}

const areas = {};
for (const [code, municipality] of Object.entries(TOWN_CODES)) {
  const townFeatures = features.filter(feature => feature.properties.adm3_psgc === Number(code));
  const barangays = MARINDUQUE_MUNICIPALITIES[municipality];
  if (townFeatures.length !== barangays.length) throw new Error(`${municipality}: ${townFeatures.length} boundaries for ${barangays.length} barangays`);

  areas[municipality] = {};
  for (const barangay of barangays) {
    // The app's list marks some town-center barangays "(Pob.)"; the PSA names do not.
    const feature = townFeatures.find(item => item.properties.adm4_en === barangay.replace(/ \(Pob\.\)$/, ''));
    if (!feature) throw new Error(`No boundary for Brgy. ${barangay}, ${municipality}`);
    const source = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    const polygons = source.map(polygon => polygon.map(toRing));
    const points = polygons.flatMap(polygon => polygon[0]);
    const longitudes = points.map(point => point[0]);
    const latitudes = points.map(point => point[1]);
    areas[municipality][barangay] = {
      center: centerOf(polygons),
      bounds: [Math.min(...latitudes), Math.max(...latitudes), Math.min(...longitudes), Math.max(...longitudes)],
      geometry: polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons }
    };
  }
}

fs.writeFileSync(OUTPUT, `// Generated by backend/scripts/buildBarangayAreas.mjs; do not edit by hand.
// Barangay boundaries of Marinduque from the PSA/NAMRIA barangay shapefile (PSGC as of
// 31 December 2023), via https://github.com/altcoder/philippines-psgc-shapefiles, kept
// within ${TOLERANCE_METERS} m of the original. That repository's license:
//
${license}
//
// Each barangay: center [latitude, longitude] (a point inside it), bounds [south, north,
// west, east], and its GeoJSON geometry.
export const MARINDUQUE_BARANGAY_AREAS = ${JSON.stringify(areas)};
`);
console.log(`Wrote ${Object.values(areas).reduce((sum, town) => sum + Object.keys(town).length, 0)} barangays to ${OUTPUT.pathname}`);
