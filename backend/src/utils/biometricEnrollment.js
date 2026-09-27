export const hasRequiredEnrollmentImages = (enrollment = {}) => Boolean(
  enrollment.dilgIdPhoto
  && enrollment.dilgIdBackPhoto
  && enrollment.faceEnrollmentImage
);

export const resubmittableEnrollmentFilter = () => ({
  $or: [
    { biometricEnrollmentStatus: { $in: ['not-submitted', 'rejected', 'pending'] } },
    { biometricEnrollmentStatus: { $exists: false } }
  ]
});
