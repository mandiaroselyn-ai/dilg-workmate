import { enrollmentIdNeedsBack } from '../../../shared/enrollmentIds.js';

// The front of the ID, its back (unless the ID type has everything on one side), and the selfie.
export const hasRequiredEnrollmentImages = (enrollment = {}) => Boolean(
  enrollment.dilgIdPhoto
  && (enrollment.dilgIdBackPhoto || !enrollmentIdNeedsBack(enrollment.enrollmentIdType))
  && enrollment.faceEnrollmentImage
);

// Enrollments the employee may submit again: not yet submitted, rejected, still pending, or
// approved with the sample ID the app no longer offers (they now submit a real ID), or
// approved but asked by HR for a new selfie.
export const resubmittableEnrollmentFilter = () => ({
  $or: [
    { biometricEnrollmentStatus: { $in: ['not-submitted', 'rejected', 'pending'] } },
    { biometricEnrollmentStatus: { $exists: false } },
    { biometricEnrollmentIsDemo: true },
    { biometricReenrollRequested: true }
  ]
});
