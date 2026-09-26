import { User } from '../models/User.js';
import { enrollFace, verifyFace } from '../services/faceVerificationService.js';
import { createVerificationProof } from '../utils/verificationProof.js';

export const enrollEmployeeFace = async (req, res) => {
  try {
    const { employeeId, image } = req.body || {};
    if (!employeeId || !image) return res.status(400).json({ success: false, error: 'Employee ID and selfie image are required.' });
    const enrollment = await enrollFace({ employeeId, image });
    const user = await User.saveFaceEnrollment(employeeId, { ...enrollment, provider: 'aws-rekognition' });
    if (!user) return res.status(404).json({ success: false, error: 'Employee account not found.' });
    res.status(201).json({ success: true, employeeId, faceEnrolledAt: user.faceEnrolledAt });
  } catch (error) {
    res.status(503).json({ success: false, error: error.message });
  }
};

export const verifyEmployeeFace = async (req, res) => {
  try {
    const { employeeId, image } = req.body || {};
    const user = await User.findByEmployeeId(employeeId);
    if (!user?.faceId) return res.status(409).json({ success: false, error: 'Employee face is not enrolled.' });
    const result = await verifyFace({ employeeId, image });
    res.status(200).json({
      success: true,
      ...result,
      verificationProof: result.matched
        ? createVerificationProof({ employeeId, type: 'face', confidence: result.confidence })
        : null,
      provider: 'aws-rekognition',
      verifiedAt: result.matched ? new Date().toISOString() : null
    });
  } catch (error) {
    res.status(503).json({ success: false, error: error.message });
  }
};