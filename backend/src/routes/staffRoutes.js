import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { changeAccess, changeStaffStatus, createStaff, deleteStaff, listStaff, updateStaff } from '../controllers/staffController.js';

// Supervisor and HR/Admin account management. Only HR/Admin may use these routes.
const router = express.Router();

router.get('/staff', requireAdmin, listStaff);
router.post('/staff', requireAdmin, createStaff);
router.patch('/staff/:identifier', requireAdmin, updateStaff);
router.patch('/staff/:identifier/access', requireAdmin, changeAccess);
router.patch('/staff/:identifier/status', requireAdmin, changeStaffStatus);
router.delete('/staff/:identifier', requireAdmin, deleteStaff);

export default router;
