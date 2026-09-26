import express from 'express';
import { getDtrLogs, clockInOut, bulkUpdateDtrHistory, updateLocationTracking, getLocationTracking, checkGeofenceStatus } from '../controllers/dtrController.js';
import { authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

router.get('/logs', getDtrLogs);
router.post('/clock', clockInOut);
router.put('/history', authorizeRoles('hr_admin'), bulkUpdateDtrHistory);

// Map frontend endpoints
router.post('/attendance', clockInOut);
router.put('/attendance/history', authorizeRoles('hr_admin'), bulkUpdateDtrHistory);

// Location tracking endpoints
router.post('/location/update', updateLocationTracking);
router.get('/location/history/:employeeId', getLocationTracking);
router.post('/geofence/check', checkGeofenceStatus);

export default router;
