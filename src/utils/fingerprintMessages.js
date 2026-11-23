// Turns a failed fingerprint (WebAuthn) attempt into a message an employee can act on.
// Browser messages such as "A request is already pending." are replaced with steps.

export const FINGERPRINT_OVERLAY_HINT = 'Close floating chat bubbles (such as Messenger chat heads) or screen overlays, which can stop the fingerprint prompt from opening.';

export const PROMPT_STILL_OPEN_MESSAGE = `A fingerprint prompt is still open. ${FINGERPRINT_OVERLAY_HINT} If you do not see the prompt, reload the page, then tap Verify Fingerprint once.`;

export const WRONG_PHONE_HINT = 'If this is not the phone you registered, open Biometric Enrollment and tap "Changed phones?" to register this phone.';

// `abortReason` is 'timeout' when the app gave up waiting for the prompt.
export const describeFingerprintError = (error, abortReason = null) => {
  const message = error?.message || '';
  if (abortReason === 'timeout') {
    return `The fingerprint prompt did not open or was not completed in time. ${FINGERPRINT_OVERLAY_HINT} Then tap Verify Fingerprint again.`;
  }
  if (/already pending/i.test(message)) return PROMPT_STILL_OPEN_MESSAGE;
  if (error?.name === 'NotAllowedError') {
    return `Fingerprint verification was cancelled, timed out, or blocked. ${FINGERPRINT_OVERLAY_HINT} Then try again.`;
  }
  if (error?.name === 'SecurityError') return 'Fingerprint verification origin mismatch. Open the official Vercel domain directly.';
  if (error?.name === 'InvalidStateError') return 'Fingerprint verification is already registered. Retry the fingerprint check.';
  if (message.includes('challenge expired')) {
    return 'The fingerprint verification request expired before it finished. Tap the fingerprint button again and complete the biometric prompt right away.';
  }
  if (error?.name === 'TypeError') return 'Fingerprint verification failed. Check your connection and retry.';
  return message || 'Fingerprint verification failed. Check browser biometric support and retry.';
};

const FINGERPRINT_SOURCES = { browser: 'Chrome / browser', 'phone-app': 'WorkMate phone app' };

// The fingerprints an employee registered for Time In, for HR's employee record.
export const registeredFingerprints = employee => [
  employee?.hasBrowserFingerprint && { source: FINGERPRINT_SOURCES.browser, registeredAt: employee.webauthnRegisteredAt || null },
  employee?.hasPhoneFingerprint && { source: FINGERPRINT_SOURCES['phone-app'], registeredAt: employee.nativeBiometricRegisteredAt || null }
].filter(Boolean);

// A browser accepts the phone's screen lock (PIN or pattern) in place of a fingerprint, and a
// passkey saved to a Google or Apple account works on that account's other phones too; the
// WorkMate app accepts only a fingerprint on the registered phone.
export const BROWSER_FINGERPRINT_CAUTION = 'A browser also accepts the phone\'s PIN or pattern, and a passkey synced to another phone, so check the selfie.';

// How a Time In's fingerprint was checked, for HR's DTR records.
export const describeFingerprintCheck = record => {
  if (!record?.fingerprintVerified) return 'Not verified';
  const source = FINGERPRINT_SOURCES[record.fingerprintMethod];
  if (record.fingerprintMethod === 'browser') return `Matched registered fingerprint (${source}). ${BROWSER_FINGERPRINT_CAUTION}`;
  return source ? `Matched registered fingerprint (${source})` : 'Matched registered fingerprint';
};

// Whether a punch's fingerprint was checked in a browser, where a PIN or pattern can stand in
// for it (see BROWSER_FINGERPRINT_CAUTION), for HR's flag on the record.
export const usedBrowserFingerprint = record => [
  record?.fingerprintMethod,
  record?.timeOutFingerprintMethod,
  record?.lunchOutFingerprintMethod,
  record?.lunchInFingerprintMethod
].includes('browser');

// Time In only accepts the fingerprint registered on Biometric Enrollment, and a phone
// without that registration fails the same way as a cancelled prompt.
export const describeTimeInFingerprintError = (error, abortReason = null) => {
  const message = describeFingerprintError(error, abortReason);
  return error?.name === 'NotAllowedError' && !abortReason ? `${message} ${WRONG_PHONE_HINT}` : message;
};
