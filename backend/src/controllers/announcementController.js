import { Announcement } from '../models/announcementModel.js';
import { sendServerError } from '../middleware/requestSecurity.js';
import { User } from '../models/User.js';
import crypto from 'node:crypto';
import { normalizePhilippineNumber, sendSms, SmsError } from '../services/smsService.js';
import { normalizeAnnouncementInput, normalizeEventInput } from '../utils/bulletinFields.js';

// Compares hashes so the check takes the same time regardless of where the secrets differ.
const isMatchingSecret = (received, expected) => {
  if (typeof received !== 'string') return false;
  const digest = value => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(digest(received), digest(expected));
};

export const getEvents = async (req, res) => {
  try {
    const evts = await Announcement.findEvents();
    res.status(200).json(evts);
  } catch (error) {
    sendServerError(res, error);
  }
};

export const createEvent = async (req, res) => {
  try {
    const { value, error } = normalizeEventInput(req.body);
    if (error) return res.status(400).json({ success: false, error });
    const created = await Announcement.createEvent(value);
    // A notification with no recipient is shown to every employee.
    await Announcement.createNotification({
      title: 'New Event',
      message: `${created.title} is scheduled on ${created.date}${created.time ? ` at ${created.time}` : ''}. See the Calendar for details.`,
      type: 'announcement'
    }).catch(notifyError => console.error('Unable to notify employees about an event:', notifyError));
    res.status(201).json({ success: true, event: created });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const updateEvent = async (req, res) => {
  try {
    const { value, error } = normalizeEventInput(req.body, { partial: true });
    if (error) return res.status(400).json({ success: false, error });
    const updated = await Announcement.updateEvent(req.params.id, value);
    if (!updated) return res.status(404).json({ success: false, error: 'Event not found.' });
    res.status(200).json({ success: true, event: updated });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const deleteEvent = async (req, res) => {
  try {
    if (!(await Announcement.deleteEvent(req.params.id))) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }
    res.status(200).json({ success: true, id: req.params.id });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const getAnnouncementPosts = async (req, res) => {
  try {
    res.status(200).json(await Announcement.findAnnouncementPosts());
  } catch (error) {
    sendServerError(res, error);
  }
};

export const createAnnouncementPost = async (req, res) => {
  try {
    const { value, error } = normalizeAnnouncementInput(req.body);
    if (error) return res.status(400).json({ success: false, error });
    const created = await Announcement.createAnnouncementPost({ ...value, author: req.user?.name || 'HR Administrator' });
    // A notification with no recipient is shown to every employee.
    await Announcement.createNotification({
      title: created.important ? 'Important Announcement' : 'New Announcement',
      message: `${created.category}: ${created.title}`,
      type: 'announcement'
    }).catch(notifyError => console.error('Unable to notify employees about an announcement:', notifyError));
    res.status(201).json({ success: true, announcement: created });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const updateAnnouncementPost = async (req, res) => {
  try {
    const { value, error } = normalizeAnnouncementInput(req.body, { partial: true });
    if (error) return res.status(400).json({ success: false, error });
    const updated = await Announcement.updateAnnouncementPost(req.params.id, value);
    if (!updated) return res.status(404).json({ success: false, error: 'Announcement not found.' });
    res.status(200).json({ success: true, announcement: updated });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const deleteAnnouncementPost = async (req, res) => {
  try {
    if (!(await Announcement.deleteAnnouncementPost(req.params.id))) {
      return res.status(404).json({ success: false, error: 'Announcement not found.' });
    }
    res.status(200).json({ success: true, id: req.params.id });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const acknowledgeAnnouncement = async (req, res) => {
  try {
    const { id } = req.body;
    if (typeof id !== 'string' || !id || id.length > 128) {
      return res.status(400).json({ success: false, error: 'A valid announcement ID is required.' });
    }
    const list = await Announcement.acknowledge(id, req.user);
    res.status(200).json({ success: true, acknowledged: list });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const getNotifications = async (req, res) => {
  try {
    res.status(200).json(await Announcement.findNotificationsFor(req.user));
  } catch (error) {
    sendServerError(res, error);
  }
};

export const createNotification = async (req, res) => {
  try {
    const notificationBody = { ...req.body };
    // The server assigns notification IDs so a client cannot reuse an existing one.
    delete notificationBody.id;
    if (req.user?.accessLevel === 'employee') {
      notificationBody.employeeId = req.user.employeeId;
      notificationBody.employeeEmail = req.user.email;
      notificationBody.recipientRole = '';
    }
    const newNotif = await Announcement.createNotification(notificationBody);
    res.status(201).json({ success: true, notification: newNotif });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const clearNotifications = async (req, res) => {
  try {
    res.status(200).json({ success: true, notifications: await Announcement.markAllNotificationsReadFor(req.user) });
  } catch (error) {
    sendServerError(res, error);
  }
};

// Hides every notification this person has now; only newer ones are shown afterwards.
// The notifications themselves are kept.
export const dismissNotifications = async (req, res) => {
  try {
    const updated = await User.setNotificationsClearedAt(req.user._id, new Date());
    if (!updated) return res.status(404).json({ success: false, error: 'Account not found.' });
    res.status(200).json({ success: true, notifications: await Announcement.findNotificationsFor(updated) });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const readNotification = async (req, res) => {
  try {
    const { id } = req.params;
    res.status(200).json({ success: true, notifications: await Announcement.markNotificationReadFor(id, req.user) });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const createSmsAlert = async (req, res) => {
  try {
    const { recipient, message, employeeId, employeeEmail, timestamp } = req.body;
    const sms = await sendSms({ recipient, message, employeeId, employeeEmail, timestamp });
    res.status(201).json({ success: true, sms });
  } catch (error) {
    if (error instanceof SmsError) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    sendServerError(res, error);
  }
};

export const receiveSmsWebhook = async (req, res) => {
  try {
    const expectedSecret = process.env.UNISMS_WEBHOOK_SECRET;
    if (!expectedSecret) {
      return res.status(503).json({ success: false, error: 'SMS webhook is not configured.' });
    }
    if (!isMatchingSecret(req.headers['webhook-secret-key'], expectedSecret)) {
      return res.status(401).json({ success: false, error: 'Invalid webhook secret.' });
    }

    const message = req.body?.message || req.body || {};
    const sender = normalizePhilippineNumber(message.sender || message.from || req.body?.sender);
    const content = message.content || message.message || req.body?.content || req.body?.message;
    const providerMessageId = req.body?.id || message.reference_id || message.id || '';
    const ourNumber = normalizePhilippineNumber(message.recipient || req.body?.recipient || '');

    if (!sender || !content) {
      return res.status(400).json({ success: false, error: 'Webhook sender and message content are required.' });
    }

    const employee = await User.findByPhoneNumber(sender);
    const sms = await Announcement.createIncomingSms({
      id: providerMessageId ? `sms-in-${providerMessageId}` : undefined,
      recipient: sender,
      sender,
      message: content,
      providerMessageId,
      employeeId: employee?.employeeId || '',
      employeeEmail: employee?.email || '',
      timestamp: message.created || new Date().toISOString()
    });

    if (employee) {
      await Announcement.createNotification({
        title: 'New SMS Reply',
        message: `You received a reply by SMS: ${content}`,
        type: 'system',
        employeeId: employee.employeeId,
        employeeEmail: employee.email,
        time: 'Just now'
      });
    }

    res.status(200).json({ success: true, sms });
  } catch (error) {
    console.error('UniSMS webhook error:', error);
    sendServerError(res, error);
  }
};
