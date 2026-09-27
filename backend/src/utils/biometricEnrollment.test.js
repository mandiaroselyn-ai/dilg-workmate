import assert from 'node:assert/strict';
import test from 'node:test';
import { hasRequiredEnrollmentImages, missingEnrollmentImagesFilter } from './biometricEnrollment.js';

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

test('identifies any missing enrollment image when allowing a pending resubmission', () => {
  assert.deepEqual(missingEnrollmentImagesFilter(), {
    $or: [
      { dilgIdPhoto: { $exists: false } },
      { dilgIdPhoto: '' },
      { dilgIdBackPhoto: { $exists: false } },
      { dilgIdBackPhoto: '' },
      { faceEnrollmentImage: { $exists: false } },
      { faceEnrollmentImage: '' }
    ]
  });
});
