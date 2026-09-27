import { User } from '../models/User.js';

export const enrollEmployeeFace = async (req, res) => {
  try {
    const { employeeId, image, dilgIdImage, hrConfirmed } = req.body || {};
    if (!employeeId || !image || !dilgIdImage) {
      return res.status(400).json({
        success: false,
        error: 'Employee ID, DILG ID photo, and enrollment selfie are required.'
      });
    }
    if (hrConfirmed !== true) {
      return res.status(400).json({
        success: false,
        error: 'HR must physically inspect the DILG ID and confirm the employee details against the HR record.'
      });
    }
    if (!image.startsWith('data:image/') || !dilgIdImage.startsWith('data:image/')) {
      return res.status(400).json({ success: false, error: 'Enrollment selfie and DILG ID must be valid image data.' });
    }

    const employee = await User.findByEmployeeId(employeeId);
    if (!employee || employee.accessLevel !== 'employee') {
      return res.status(404).json({ success: false, error: 'Employee account not found.' });
    }

    const verifiedBy = req.user?.employeeId || req.user?.email || '';
    const user = await User.saveFaceEnrollment(employeeId, {
      provider: 'hr-verified-manual',
      enrollmentImage: image,
      dilgIdPhoto: dilgIdImage,
      verifiedBy,
      verifiedDetails: {
        name: employee.name || '',
        employeeId: employee.employeeId,
        office: employee.office || ''
      }
    });
    if (!user) return res.status(404).json({ success: false, error: 'Employee account not found.' });

    try {
      await User.addFaceVerificationAudit(employeeId, {
        outcome: 'hr-enrollment-recorded-no-automated-match',
        reviewedBy: verifiedBy,
        provider: 'manual-hr-review'
      });
    } catch (error) {
      console.error('Unable to add HR enrollment event to audit history:', error);
    }

    res.status(201).json({
      success: true,
      employeeId,
      faceEnrolledAt: user.faceEnrolledAt,
      dilgIdVerifiedAt: user.dilgIdVerifiedAt,
      faceProvider: 'hr-verified-manual',
      notice: 'HR recorded the ID check and selfie. The system did not automatically compare faces or verify liveness.'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getEmployeeEnrollmentImages = async (req, res) => {
  try {
    const user = await User.findByEmployeeId(req.params.employeeId);
    if (!user || user.accessLevel !== 'employee') {
      return res.status(404).json({ success: false, error: 'Employee account not found.' });
    }
    if (!user.dilgIdPhoto && !user.faceEnrollmentImage) {
      return res.status(404).json({ success: false, error: 'No enrollment images are on file.' });
    }
    res.status(200).json({
      success: true,
      dilgIdImage: user.dilgIdPhoto || '',
      enrollmentImage: user.faceEnrollmentImage || ''
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
