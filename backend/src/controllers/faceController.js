import { Announcement } from '../models/announcementModel.js';
import { User } from '../models/User.js';
import {
  analyzeFace,
  compareIdPhotoToSelfie,
  enrollmentSelfieProblem
} from '../services/faceMatchingService.js';
import { hasRequiredEnrollmentImages } from '../utils/biometricEnrollment.js';
import { pendingFingerprints } from '../utils/passwordSecurity.js';
import { enrollmentIdNeedsBack, enrollmentIdType, normalizeEnrollmentIdNumber } from '../../../shared/enrollmentIds.js';

const enrollmentStatus = user => ({
  biometricEnrollmentStatus: user.biometricEnrollmentStatus || 'not-submitted',
  biometricEnrollmentIsDemo: Boolean(user.biometricEnrollmentIsDemo),
  // Which ID was submitted (its number is shown only to HR, with the images).
  enrollmentIdType: user.enrollmentIdType || '',
  hasCompleteEnrollmentImages: hasRequiredEnrollmentImages(user),
  biometricEnrollmentVersion: user.biometricEnrollmentVersion || 1,
  biometricEnrollmentSubmittedAt: user.biometricEnrollmentSubmittedAt || null,
  biometricEnrollmentReviewedAt: user.biometricEnrollmentReviewedAt || null,
  biometricEnrollmentReviewedBy: user.biometricEnrollmentReviewedBy || '',
  biometricEnrollmentReviewNote: user.biometricEnrollmentReviewNote || '',
  // HR asked for a new enrollment selfie; the approved one stays in use until it is sent.
  biometricReenrollRequested: Boolean(user.biometricReenrollRequested),
  faceLivenessStatus: user.faceLivenessStatus || 'not-configured',
  hasBrowserFingerprint: Boolean(user.webauthnCredentialId && user.webauthnPublicKey),
  hasPhoneFingerprint: Boolean(user.nativeBiometricPublicKey),
  ...pendingFingerprints(user)
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
    const { dilgIdImage, selfieImage } = req.body || {};
    // Which ID it is (see shared/enrollmentIds.js), and its number as printed.
    const idType = enrollmentIdType(req.body?.idType);
    if (!idType) {
      return res.status(400).json({ success: false, error: 'Choose the type of ID you are submitting.' });
    }
    const idNumber = normalizeEnrollmentIdNumber(req.body?.idNumber);
    if (!idNumber) {
      return res.status(400).json({ success: false, error: 'Enter your ID number (letters, numbers, and dashes).' });
    }
    // The back is asked only of an ID that has details on it.
    const dilgIdBackImage = isSupportedImage(req.body?.dilgIdBackImage) ? req.body.dilgIdBackImage : '';
    if (!isSupportedImage(dilgIdImage) || !isSupportedImage(selfieImage) || (idType.backNeeded && !dilgIdBackImage)) {
      return res.status(400).json({
        success: false,
        error: idType.backNeeded
          ? 'Upload clear photos of the front and back of your ID and an enrollment selfie.'
          : 'Upload a clear photo of your ID and an enrollment selfie.'
      });
    }

    // The selfie is what every attendance selfie is matched with, so it must be clear.
    const selfieFace = await analyzeFace(selfieImage);
    const qualityProblem = enrollmentSelfieProblem(selfieFace);
    if (qualityProblem) return res.status(422).json({ success: false, error: qualityProblem });
    const faceDescriptor = selfieFace.descriptor;
    // To help HR: how close the face on the ID is to the selfie.
    const idFaceDistance = await compareIdPhotoToSelfie({ idImage: dilgIdImage, selfieImage, selfieFace });
    const user = await User.submitBiometricEnrollment(req.user._id, {
      dilgIdImage,
      dilgIdBackImage,
      idType: idType.value,
      idNumber,
      idFaceDistance,
      selfieImage,
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
        message: `${user.name || 'An employee'} submitted their ${idType.label} and an enrollment selfie for HR review. Check the ID number against their PDS. Attendance face matching begins after HR approval.`,
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
      notice: 'Your ID and selfie were saved for HR review. After HR approves enrollment, attendance selfies will be matched on this server. This does not check liveness.'
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
    // HR can also ask an approved employee for a new selfie (see requestReenrollment below).
    if (decision === 'reenroll') return requestReenrollment(req, res);
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
    // The sample ID the app used to offer for testing does not show who the employee is.
    if (decision === 'approve' && employee.biometricEnrollmentIsDemo) {
      return res.status(409).json({ success: false, error: 'This submission used the sample ID, which is no longer accepted. Reject it so the employee submits their real ID.' });
    }
    const requiresBackId = (employee.biometricEnrollmentVersion || 1) >= 2 && enrollmentIdNeedsBack(employee.enrollmentIdType);
    const missingImages = [
      !employee.dilgIdPhoto && 'front ID',
      requiresBackId && !employee.dilgIdBackPhoto && 'back ID',
      !employee.faceEnrollmentImage && 'enrollment selfie'
    ].filter(Boolean);
    if (missingImages.length) {
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
          error: 'This enrollment has no server-processed face template. Ask the employee to resubmit their ID and selfie before approval.'
        });
      }
    }
    const reviewer = req.user?.employeeId || req.user?.email || '';
    const updated = await User.reviewBiometricEnrollment(
      employee._id,
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
          ? 'HR approved your ID and face enrollment. Attendance selfies will now be compared with the approved enrollment selfie. Liveness is not checked.'
          : `HR did not approve your ID and selfie submission. Reason: ${note.trim()} You may upload corrected images in Profile > Biometric Enrollment.`,
        type: 'biometric_enrollment',
        view: 'profile',
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

// HR asks an approved employee for a new enrollment selfie, with the reason, for example when
// their looks changed and Time In keeps failing the face match. The approved one stays in use
// until the employee submits the new one; Time In then waits for HR to approve it.
const requestReenrollment = async (req, res) => {
  try {
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    if (!note || note.length > 500) {
      return res.status(400).json({ success: false, error: 'Write why a new selfie is needed (500 characters or fewer), so the employee knows.' });
    }
    const employee = req.params.userId
      ? await User.findBiometricEnrollmentById(req.params.userId)
      : await User.findByEmployeeId(req.params.employeeId);
    if (!employee || employee.accessLevel !== 'employee') {
      return res.status(404).json({ success: false, error: 'Employee account not found.' });
    }
    const updated = await User.requestReenrollment(employee._id, note, req.user?.employeeId || req.user?.email || '');
    if (!updated) {
      return res.status(409).json({ success: false, error: 'Only an HR-approved enrollment can be asked for a new selfie.' });
    }
    let notificationWarning = '';
    try {
      await Announcement.createNotification({
        title: 'HR Asks for a New Enrollment Selfie',
        message: `HR asked you to take a new enrollment selfie. Reason: ${note} Open Profile > Biometric Enrollment and submit your ID and a new selfie. Your current one stays in use until you submit; after that, Time In waits until HR approves the new one.`,
        type: 'biometric_enrollment',
        view: 'profile',
        employeeId: updated.employeeId,
        employeeEmail: updated.email
      });
    } catch (error) {
      console.error('Unable to notify employee about a re-enrollment request:', error);
      notificationWarning = 'Request saved, but the employee notification could not be sent.';
    }
    res.status(200).json({ success: true, enrollment: enrollmentStatus(updated), notificationWarning });
  } catch (error) {
    console.error('Re-enrollment request failed:', error);
    res.status(500).json({ success: false, error: 'Unable to ask for a new enrollment selfie.' });
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
      // Which ID it is and its number, for HR to check against the employee's PDS.
      enrollmentIdType: user.enrollmentIdType || '',
      enrollmentIdLabel: enrollmentIdType(user.enrollmentIdType)?.label || '',
      enrollmentIdNumber: user.enrollmentIdNumber || '',
      // How close the face on the ID is to the selfie (null when no face was found on the ID);
      // false for an enrollment sent before this was compared.
      enrollmentIdFaceCompared: Boolean(user.enrollmentIdFaceCompared),
      enrollmentIdFaceDistance: user.enrollmentIdFaceDistance ?? null,
      enrollment: enrollmentStatus(user)
    });
  } catch (error) {
    console.error('Unable to load restricted biometric enrollment images:', error);
    res.status(500).json({ success: false, error: 'Unable to load enrollment images.' });
  }
};
