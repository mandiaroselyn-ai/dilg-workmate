import express from 'express';
import {
  getUserProfile,
  updateUserProfile,
  registerUser,
  createEmployee,
  updateEmployee,
  updateEmployeeAccountStatus,
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
  getOwnEnrollmentReference,
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

const router = express.Router();

router.get('/profile', getUserProfile);
router.post('/profile', updateUserProfile);
router.post('/user', updateUserProfile);
router.get('/face/enrollment/status', getBiometricEnrollmentStatus);
router.get('/face/enrollment/reference', getOwnEnrollmentReference);
router.post('/face/enrollment', submitBiometricEnrollment);
router.post('/face/enrollment/:employeeId/review', requireAdmin, reviewBiometricEnrollment);
router.get('/face/enrollment/:employeeId', requireAdmin, getEmployeeEnrollmentImages);
router.post('/biometric/register/options', createRegistrationOptions);
router.post('/biometric/register/verify', verifyRegistration);
router.post('/biometric/authenticate/options', createAuthenticationOptions);
router.post('/biometric/authenticate/verify', verifyAuthentication);
router.post('/register', registerUser);
router.post('/employees', requireAdmin, createEmployee);
router.patch('/employees/:identifier', requireAdmin, updateEmployee);
router.patch('/employees/:identifier/status', requireAdmin, updateEmployeeAccountStatus);
router.post('/login', loginUser);
router.post('/password-reset-request', requestPasswordReset);
router.post('/password-reset', completePasswordReset);
router.post('/seed-default-users', requireAdmin, seedDefaultUsers);
router.get('/employees', requireAdmin, getEmployees);
router.get('/state', getFullState);
router.post('/reset', requireAdmin, resetDatabase);

export default router;
