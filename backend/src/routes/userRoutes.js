import express from 'express';
import {
  getUserProfile,
  updateUserProfile,
  registerUser,
  createEmployee,
  updateEmployee,
  updateEmployeeAccountStatus,
  deleteEmployee,
  changePassword,
  loginUser,
  seedDefaultUsers,
  getEmployees,
  getFullState,
  resetDatabase,
  requestPasswordReset,
  completePasswordReset
} from '../controllers/userController.js';
import {
  getBiometricEnrollmentStatus,
  submitBiometricEnrollment,
  reviewBiometricEnrollment,
  getEmployeeEnrollmentImages
} from '../controllers/faceController.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  createRegistrationOptions,
  verifyRegistration,
  createAuthenticationOptions,
  verifyAuthentication
} from '../controllers/webauthnController.js';
import {
  createNativeBiometricOptions,
  verifyNativeBiometric
} from '../controllers/nativeBiometricController.js';

const router = express.Router();

router.get('/face-enrollment', (req, res) => {
  const { action, employeeId, userId } = req.query;
  if (action === 'status') return getBiometricEnrollmentStatus(req, res);
  if (!action && typeof userId === 'string' && userId) {
    req.params.userId = userId;
    return requireAdmin(req, res, () => getEmployeeEnrollmentImages(req, res));
  }
  if (!action && typeof employeeId === 'string' && employeeId) {
    req.params.employeeId = employeeId;
    return requireAdmin(req, res, () => getEmployeeEnrollmentImages(req, res));
  }
  return res.status(400).json({ success: false, error: 'Invalid biometric enrollment API request.' });
});
router.post('/face-enrollment', (req, res) => {
  const { action, employeeId, userId } = req.query;
  if (!action) return submitBiometricEnrollment(req, res);
  if (action === 'review' && typeof userId === 'string' && userId) {
    req.params.userId = userId;
    req.params.employeeId = typeof employeeId === 'string' ? employeeId : '';
    return requireAdmin(req, res, () => reviewBiometricEnrollment(req, res));
  }
  if (action === 'review' && typeof employeeId === 'string' && employeeId) {
    req.params.employeeId = employeeId;
    return requireAdmin(req, res, () => reviewBiometricEnrollment(req, res));
  }
  return res.status(400).json({ success: false, error: 'Invalid biometric enrollment API request.' });
});

router.get('/profile', getUserProfile);
router.post('/profile', updateUserProfile);
router.post('/user', updateUserProfile);
router.get('/face/enrollment/status', getBiometricEnrollmentStatus);
router.post('/face/enrollment', submitBiometricEnrollment);
router.post('/face/enrollment/id/:userId/review', requireAdmin, reviewBiometricEnrollment);
router.post('/face/enrollment/:employeeId/review', requireAdmin, reviewBiometricEnrollment);
router.get('/face/enrollment/id/:userId', requireAdmin, getEmployeeEnrollmentImages);
router.get('/face/enrollment/:employeeId', requireAdmin, getEmployeeEnrollmentImages);
router.post('/biometric/register/options', createRegistrationOptions);
router.post('/biometric/register/verify', verifyRegistration);
router.post('/biometric/authenticate/options', createAuthenticationOptions);
router.post('/biometric/authenticate/verify', verifyAuthentication);
router.post('/biometric/native/options', createNativeBiometricOptions);
router.post('/biometric/native/verify', verifyNativeBiometric);
router.post('/biometric/action', (req, res) => {
  const actions = {
    'register-options': createRegistrationOptions,
    'register-verify': verifyRegistration,
    'authenticate-options': createAuthenticationOptions,
    'authenticate-verify': verifyAuthentication
  };
  const handler = actions[req.query.action];
  if (!handler) return res.status(400).json({ success: false, error: 'Invalid biometric action.' });
  return handler(req, res);
});
router.post('/register', registerUser);
router.post('/employees', requireAdmin, createEmployee);
router.patch('/employees/:identifier', requireAdmin, updateEmployee);
router.patch('/employees/:identifier/status', requireAdmin, updateEmployeeAccountStatus);
router.delete('/employees/:identifier', requireAdmin, deleteEmployee);
router.post('/login', loginUser);
router.post('/password-reset-request', requestPasswordReset);
router.post('/password-reset', completePasswordReset);
router.post('/change-password', changePassword);
router.post('/seed-default-users', requireAdmin, seedDefaultUsers);
router.get('/employees', requireAdmin, getEmployees);
router.get('/state', getFullState);
router.post('/reset', requireAdmin, resetDatabase);

export default router;
