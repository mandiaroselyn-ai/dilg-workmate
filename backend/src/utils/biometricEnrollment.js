export const hasRequiredEnrollmentImages = (enrollment = {}) => Boolean(
  enrollment.dilgIdPhoto
  && enrollment.dilgIdBackPhoto
  && enrollment.faceEnrollmentImage
);

export const missingEnrollmentImagesFilter = () => ({
  $or: [
    { dilgIdPhoto: { $exists: false } },
    { dilgIdPhoto: '' },
    { dilgIdBackPhoto: { $exists: false } },
    { dilgIdBackPhoto: '' },
    { faceEnrollmentImage: { $exists: false } },
    { faceEnrollmentImage: '' }
  ]
});
