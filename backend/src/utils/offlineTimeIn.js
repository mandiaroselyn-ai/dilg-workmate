import crypto from 'node:crypto';
import { OFFLINE_TIME_IN_PREFIX, offlineTimeInText } from '../../../shared/offlineTimeIn.js';
import { verifyNativeBiometricSignature } from './nativeBiometric.js';

// HR checks an offline Time In or Time Out when the phone's clock was this far from the server's.
export const MAX_PHONE_CLOCK_DIFFERENCE_MS = 5 * 60 * 1000;
// HR checks an offline Time In or Time Out that reached the server this long after it was made.
export const MAX_OFFLINE_DELAY_MS = 3 * 24 * 60 * 60 * 1000;
// Network delays: a time recorded up to this far "in the future" is not questioned.
const FUTURE_ALLOWANCE_MS = 2 * 60 * 1000;

const sha256 = text => crypto.createHash('sha256').update(text, 'utf8').digest('base64url');

const minutesText = ms => {
  const minutes = Math.round(Math.abs(ms) / 60000);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
};

// The challenge the phone signed for this Time In (see shared/offlineTimeIn.js).
export const offlineTimeInChallenge = ({ employeeId, recordedAt, nonce, record }) => OFFLINE_TIME_IN_PREFIX + sha256(offlineTimeInText({
  employeeId,
  recordedAt,
  nonce,
  latitude: record.latitude,
  longitude: record.longitude,
  gpsAccuracy: record.gpsAccuracy,
  assignmentSite: record.assignmentSite,
  selfieHash: sha256(String(record.selfieUrl || ''))
}));

const reject = error => ({ error, statusCode: 400 });

// Why HR should check the time of a Time In or Time Out (`entry`) that the phone recorded at
// `recorded` (milliseconds, by its own clock) and sent at `sentAt` (also by its clock).
const checkPhoneClock = ({ recorded, sentAt, now, entry }) => {
  const reviewReasons = [];
  const nowMs = now.getTime();
  if (recorded > nowMs + FUTURE_ALLOWANCE_MS) {
    reviewReasons.push(`The phone recorded this ${entry} ${minutesText(recorded - nowMs)} later than the server's current time, so the server's time was used.`);
  } else if (nowMs - recorded > MAX_OFFLINE_DELAY_MS) {
    reviewReasons.push(`This ${entry} reached the server ${Math.floor((nowMs - recorded) / (24 * 60 * 60 * 1000))} days after it was recorded.`);
  }

  const sent = typeof sentAt === 'string' ? Date.parse(sentAt) : NaN;
  const phoneClockOffsetMs = Number.isFinite(sent) ? sent - nowMs : null;
  if (phoneClockOffsetMs === null) {
    reviewReasons.push('The phone did not send its clock time, so its clock could not be checked.');
  } else if (Math.abs(phoneClockOffsetMs) > MAX_PHONE_CLOCK_DIFFERENCE_MS) {
    reviewReasons.push(`The phone's clock was ${minutesText(phoneClockOffsetMs)} ${phoneClockOffsetMs > 0 ? 'ahead of' : 'behind'} the server's when it sent this ${entry}, so the recorded time may be wrong.`);
  }
  return {
    phoneClockOffsetSeconds: phoneClockOffsetMs === null ? null : Math.round(phoneClockOffsetMs / 1000),
    reviewReasons
  };
};

// Checks the signed part of a Time In made without internet (`offline`, from the phone) for
// the Time In `record` as it was sent. `sentAt` is the phone's clock when it sent the Time In.
// Returns { error, statusCode } when the Time In cannot be accepted at all. Otherwise
// returns when the Time In happened, whether the registered phone key signed it, and why
// HR must review it (none when it passed).
export const checkOfflineTimeIn = ({ offline, record, employeeId, registeredKey, sentAt, now = new Date() }) => {
  if (!offline || typeof offline !== 'object' || Array.isArray(offline)) return reject('Invalid offline Time In data.');
  const { recordedAt, nonce, signature, publicKey } = offline;
  const recorded = typeof recordedAt === 'string' && recordedAt.length <= 40 ? Date.parse(recordedAt) : NaN;
  if (!Number.isFinite(recorded)
    || typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce)
    || typeof signature !== 'string' || !signature || signature.length > 512
    || (publicKey !== undefined && publicKey !== null && (typeof publicKey !== 'string' || publicKey.length > 512))) {
    return reject('Invalid offline Time In data.');
  }
  if (typeof record.selfieUrl !== 'string' || !record.selfieUrl) {
    return reject('Selfie verification is required for clock-in.');
  }

  const challenge = offlineTimeInChallenge({ employeeId, recordedAt, nonce, record });
  const reviewReasons = [];
  const registeredKeyMatched = Boolean(registeredKey)
    && verifyNativeBiometricSignature({ publicKey: registeredKey, challenge, signature });
  if (!registeredKeyMatched) {
    // Signed by this employee's phone, but with a key the server does not have: the phone
    // was changed, WorkMate was reinstalled, or a fingerprint was added to the phone.
    if (publicKey && publicKey !== registeredKey && verifyNativeBiometricSignature({ publicKey, challenge, signature })) {
      reviewReasons.push('The fingerprint was checked with a phone key that is not registered to this employee (a new phone, a reinstalled app, or a fingerprint added to the phone).');
    } else {
      return reject('The offline Time In does not match a fingerprint check on this employee\'s phone.');
    }
  }

  const clock = checkPhoneClock({ recorded, sentAt, now, entry: 'Time In' });
  return {
    // A Time In "from the future" is saved at the server's time.
    timeInAt: new Date(Math.min(recorded, now.getTime())),
    registeredKeyMatched,
    recordedAt: new Date(recorded),
    nonce,
    phoneClockOffsetSeconds: clock.phoneClockOffsetSeconds,
    reviewReasons: [...reviewReasons, ...clock.reviewReasons]
  };
};

// Checks the time of a Time Out saved on the phone without internet (`recordedOfflineAt`,
// by the phone's clock) for a shift that began at `timeInAt`. `sentAt` is the phone's clock
// when it sent the Time Out. Returns null for a Time Out made online. The Time Out itself is
// placed between the Time In and now by resolveTimeOutMoment.
export const checkOfflineTimeOut = ({ recordedOfflineAt, timeInAt, sentAt, now = new Date() }) => {
  const recorded = typeof recordedOfflineAt === 'string' ? Date.parse(recordedOfflineAt) : NaN;
  if (!Number.isFinite(recorded)) return null;
  const clock = checkPhoneClock({ recorded, sentAt, now, entry: 'Time Out' });
  const timeIn = timeInAt ? new Date(timeInAt).getTime() : NaN;
  if (Number.isFinite(timeIn) && recorded < timeIn) {
    clock.reviewReasons.push(`The phone recorded this Time Out ${minutesText(timeIn - recorded)} before the Time In, so the Time In time was used.`);
  }
  return { recordedAt: new Date(recorded), ...clock };
};
