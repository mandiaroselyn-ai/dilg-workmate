// The range an employee on duty is watched in, on HR's live map and for being outside their area
// (the user's choice, 2026-11-25: one green circle at each employee's location, and not a big
// one). An office's range is its grounds, a work-from-home address's is 50 m around it, and Brgy.
// Tanza's is the Marinduque State University campus. A field assignment's area is the whole
// barangay, often 1 to 3 km across, so field work is watched within FIELD_RANGE_METERS of where
// the employee timed in instead. Time In itself is still anywhere in the barangay (WorkMate has
// no other way to know the field site), and so are Lunch and Time Out.

export const FIELD_RANGE_METERS = 100;

// Whether `area` is a whole barangay: field work with no site of its own.
const isWholeBarangay = area => area?.mode === 'field' && !area.areaName && !(Number(area.radiusMeters) > 0);

// The range of a shift whose area is `area` and whose Time In GPS is `timeIn`
// ({ latitude, longitude }): FIELD_RANGE_METERS around the Time In for a whole barangay, else
// the area itself. The same area given back stays the same.
export const dutyRangeOf = (area, timeIn) => {
  const latitude = Number(timeIn?.latitude);
  const longitude = Number(timeIn?.longitude);
  if (!isWholeBarangay(area) || timeIn?.latitude == null || timeIn?.longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return area;
  const latitudeSpan = FIELD_RANGE_METERS / 110574;
  const longitudeSpan = FIELD_RANGE_METERS / (111320 * Math.cos(latitude * Math.PI / 180));
  return {
    mode: 'field',
    municipality: area.municipality,
    barangay: area.barangay,
    label: `Within ${FIELD_RANGE_METERS} m of the Time In, Brgy. ${area.barangay}, ${area.municipality}`,
    latitude,
    longitude,
    radiusMeters: FIELD_RANGE_METERS,
    areaName: 'Time In spot',
    bounds: { south: latitude - latitudeSpan, north: latitude + latitudeSpan, west: longitude - longitudeSpan, east: longitude + longitudeSpan },
    fallbackToRadius: false
  };
};

// "Field", "Office", or "WFH" for an area's mode, or '' when not known.
export const DUTY_LABELS = { field: 'Field', office: 'Office', wfh: 'WFH' };
export const dutyLabelOf = mode => DUTY_LABELS[String(mode || '').toLowerCase()] || '';
