const EARTH_RADIUS_METERS = 6371000;

const distanceMeters = (latitudeA, longitudeA, latitudeB, longitudeB) => {
  const toRadians = value => value * Math.PI / 180;
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(latitudeA)) * Math.cos(toRadians(latitudeB))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const pointInRing = (longitude, latitude, ring) => {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [currentLongitude, currentLatitude] = ring[index];
    const [previousLongitude, previousLatitude] = ring[previous];
    const crossesLatitude = (currentLatitude > latitude) !== (previousLatitude > latitude);
    const crossingLongitude = ((previousLongitude - currentLongitude) * (latitude - currentLatitude))
      / (previousLatitude - currentLatitude) + currentLongitude;
    if (crossesLatitude && longitude < crossingLongitude) inside = !inside;
  }
  return inside;
};

const pointInPolygon = (longitude, latitude, rings) => (
  rings.length > 0
  && pointInRing(longitude, latitude, rings[0])
  && !rings.slice(1).some(ring => pointInRing(longitude, latitude, ring))
);

const distanceToRingMeters = (longitude, latitude, ring) => {
  const longitudeScale = 111320 * Math.max(0.1, Math.cos(latitude * Math.PI / 180));
  let minimumDistance = Infinity;
  for (let index = 1; index < ring.length; index += 1) {
    const [startLongitude, startLatitude] = ring[index - 1];
    const [endLongitude, endLatitude] = ring[index];
    const startX = (startLongitude - longitude) * longitudeScale;
    const startY = (startLatitude - latitude) * 111320;
    const endX = (endLongitude - longitude) * longitudeScale;
    const endY = (endLatitude - latitude) * 111320;
    const segmentX = endX - startX;
    const segmentY = endY - startY;
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
    const projection = segmentLengthSquared
      ? Math.max(0, Math.min(1, -(startX * segmentX + startY * segmentY) / segmentLengthSquared))
      : 0;
    minimumDistance = Math.min(minimumDistance, Math.hypot(startX + projection * segmentX, startY + projection * segmentY));
  }
  return minimumDistance;
};

const polygonContainsOrNear = (longitude, latitude, polygon, bufferMeters) => {
  if (pointInPolygon(longitude, latitude, polygon)) return true;
  if (!bufferMeters) return false;
  return polygon.some(ring => distanceToRingMeters(longitude, latitude, ring) <= bufferMeters);
};

const getValidBounds = bounds => {
  if (!bounds) return null;
  const { south, north, west, east } = bounds;
  if (![south, north, west, east].every(Number.isFinite)
    || south > north || west > east
    || south < -90 || north > 90 || west < -180 || east > 180) {
    return null;
  }
  return bounds;
};

export const isWithinAssignedLocation = (latitude, longitude, location, bufferMeters = 150) => {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !location) return false;

  if (location.mode !== 'field') {
    return distanceMeters(lat, lon, Number(location.latitude), Number(location.longitude)) <= bufferMeters;
  }

  const geometry = location.geometry;
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) {
    if (!location.fallbackToRadius) return false;
    const bounds = getValidBounds(location.bounds);
    if (bounds) {
      const nearestLatitude = Math.max(bounds.south, Math.min(bounds.north, lat));
      const nearestLongitude = Math.max(bounds.west, Math.min(bounds.east, lon));
      return distanceMeters(lat, lon, nearestLatitude, nearestLongitude) <= bufferMeters;
    }
    return distanceMeters(lat, lon, Number(location.latitude), Number(location.longitude)) <= bufferMeters;
  }
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(polygon => polygonContainsOrNear(lon, lat, polygon, bufferMeters));
};