import { MARINDUQUE_MUNICIPALITIES, MARINDUQUE_OFFICES } from '../../../shared/marinduqueLocations.js';

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const normalizeText = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
const normalizeKey = value => normalizeText(value).toLowerCase();

const findMunicipality = value => Object.keys(MARINDUQUE_MUNICIPALITIES)
  .find(municipality => normalizeKey(municipality) === normalizeKey(value));

const findBarangay = (municipality, value) => MARINDUQUE_MUNICIPALITIES[municipality]
  ?.find(barangay => normalizeKey(barangay) === normalizeKey(value));

export const normalizeApprovedWfhLocation = (location, reviewer) => {
  if (location != null && (typeof location !== 'object' || Array.isArray(location))) {
    fail('Approved WFH location must be an object.');
  }
  const value = location || {};
  const fields = ['municipality', 'barangay', 'street', 'landmark'];
  if (fields.some(field => value[field] != null && typeof value[field] !== 'string')) {
    fail('Approved WFH location fields must be text.');
  }

  const hasLocation = fields.some(field => normalizeText(value[field]));
  if (!hasLocation) return null;

  const municipality = findMunicipality(value.municipality);
  if (!municipality) fail('Choose a valid municipality for the approved WFH location.');
  const barangay = findBarangay(municipality, value.barangay);
  if (!barangay) fail('Choose a valid barangay for the approved WFH location.');

  const street = normalizeText(value.street);
  const landmark = normalizeText(value.landmark);
  if (street.length > 120 || landmark.length > 120) {
    fail('WFH street and landmark must be 120 characters or fewer.');
  }

  return {
    municipality,
    barangay,
    street,
    landmark,
    approvedAt: new Date(),
    approvedBy: normalizeText(reviewer)
  };
};

export const normalizeAttendanceAssignment = ({ dutyType, assignmentSite, user }) => {
  if (!['office', 'wfh', 'field'].includes(dutyType)) {
    fail('Choose a valid attendance duty type.');
  }
  if (!assignmentSite || typeof assignmentSite !== 'object' || assignmentSite.mode !== dutyType) {
    fail('Attendance duty type does not match the selected assignment.');
  }

  const municipality = findMunicipality(assignmentSite.municipality);
  if (!municipality) fail('Choose a valid municipality for this assignment.');

  if (dutyType === 'office') {
    const office = MARINDUQUE_OFFICES.find(item => item.id === assignmentSite.officeId);
    if (!office || office.municipality !== municipality) fail('Choose a valid DILG office assignment.');
    return {
      dutyType,
      assignmentSite: {
        mode: dutyType,
        municipality: office.municipality,
        barangay: office.barangay,
        officeId: office.id
      }
    };
  }

  if (dutyType === 'field') {
    const barangay = findBarangay(municipality, assignmentSite.barangay);
    if (!barangay) fail('Choose a valid barangay from the selected municipality.');

    const assignedMunicipality = findMunicipality(user?.assignedLGU || '');
    if (assignedMunicipality && assignedMunicipality !== municipality) {
      fail('The selected field municipality does not match the employee assigned LGU.', 403);
    }

    return { dutyType, assignmentSite: { mode: dutyType, municipality, barangay } };
  }

  const approved = user?.approvedWfhLocation;
  if (!approved?.approvedAt || !normalizeText(approved.approvedBy)) {
    fail('No HR-approved WFH location is on file for this employee.', 409);
  }

  const approvedMunicipality = findMunicipality(approved.municipality);
  const approvedBarangay = findBarangay(approvedMunicipality, approved.barangay);
  if (!approvedMunicipality || !approvedBarangay) {
    fail('The approved WFH location is invalid. Ask HR/Admin to update it.', 409);
  }

  const approvedStreet = normalizeText(approved.street);
  const approvedLandmark = normalizeText(approved.landmark);
  if (
    municipality !== approvedMunicipality
    || normalizeKey(assignmentSite.barangay) !== normalizeKey(approvedBarangay)
    || normalizeKey(assignmentSite.street) !== normalizeKey(approvedStreet)
    || normalizeKey(assignmentSite.landmark) !== normalizeKey(approvedLandmark)
  ) {
    fail('The selected WFH location does not match the employee HR-approved location.', 403);
  }

  return {
    dutyType,
    assignmentSite: {
      mode: dutyType,
      municipality: approvedMunicipality,
      barangay: approvedBarangay,
      street: approvedStreet,
      landmark: approvedLandmark
    }
  };
};