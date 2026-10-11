import express from 'express';
import {
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getAnnouncementPosts,
  createAnnouncementPost,
  updateAnnouncementPost,
  deleteAnnouncementPost,
  acknowledgeAnnouncement,
  getNotifications,
  createNotification,
  clearNotifications,
  dismissNotifications,
  readNotification,
  getSmsAlerts,
  createSmsAlert,
  receiveSmsWebhook
} from '../controllers/announcementController.js';
import { savePushSubscription, getVapidPublicKey } from '../services/pushService.js';
import { authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

router.get('/events', getEvents);
router.post('/events', authorizeRoles('hr_admin'), createEvent);
router.patch('/events/:id', authorizeRoles('hr_admin'), updateEvent);
router.delete('/events/:id', authorizeRoles('hr_admin'), deleteEvent);
router.get('/announcements', getAnnouncementPosts);
router.post('/announcements', authorizeRoles('hr_admin'), createAnnouncementPost);
router.patch('/announcements/:id', authorizeRoles('hr_admin'), updateAnnouncementPost);
router.delete('/announcements/:id', authorizeRoles('hr_admin'), deleteAnnouncementPost);
router.post('/announcements/acknowledge', acknowledgeAnnouncement);
router.get('/notifications', getNotifications);
router.post('/notifications', createNotification);
router.post('/notifications/clear', clearNotifications);
router.post('/notifications/dismiss', dismissNotifications);
router.post('/notifications/:id/read', readNotification);
router.get('/sms', authorizeRoles('hr_admin'), getSmsAlerts);
router.post('/sms', authorizeRoles('supervisor', 'hr_admin'), createSmsAlert);
router.post('/sms/webhook', receiveSmsWebhook);

// Push notification subscription endpoints
router.get('/push/vapid-public-key', (req, res) => {
  const key = getVapidPublicKey();
  if (!key) return res.status(503).json({ error: 'Push notifications are not configured.' });
  res.json({ publicKey: key });
});

router.post('/push/subscribe', async (req, res) => {
  try {
    const { type, subscription, expoToken } = req.body;
    const user = req.user;
    await savePushSubscription({
      employeeEmail: user.email || '',
      employeeId: user.employeeId || '',
      accessLevel: user.accessLevel || 'employee',
      type,
      subscription: type === 'web' ? subscription : null,
      expoToken: type === 'expo' ? expoToken : ''
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save push subscription.' });
  }
});

export default router;
