// The IDs an employee can submit on Biometric Enrollment, for HR to check against the
// enrollment selfie. The PhilSys National ID comes first: RA 11055 (PhilSys Act) and EO 162
// (2022) make it sufficient proof of identity in government transactions, and DILG personnel
// were the first department registered for it. The DILG office ID shows the person works at
// DILG. The others are the government-issued IDs the CSC Personal Data Sheet (CS Form No. 212)
// asks for, so HR can match the number with the PDS on file.
// `backNeeded` is false for an ID whose details are all on one side or page.
export const ENROLLMENT_ID_TYPES = [
  { value: 'philid', label: 'PhilSys National ID (PhilID)', backNeeded: true },
  { value: 'ephilid', label: 'ePhilID / Digital National ID', backNeeded: false },
  { value: 'dilg-office-id', label: 'DILG Office ID', backNeeded: true },
  { value: 'passport', label: 'Passport (photo page)', backNeeded: false },
  { value: 'umid', label: 'UMID / GSIS ID', backNeeded: true },
  { value: 'sss', label: 'SSS ID', backNeeded: true },
  { value: 'prc', label: 'PRC ID', backNeeded: true },
  { value: 'drivers-license', label: 'Driver\'s License', backNeeded: true },
  // TEMPORARY (2026-11-25): a student ID, for the project team and testers who have none of the
  // IDs above. It is not a government ID, so remove it before DILG personnel enroll.
  { value: 'student-id', label: 'Student ID', backNeeded: true }
];

export const enrollmentIdType = value => ENROLLMENT_ID_TYPES.find(type => type.value === value) || null;

// Whether a submitted ID needs a photo of its back: an ID type with all its details on one
// side does not; one submitted before ID types were asked does.
export const enrollmentIdNeedsBack = value => enrollmentIdType(value)?.backNeeded ?? true;

// The ID number as printed (letters, numbers, spaces, and dashes, up to 40 characters), in
// capitals; '' when it is missing or not like an ID number.
export const normalizeEnrollmentIdNumber = value => {
  const number = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toUpperCase() : '';
  return /^[A-Z0-9][A-Z0-9 -]{2,39}$/.test(number) ? number : '';
};

// The server compares the face on the ID photo with the enrollment selfie to help HR: at this
// distance or closer it says they look alike (face-api's usual match distance; an ID photo is
// often old or small, so a looser one than the attendance match).
export const ID_PHOTO_SIMILAR_DISTANCE = 0.6;
