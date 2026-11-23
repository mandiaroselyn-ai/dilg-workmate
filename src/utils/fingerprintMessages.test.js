import assert from 'node:assert/strict';
import test from 'node:test';
import { BROWSER_FINGERPRINT_CAUTION, describeFingerprintCheck, describeFingerprintError, describeTimeInFingerprintError, registeredFingerprints, usedBrowserFingerprint } from './fingerprintMessages.js';

const domError = (name, message) => Object.assign(new Error(message), { name });

test('explains Chrome\'s "A request is already pending." with steps to fix it', () => {
  const message = describeFingerprintError(domError('OperationError', 'A request is already pending.'));
  assert.match(message, /still open/);
  assert.match(message, /Messenger/);
  assert.match(message, /reload the page/);
});

test('explains a prompt that never opened or finished', () => {
  assert.match(describeFingerprintError(domError('AbortError', 'The operation was aborted.'), 'timeout'), /did not open or was not completed in time/);
});

test('mentions floating bubbles when the prompt is cancelled or blocked', () => {
  assert.match(describeFingerprintError(domError('NotAllowedError', 'The operation either timed out or was not allowed.')), /Messenger/);
});

test('keeps server messages that are already clear', () => {
  assert.equal(describeFingerprintError(new Error('Your session has expired or is no longer valid. Sign in again before verifying your fingerprint.')), 'Your session has expired or is no longer valid. Sign in again before verifying your fingerprint.');
});

test('lists the fingerprints HR sees on an employee record', () => {
  assert.deepEqual(registeredFingerprints({ hasBrowserFingerprint: true, webauthnRegisteredAt: '2026-09-01T00:00:00.000Z' }), [
    { source: 'Chrome / browser', registeredAt: '2026-09-01T00:00:00.000Z' }
  ]);
  assert.deepEqual(registeredFingerprints({ hasBrowserFingerprint: true, hasPhoneFingerprint: true }).map(item => item.source), ['Chrome / browser', 'WorkMate phone app']);
  assert.deepEqual(registeredFingerprints({}), []);
});

test('describes how a Time In fingerprint was checked', () => {
  // A browser also takes the phone's PIN or pattern, so HR is told to check the selfie.
  assert.equal(describeFingerprintCheck({ fingerprintVerified: true, fingerprintMethod: 'browser' }), `Matched registered fingerprint (Chrome / browser). ${BROWSER_FINGERPRINT_CAUTION}`);
  assert.equal(describeFingerprintCheck({ fingerprintVerified: true, fingerprintMethod: 'phone-app' }), 'Matched registered fingerprint (WorkMate phone app)');
  assert.equal(describeFingerprintCheck({ fingerprintVerified: true }), 'Matched registered fingerprint');
  assert.equal(describeFingerprintCheck({ fingerprintVerified: false, fingerprintMethod: 'browser' }), 'Not verified');
});

test('flags a record when any punch used a browser fingerprint', () => {
  assert.equal(usedBrowserFingerprint({ fingerprintMethod: 'phone-app', timeOutFingerprintMethod: 'phone-app' }), false);
  assert.equal(usedBrowserFingerprint({ fingerprintMethod: 'phone-app', lunchInFingerprintMethod: 'browser' }), true);
  assert.equal(usedBrowserFingerprint(null), false);
});

test('Time In tells an employee on another phone how to register it', () => {
  const notAllowed = domError('NotAllowedError', 'The operation either timed out or was not allowed.');
  assert.match(describeTimeInFingerprintError(notAllowed), /Changed phones\?/);
  assert.doesNotMatch(describeFingerprintError(notAllowed), /Changed phones/);
  assert.doesNotMatch(describeTimeInFingerprintError(domError('AbortError', 'aborted'), 'timeout'), /Changed phones/);
});
