import { Announcement } from '../models/announcementModel.js';
import { sendServerError } from '../middleware/requestSecurity.js';
import { User } from '../models/User.js';
import crypto from 'node:crypto';

// Compares hashes so the check takes the same time regardless of where the secrets differ.
const isMatchingSecret = (received, expected) => {
  if (typeof received !== 'string') return false;
  const digest = value => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(digest(received), digest(expected));
};

const normalizePhilippineNumber = value => {
  const raw = value?.toString().trim().replace(/[\s()-]/g, '');
  if (!raw) return '';
  if (raw.startsWith('+63')) return raw;
  if (raw.startsWith('63')) return `+${raw}`;
  if (raw.startsWith('09') && raw.length === 11) return `+63${raw.slice(1)}`;
  return raw;
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
    const created = await Announcement.createEvent(req.body);
    res.status(201).json({ success: true, event: created });
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
    const list = req.user?.accessLevel === 'employee'
      ? await Announcement.findNotificationsForUser(req.user)
      : await Announcement.findNotifications();
    res.status(200).json(list);
  } catch (error) {
    sendServerError(res, error);
  }
};

export const createNotification = async (req, res) => {
  try {
    const notificationBody = { ...req.body };
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
    const cleared = req.user?.accessLevel === 'employee'
      ? await Announcement.clearNotificationsForUser(req.user)
      : await Announcement.clearNotifications();
    res.status(200).json({ success: true, notifications: cleared });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const readNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const list = req.user?.accessLevel === 'employee'
      ? await Announcement.markNotificationAsReadForUser(id, req.user)
      : await Announcement.markNotificationAsRead(id);
    res.status(200).json({ success: true, notifications: list });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const createSmsAlert = async (req, res) => {
  try {
    const { recipient, message } = req.body;
    const normalizedRecipient = normalizePhilippineNumber(recipient);
    const apiKey = process.env.UNISMS_API_KEY;
    const apiUrl = process.env.UNISMS_API_URL || 'https://unismsapi.com/api/sms';
    const senderId = process.env.UNISMS_SENDER_ID || 'UniSMS';

    if (!normalizedRecipient || !message) {
      return res.status(400).json({ success: false, error: 'SMS recipient and message are required.' });
    }

    if (!apiKey) {
      return res.status(503).json({ success: false, error: 'UniSMS is not configured. Set UNISMS_API_KEY on the backend.' });
    }

    const providerResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ recipient: normalizedRecipient, content: message, sender_id: senderId })
    });

    const providerData = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok) {
      return res.status(502).json({
        success: false,
        error: providerData?.message || providerData?.error || 'UniSMS rejected the message.'
      });
    }

    const sms = await Announcement.createSmsAlert({
      ...req.body,
      recipient: normalizedRecipient,
      status: 'Sent',
      providerMessageId: providerData?.id || providerData?.message_id || providerData?.message?.reference_id || ''
    });
    res.status(201).json({ success: true, sms });
  } catch (error) {
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
