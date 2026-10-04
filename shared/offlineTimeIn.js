// A Time In made in the WorkMate phone app without internet is saved on the phone and sent
// when the phone is back online. Before saving it, the phone signs this text with the
// fingerprint key registered to the employee, so the server can check later that the
// employee's phone, unlocked by their fingerprint, recorded this exact Time In: who, when,
// where, which assignment, and which selfie.

// The phone signs this prefix followed by the SHA-256 (base64url) of offlineTimeInText.
// The phone app signs at most 128 characters, so the text itself is not signed.
export const OFFLINE_TIME_IN_PREFIX = 'offline-time-in.';

const SITE_FIELDS = ['mode', 'municipality', 'barangay', 'officeId', 'street', 'landmark'];

export const offlineTimeInText = ({ employeeId, recordedAt, nonce, latitude, longitude, gpsAccuracy, assignmentSite, selfieHash }) => [
  'dilg-workmate offline time in v1',
  String(employeeId ?? '').trim().toLowerCase(),
  String(recordedAt ?? ''),
  String(nonce ?? ''),
  Number(latitude).toFixed(6),
  Number(longitude).toFixed(6),
  Number(gpsAccuracy).toFixed(1),
  SITE_FIELDS.map(field => String(assignmentSite?.[field] ?? '').trim()).join('|'),
  String(selfieHash ?? '')
].join('\n');
