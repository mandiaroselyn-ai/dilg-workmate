import { OFFLINE_TIME_IN_PREFIX, offlineTimeInText } from '../../shared/offlineTimeIn.js';

// A Time In made in the WorkMate phone app without internet is signed with the phone's
// fingerprint key and saved on the phone until it can be sent (see shared/offlineTimeIn.js).

// Storage can be blocked (for example, in a private window), so every access is guarded.
const readStored = key => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStored = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Without storage, the app simply needs internet for this next time.
  }
};

// True when a request failed because there was no connection (or it took too long),
// rather than because the server answered with an error.
export const isNetworkError = error => error instanceof TypeError
  || error?.name === 'AbortError'
  || error?.name === 'TimeoutError';

// Gives up on a request after `ms`, so a weak signal does not leave the screen waiting.
export const timeoutSignal = ms => (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
  ? AbortSignal.timeout(ms)
  : undefined);

// The fingerprint key this phone used the last time the server accepted the employee's
// fingerprint. A phone that never verified online has no registered key to sign with.
const phoneKeyName = employeeId => `dilg_phone_key:${String(employeeId || '').trim().toLowerCase()}`;
export const rememberPhoneKey = (employeeId, keyId) => {
  if (employeeId && /^[a-f0-9]{32}$/.test(keyId || '')) writeStored(phoneKeyName(employeeId), keyId);
};
export const readPhoneKey = employeeId => {
  const keyId = employeeId ? readStored(phoneKeyName(employeeId)) : null;
  return /^[a-f0-9]{32}$/.test(keyId || '') ? keyId : null;
};

const toBase64Url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256 = async text => toBase64Url(await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

// Whether this phone can sign a Time In without internet.
export const canSignOffline = () => Boolean(window.crypto?.subtle && window.crypto.getRandomValues);

// Asks for the fingerprint (`sign` opens the phone's prompt and returns { signature,
// publicKey }) and returns the signed part of an offline Time In for these exact details.
export const signOfflineTimeIn = async ({ employeeId, keyId, latitude, longitude, gpsAccuracy, assignmentSite, selfie, sign }) => {
  const recordedAt = new Date().toISOString();
  const nonce = toBase64Url(window.crypto.getRandomValues(new Uint8Array(18)));
  const text = offlineTimeInText({
    employeeId,
    recordedAt,
    nonce,
    latitude,
    longitude,
    gpsAccuracy,
    assignmentSite,
    selfieHash: await sha256(selfie)
  });
  const { signature, publicKey } = await sign(OFFLINE_TIME_IN_PREFIX + await sha256(text), keyId);
  return { recordedAt, nonce, signature, publicKey };
};

// An office or WFH address is found on the map by the server, so the app keeps the last
// answer for each one to check the assignment area without internet.
const siteKey = site => `dilg_site_location:${['mode', 'municipality', 'barangay', 'officeId', 'street', 'landmark']
  .map(field => String(site?.[field] ?? '').trim().toLowerCase()).join('|')}`;
export const rememberSiteLocation = (site, location) => {
  if (site?.mode !== 'field' && location) writeStored(siteKey(site), JSON.stringify(location));
};

// The assignment area without internet: a field assignment's barangay from the map in the
// app, or an office or WFH address found the last time the app was online. Null when the
// app does not have it.
export const resolveSiteOffline = async site => {
  if (site?.mode === 'field') {
    const { resolveFieldAssignment } = await import('../../shared/fieldAssignmentArea.js');
    return resolveFieldAssignment(site);
  }
  try {
    return JSON.parse(readStored(siteKey(site)) || 'null');
  } catch {
    return null;
  }
};
