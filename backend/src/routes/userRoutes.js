import express from 'express';
import {
  getUserProfile,
  updateUserProfile,
  registerUser,
  updateEmployeeAccountStatus,
  loginUser,
  seedDefaultUsers,
  getEmployees,
  getFullState,
  resetDatabase,
  requestPasswordReset,
  completePasswordReset
} from '../controllers/userController.js';
import { enrollEmployeeFace, verifyEmployeeFace } from '../controllers/faceController.js';
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
router.post('/face/enroll', requireAdmin, enrollEmployeeFace);
router.post('/face/verify', verifyEmployeeFace);
router.post('/biometric/register/options', createRegistrationOptions);
router.post('/biometric/register/verify', verifyRegistration);
router.post('/biometric/authenticate/options', createAuthenticationOptions);
router.post('/biometric/authenticate/verify', verifyAuthentication);
router.post('/register', registerUser);
router.patch('/employees/:identifier/status', requireAdmin, updateEmployeeAccountStatus);
router.post('/login', loginUser);
router.post('/password-reset-request', requestPasswordReset);
router.post('/password-reset', completePasswordReset);
router.post('/seed-default-users', requireAdmin, seedDefaultUsers);
router.get('/employees', requireAdmin, getEmployees);
router.get('/state', getFullState);
router.post('/reset', requireAdmin, resetDatabase);

export default router;
