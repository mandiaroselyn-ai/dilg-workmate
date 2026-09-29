import assert from 'node:assert/strict';
import test from 'node:test';
import { describeFingerprintError } from './fingerprintMessages.js';

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
