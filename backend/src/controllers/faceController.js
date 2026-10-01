import { Announcement } from '../models/announcementModel.js';
import { User } from '../models/User.js';
import { createFaceDescriptor } from '../services/faceMatchingService.js';
import { hasRequiredEnrollmentImages } from '../utils/biometricEnrollment.js';

const enrollmentStatus = user => ({
  biometricEnrollmentStatus: user.biometricEnrollmentStatus || 'not-submitted',
  biometricEnrollmentIsDemo: Boolean(user.biometricEnrollmentIsDemo),
  hasCompleteEnrollmentImages: hasRequiredEnrollmentImages(user),
  biometricEnrollmentVersion: user.biometricEnrollmentVersion || 1,
  biometricEnrollmentSubmittedAt: user.biometricEnrollmentSubmittedAt || null,
  biometricEnrollmentReviewedAt: user.biometricEnrollmentReviewedAt || null,
  biometricEnrollmentReviewedBy: user.biometricEnrollmentReviewedBy || '',
  biometricEnrollmentReviewNote: user.biometricEnrollmentReviewNote || '',
  faceLivenessStatus: 'not-configured',
  hasBrowserFingerprint: Boolean(user.webauthnCredentialId && user.webauthnPublicKey),
  hasPhoneFingerprint: Boolean(user.nativeBiometricPublicKey)
});

const isSupportedImage = value => typeof value === 'string'
  && /^data:image\/(?:jpeg|png);base64,/i.test(value);

export const getBiometricEnrollmentStatus = async (req, res) => {
  res.set('Cache-Control', 'no-store, private');
  res.status(200).json({ success: true, enrollment: enrollmentStatus(req.user) });
};

export const submitBiometricEnrollment = async (req, res) => {
  try {
    if (req.user?.accessLevel !== 'employee') {
      return res.status(403).json({ success: false, error: 'Only employee accounts can submit biometric enrollment.' });
    }
    const { dilgIdImage, dilgIdBackImage, selfieImage } = req.body || {};
    const isDemoEnrollment = req.body?.isDemoEnrollment === true;
    if (!isSupportedImage(dilgIdImage) || !isSupportedImage(dilgIdBackImage) || !isSupportedImage(selfieImage)) {
      return res.status(400).json({ success: false, error: 'Upload valid front and back government ID images and an enrollment selfie.' });
    }

    const faceDescriptor = await createFaceDescriptor(selfieImage);
    const user = await User.submitBiometricEnrollment(req.user._id, {
      dilgIdImage,
      dilgIdBackImage,
      selfieImage,
      isDemoEnrollment,
      faceDescriptor
    });
    if (user?.conflict) {
      return res.status(409).json({ success: false, error: 'An enrollment is already awaiting HR review or has already been HR-approved.' });
    }
    if (user?.persistenceFailure) {
      return res.status(500).json({ success: false, error: 'The enrollment update completed, but the server could not confirm the saved record. Contact HR before submitting again.' });
    }
    if (!user) return res.status(404).json({ success: false, error: 'Employee account not found.' });
    if (!hasRequiredEnrollmentImages(user)
      || user.dilgIdPhoto !== dilgIdImage
      || user.dilgIdBackPhoto !== dilgIdBackImage
      || user.faceEnrollmentImage !== selfieImage) {
      console.error('Biometric enrollment image persistence verification failed:', {
        employeeId: user.employeeId,
        hasDilgIdPhoto: Boolean(user.dilgIdPhoto),
        hasDilgIdBackPhoto: Boolean(user.dilgIdBackPhoto),
        hasFaceEnrollmentImage: Boolean(user.faceEnrollmentImage)
      });
      return res.status(500).json({
        success: false,
        error: 'The server could not confirm that all ID and selfie images were saved. Please retry the upload.'
      });
    }

    let notificationWarning = '';
    try {
      await Announcement.createNotification({
        title: 'Biometric Enrollment Submitted',
        message: `${user.name || 'An employee'} submitted ${isDemoEnrollment ? 'DEMO ONLY sample ID images and ' : ''}a biometric selfie for HR review. ${isDemoEnrollment ? 'HR may approve for attendance matching tests only; this is not identity verification.' : 'Attendance face matching begins after HR approval.'} Liveness checks are not configured.`,
        type: 'biometric_enrollment',
        recipientRole: 'hr_admin',
        action: 'review_enrollment',
        targetId: user.employeeId || user.email
      });
    } catch (error) {
      console.error('Unable to notify HR about biometric enrollment submission:', error);
      notificationWarning = 'Submission saved, but HR/Admin could not be notified.';
    }

    res.status(201).json({
      success: true,
      enrollment: enrollmentStatus(user),
      notificationWarning,
      notice: isDemoEnrollment
        ? 'DEMO ONLY: sample ID images and your selfie were saved for HR review. HR may approve this enrollment for attendance matching tests only; this is not identity verification.'
        : 'Your ID and selfie were saved for HR review. After HR approves enrollment, attendance selfies will be matched on this server. This does not check liveness.'
    });
  } catch (error) {
    console.error('Biometric enrollment submission failed:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.statusCode ? error.message : 'Unable to submit biometric enrollment.'
    });
  }
};

