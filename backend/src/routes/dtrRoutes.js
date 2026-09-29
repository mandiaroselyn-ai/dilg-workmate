import express from 'express';
import { getDtrLogs, clockInOut, bulkUpdateDtrHistory, updateLocationTracking, getLocationTracking, getActiveLocationTracking, checkGeofenceStatus, resolveGeofenceAssignment } from '../controllers/dtrController.js';
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
router.get('/location/live', authorizeRoles('hr_admin'), getActiveLocationTracking);
router.post('/geofence/check', checkGeofenceStatus);
router.post('/geofence/resolve', resolveGeofenceAssignment);

// The frontend calls /api/dtr/action?action=... (the Vercel function in api/dtr rewrites
// it the same way), so the local Express server needs the same dispatcher.
const actionHandlers = {
  'geofence-check': checkGeofenceStatus,
  'geofence-resolve': resolveGeofenceAssignment,
  'location-update': updateLocationTracking
};
router.post('/action', (req, res) => {
  const handler = actionHandlers[req.query.action];
  if (!handler) return res.status(400).json({ success: false, error: 'Invalid attendance action.' });
  return handler(req, res);
});
router.get('/action', authorizeRoles('hr_admin'), (req, res) => {
  if (req.query.action !== 'location-live') return res.status(400).json({ success: false, error: 'Invalid attendance action.' });
  return getActiveLocationTracking(req, res);
});

export default router;
