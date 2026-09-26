import express from 'express';
import { 
  getEvents, 
  createEvent, 
  acknowledgeAnnouncement, 
  getNotifications, 
  createNotification, 
  clearNotifications, 
  readNotification, 
  createSmsAlert,
  receiveSmsWebhook
} from '../controllers/announcementController.js';
import { authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

router.get('/events', getEvents);
router.post('/events', authorizeRoles('hr_admin'), createEvent);
router.post('/announcements/acknowledge', acknowledgeAnnouncement);
router.get('/notifications', getNotifications);
router.post('/notifications', createNotification);
router.post('/notifications/clear', clearNotifications);
router.post('/notifications/:id/read', readNotification);
router.post('/sms', authorizeRoles('supervisor', 'hr_admin'), createSmsAlert);
router.post('/sms/webhook', receiveSmsWebhook);

export default router;
