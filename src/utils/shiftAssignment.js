import { MARINDUQUE_MUNICIPALITIES, MARINDUQUE_OFFICES } from '../../shared/marinduqueLocations.js';

// The attendance page's assignment choice (Field, Work From Home, or Office, with its town,
// barangay, office, or address) for an open shift, from `site`, the area saved with its Time
// In. The shift's Time Out, Lunch Out, and Lunch In are checked against that area, not the
// page's default choice. Null when `site` names no area (records saved before areas were).
export const assignmentOfShift = site => {
  if (!site || !MARINDUQUE_MUNICIPALITIES[site.municipality]) return null;
  if (site.mode === 'office') {
    // The area saved for an office names the office's town and barangay.
    const office = MARINDUQUE_OFFICES.find(item => item.id === site.officeId)
      || MARINDUQUE_OFFICES.find(item => item.municipality === site.municipality && item.barangay === site.barangay);
    return office ? { mode: 'office', municipality: office.municipality, barangay: office.barangay, officeId: office.id } : null;
  }
  if (!['field', 'wfh'].includes(site.mode) || !MARINDUQUE_MUNICIPALITIES[site.municipality].includes(site.barangay)) return null;
  return { mode: site.mode, municipality: site.municipality, barangay: site.barangay, street: site.street || '', landmark: site.landmark || '' };
};
