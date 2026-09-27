import assert from 'node:assert/strict';
import test from 'node:test';
import { hasRequiredEnrollmentImages, resubmittableEnrollmentFilter } from './biometricEnrollment.js';

test('requires front ID, back ID, and selfie for a complete enrollment', () => {
  const complete = {
    dilgIdPhoto: 'front-image',
    dilgIdBackPhoto: 'back-image',
    faceEnrollmentImage: 'selfie-image'
  };
  assert.equal(hasRequiredEnrollmentImages(complete), true);
  assert.equal(hasRequiredEnrollmentImages({ ...complete, faceEnrollmentImage: '' }), false);
  assert.equal(hasRequiredEnrollmentImages({ dilgIdPhoto: 'front-image' }), false);
  assert.equal(hasRequiredEnrollmentImages(), false);
});

test('allows employees to resubmit while an enrollment is pending but never after approval', () => {
  assert.deepEqual(resubmittableEnrollmentFilter(), {
    $or: [
      { biometricEnrollmentStatus: { $in: ['not-submitted', 'rejected', 'pending'] } },
      { biometricEnrollmentStatus: { $exists: false } }
    ]
  });
});
