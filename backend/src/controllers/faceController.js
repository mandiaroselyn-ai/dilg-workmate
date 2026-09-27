import { Announcement } from '../models/announcementModel.js';
import { User } from '../models/User.js';

const enrollmentStatus = user => ({
  biometricEnrollmentStatus: user.biometricEnrollmentStatus || 'not-submitted',
  biometricEnrollmentVersion: user.biometricEnrollmentVersion || 1,
  biometricEnrollmentSubmittedAt: user.biometricEnrollmentSubmittedAt || null,
  biometricEnrollmentReviewedAt: user.biometricEnrollmentReviewedAt || null,
  biometricEnrollmentReviewedBy: user.biometricEnrollmentReviewedBy || '',
  biometricEnrollmentReviewNote: user.biometricEnrollmentReviewNote || '',
  faceLivenessStatus: 'not-configured'
});

const isSupportedImage = value => typeof value === 'string'
  && /^data:image\/(?:jpeg|png|webp);base64,/i.test(value);

export const getBiometricEnrollmentStatus = async (req, res) => {
  res.status(200).json({ success: true, enrollment: enrollmentStatus(req.user) });
};

export const getOwnEnrollmentReference = async (req, res) => {
  if (req.user?.accessLevel !== 'employee') {
    return res.status(403).json({ success: false, error: 'Only employee accounts can run the attendance test.' });
  }
  if (req.user.biometricEnrollmentStatus !== 'hr-approved' || !req.user.faceEnrollmentImage) {
    return res.status(409).json({ success: false, error: 'Complete Biometric Enrollment and wait for HR approval before running the local attendance test.' });
  }
  res.status(200).json({
    success: true,
    enrollmentImage: req.user.faceEnrollmentImage,
    testOnly: true
  });
};

export const submitBiometricEnrollment = async (req, res) => {
  try {
    if (req.user?.accessLevel !== 'employee') {
      return res.status(403).json({ success: false, error: 'Only employee accounts can submit biometric enrollment.' });
    }
    const { dilgIdImage, dilgIdBackImage, selfieImage } = req.body || {};
    if (!isSupportedImage(dilgIdImage) || !isSupportedImage(dilgIdBackImage) || !isSupportedImage(selfieImage)) {
      return res.status(400).json({ success: false, error: 'Upload valid front and back government ID images and an enrollment selfie.' });
    }

    const user = await User.submitBiometricEnrollment(req.user.email, { dilgIdImage, dilgIdBackImage, selfieImage });
    if (user?.conflict) {
      return res.status(409).json({ success: false, error: 'An enrollment is already awaiting HR review or has already been HR-approved.' });
    }
    if (!user) return res.status(404).json({ success: false, error: 'Employee account not found.' });

    let notificationWarning = '';
    try {
      await Announcement.createNotification({
        title: 'Biometric Enrollment Submitted',
        message: `${user.name || 'An employee'} submitted the front and back of a government ID and a selfie for HR review. Liveness and automatic face matching are not configured.`,
        type: 'biometric_enrollment',
        recipientRole: 'hr_admin'
      });
    } catch (error) {
      console.error('Unable to notify HR about biometric enrollment submission:', error);
      notificationWarning = 'Submission saved, but HR/Admin could not be notified.';
    }

    res.status(201).json({
      success: true,
      enrollment: enrollmentStatus(user),
      notificationWarning,
      notice: 'Your ID and selfie were submitted for HR review. Automatic face matching and liveness are not configured, so this submission is not biometric-verified.'
    });
  } catch (error) {
    console.error('Biometric enrollment submission failed:', error);
    res.status(500).json({ success: false, error: 'Unable to submit biometric enrollment.' });
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

    const employee = await User.findByEmployeeId(req.params.employeeId);
    if (!employee || employee.accessLevel !== 'employee') {
      return res.status(404).json({ success: false, error: 'Employee account not found.' });
    }
    const requiresBackId = (employee.biometricEnrollmentVersion || 1) >= 2;
    if (!employee.dilgIdPhoto || !employee.faceEnrollmentImage || (requiresBackId && !employee.dilgIdBackPhoto)) {
      return res.status(409).json({ success: false, error: 'Front and back government ID images and an enrollment selfie must be on file before HR can review this enrollment.' });
    }
    const reviewer = req.user?.employeeId || req.user?.email || '';
    const updated = await User.reviewBiometricEnrollment(
      req.params.employeeId,
      decision,
      note.trim(),
      reviewer
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
          ? 'HR approved your ID and selfie review. Automatic face matching and liveness are not configured, so your biometric enrollment is not yet verified.'
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
    const user = await User.findByEmployeeId(req.params.employeeId);
    if (!user || user.accessLevel !== 'employee') {
      return res.status(404).json({ success: false, error: 'Employee account not found.' });
    }
    if (!user.dilgIdPhoto && !user.dilgIdBackPhoto && !user.faceEnrollmentImage) {
      return res.status(404).json({ success: false, error: 'No enrollment images are on file.' });
    }
    res.status(200).json({
      success: true,
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
