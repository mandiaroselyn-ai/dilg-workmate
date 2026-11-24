import { MARINDUQUE_MUNICIPALITIES, MARINDUQUE_OFFICES } from '../../shared/marinduqueLocations.js';
import { DILG_OFFICE_GROUPS } from '../../shared/dilgAssignments.js';

const PROVINCIAL_SECTIONS = DILG_OFFICE_GROUPS.find(group => group.label === 'Provincial Office')?.offices || [];

// The DILG office an employee reports to, from MARINDUQUE_OFFICES: the assigned station HR set,
// else their MLGOO office's town hall ("Office of the MLGOO - Gasan"), else the Provincial Office
// for its sections (in the Capitol in Boac). Null when it cannot be told. The attendance page
// starts on it, so an office worker does not have to change the assignment each morning.
export const homeOfficeOf = person => {
  const station = MARINDUQUE_OFFICES.find(office => office.name === person?.assignedStation);
  if (station) return station;
  const office = String(person?.office || '').trim();
  const mlgoo = /Office of the MLGOO - (.+)$/.exec(office);
  if (mlgoo) return MARINDUQUE_OFFICES.find(item => item.id !== 'provincial' && item.municipality === mlgoo[1].trim()) || null;
  if (PROVINCIAL_SECTIONS.includes(office) || /provincial/i.test(office)) return MARINDUQUE_OFFICES.find(item => item.id === 'provincial') || null;
  return null;
};

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
