import assert from 'node:assert/strict';
import test from 'node:test';
import { hasRequiredEnrollmentImages, resubmittableEnrollmentFilter } from './biometricEnrollment.js';
import { enrollmentIdNeedsBack, enrollmentIdType, normalizeEnrollmentIdNumber } from '../../../shared/enrollmentIds.js';

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

test('an ID with everything on one side or page needs no back photo', () => {
  const oneSide = { dilgIdPhoto: 'front-image', faceEnrollmentImage: 'selfie-image' };
  assert.equal(hasRequiredEnrollmentImages({ ...oneSide, enrollmentIdType: 'passport' }), true);
  assert.equal(hasRequiredEnrollmentImages({ ...oneSide, enrollmentIdType: 'ephilid' }), true);
  assert.equal(hasRequiredEnrollmentImages({ ...oneSide, enrollmentIdType: 'philid' }), false);
  // An ID submitted before the type was asked still needs its back.
  assert.equal(enrollmentIdNeedsBack(''), true);
  assert.equal(enrollmentIdType('philid').label, 'PhilSys National ID (PhilID)');
  assert.equal(enrollmentIdType('school-id'), null);
});

test('an ID number is kept as printed, in capitals, and must look like one', () => {
  assert.equal(normalizeEnrollmentIdNumber(' 1234-5678-9012-3456 '), '1234-5678-9012-3456');
  assert.equal(normalizeEnrollmentIdNumber('n01  23 456789'), 'N01 23 456789');
  assert.equal(normalizeEnrollmentIdNumber('12'), '');
  assert.equal(normalizeEnrollmentIdNumber('<script>'), '');
  assert.equal(normalizeEnrollmentIdNumber(undefined), '');
});

test('allows employees to resubmit while pending, after an approval made with the old sample ID, or when HR asks', () => {
  assert.deepEqual(resubmittableEnrollmentFilter(), {
    $or: [
      { biometricEnrollmentStatus: { $in: ['not-submitted', 'rejected', 'pending'] } },
      { biometricEnrollmentStatus: { $exists: false } },
      { biometricEnrollmentIsDemo: true },
      { biometricReenrollRequested: true }
    ]
  });
});

test('a student ID can be submitted for now, with its back', () => {
  assert.equal(enrollmentIdType('student-id')?.label, 'Student ID');
  assert.equal(enrollmentIdNeedsBack('student-id'), true);
  assert.equal(normalizeEnrollmentIdNumber(' 2021-00123 '), '2021-00123');
});