export const reviewBiometricEnrollment = async (req, res) => {
  try {
    const { decision, note = '' } = req.body || {};
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ success: false, error: 'Choose approve or reject for this enrollment.' });
    }
    if (typeof note !== 'string' || note.trim().length > 500) {
      return res.status(400).json({ success: false, error: 'Review note must be 500 characters or fewer.' });
    }
    if (decision === 'reject' && !note.trim()) {
      return res.status(400).json({ success: false, error: 'Provide a reason so the employee knows what to correct.' });
    }

    const employee = req.params.userId
      ? await User.findBiometricEnrollmentById(req.params.userId)
      : await User.findByEmployeeId(req.params.employeeId);
    if (!employee || employee.accessLevel !== 'employee') {
      return res.status(404).json({ success: false, error: 'Employee account not found.' });
    }
    if (req.params.employeeId
      && String(employee.employeeId || '').trim().toLowerCase() !== String(req.params.employeeId).trim().toLowerCase()) {
      return res.status(409).json({ success: false, error: 'The selected HR employee does not match the biometric record. Refresh employee records before reviewing.' });
    }
    const requiresBackId = (employee.biometricEnrollmentVersion || 1) >= 2;
    const missingImages = [
      !employee.dilgIdPhoto && 'front ID',
      requiresBackId && !employee.dilgIdBackPhoto && 'back ID',
      !employee.faceEnrollmentImage && 'enrollment selfie'
    ].filter(Boolean);
    if (missingImages.length && !employee.biometricEnrollmentIsDemo) {
      return res.status(409).json({
        success: false,
        error: `This employee record is missing ${missingImages.join(', ')}. Reload the HR record; if the image is still missing, ask the employee to resubmit the enrollment.`
      });
    }
    if (decision === 'approve') {
      const hasDescriptor = await User.hasPendingFaceEnrollmentDescriptor(employee._id);
      if (!hasDescriptor) {
        return res.status(409).json({
          success: false,
          error: employee.biometricEnrollmentIsDemo
            ? 'This demo enrollment has no server-processed face template. Ask the employee to resubmit the selfie before approval.'
            : 'This enrollment has no server-processed face template. Ask the employee to resubmit their ID and selfie before approval.'
        });
      }
    }
    const reviewer = req.user?.employeeId || req.user?.email || '';
    const updated = await User.reviewBiometricEnrollment(
      employee._id,
      decision,
      note.trim(),
      reviewer,
      Boolean(employee.biometricEnrollmentIsDemo)
    );
    if (updated?.conflict) {
      return res.status(409).json({ success: false, error: 'This enrollment is no longer pending review.' });
    }
    if (!updated) return res.status(404).json({ success: false, error: 'Employee account not found.' });

    let notificationWarning = '';
    try {
      const approved = decision === 'approve';
      await Announcement.createNotification({
        title: approved ? 'Biometric Enrollment HR Review Approved' : 'Biometric Enrollment Needs Changes',
        message: approved
          ? updated.biometricEnrollmentIsDemo
            ? 'HR approved your DEMO enrollment. Attendance selfies will be compared with the enrollment selfie for testing only; the sample ID does not verify identity.'
            : 'HR approved your ID and face enrollment. Attendance selfies will now be compared with the approved enrollment selfie. Liveness is not checked.'
          : `HR did not approve your ID and selfie submission. Reason: ${note.trim()} You may upload corrected images in Profile > Biometric Enrollment.`,
        type: 'biometric_enrollment',
        employeeId: updated.employeeId,
        employeeEmail: updated.email
      });
    } catch (error) {
      console.error('Unable to notify employee about biometric enrollment review:', error);
      notificationWarning = 'Review saved, but the employee notification could not be sent.';
    }

    res.status(200).json({
      success: true,
      enrollment: enrollmentStatus(updated),
      notificationWarning
    });
  } catch (error) {
    console.error('Biometric enrollment review failed:', error);
    res.status(500).json({ success: false, error: 'Unable to save biometric enrollment review.' });
  }
};

export const getEmployeeEnrollmentImages = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, private');
    const user = req.params.userId
      ? await User.findBiometricEnrollmentById(req.params.userId)
      : await User.findBiometricEnrollmentByEmployeeId(req.params.employeeId);
    if (!user || user.accessLevel !== 'employee') {
      return res.status(404).json({ success: false, error: 'Employee account not found.' });
    }
    if (!user.dilgIdPhoto && !user.dilgIdBackPhoto && !user.faceEnrollmentImage) {
      return res.status(404).json({ success: false, error: 'No enrollment images are on file.' });
    }
    res.status(200).json({
      success: true,
      employeeId: user.employeeId,
      dilgIdImage: user.dilgIdPhoto || '',
      dilgIdBackImage: user.dilgIdBackPhoto || '',
      enrollmentImage: user.faceEnrollmentImage || '',
      enrollment: enrollmentStatus(user)
    });
  } catch (error) {
    console.error('Unable to load restricted biometric enrollment images:', error);
    res.status(500).json({ success: false, error: 'Unable to load enrollment images.' });
  }
};
