import { Announcement } from '../models/announcementModel.js';
import { sendServerError } from '../middleware/requestSecurity.js';
import { User } from '../models/User.js';
import crypto from 'node:crypto';
import {
  httpSmsIncomingText,
  isValidHttpSmsToken,
  normalizePhilippineNumber,
  sendSms,
  SmsError,
  toPhilippineMobile
} from '../services/smsService.js';
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
      type: 'announcement',
      view: 'calendar'
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
      type: 'announcement',
      view: 'announcements'
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

// Newest first: the whole SMS log for HR's SMS list and SMS Log page, or an employee's
// own texts for their SMS screen.
export const getSmsAlerts = async (req, res) => {
  try {
    res.status(200).json(await Announcement.findSmsAlerts(req.user?.accessLevel === 'hr_admin' ? undefined : req.user));
  } catch (error) {
    sendServerError(res, error);
  }
};

export const createSmsAlert = async (req, res) => {
  try {
    // Resending a text that was not delivered sends the saved message to the same number
    // again and updates that log entry: Sent when it goes through, or Failed with the new reason.
    if (req.body?.resendOf !== undefined) {
      const original = typeof req.body.resendOf === 'string' ? await Announcement.findSmsAlert(req.body.resendOf) : null;
      if (!original || original.direction === 'inbound' || original.status !== 'Failed') {
        return res.status(404).json({ success: false, error: 'Only a text that was not delivered can be sent again.' });
      }
      const sms = await sendSms({
        recipient: original.recipient,
        message: original.message,
        employeeId: original.employeeId,
        employeeEmail: original.employeeEmail,
        timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }),
        kind: original.kind || 'manual',
        resendOf: original.id
      });
      return res.status(200).json({ success: true, sms });
    }

    // A text HR types to one person, starting with who it is from, since it arrives from
    // the SMS phone's own number.
    const { recipient, employeeId, employeeEmail } = req.body || {};
    const text = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!toPhilippineMobile(recipient)) {
      return res.status(400).json({ success: false, error: 'Use a valid mobile number, such as 0917 123 4567.' });
    }
    if (!text) return res.status(400).json({ success: false, error: 'Type the message to send.' });
    const from = req.user?.accessLevel === 'hr_admin' ? 'DILG WorkMate HR' : 'DILG WorkMate';
    const sms = await sendSms({
      recipient,
      message: `${from}: ${text}`,
      employeeId: typeof employeeId === 'string' ? employeeId : '',
      employeeEmail: typeof employeeEmail === 'string' ? employeeEmail : '',
      timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }),
      kind: 'manual'
    });
    res.status(201).json({ success: true, sms });
  } catch (error) {
    if (error instanceof SmsError) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    sendServerError(res, error);
  }
};

// A text sent to the httpSMS phone, checked against HTTPSMS_WEBHOOK_SIGNING_KEY. Only texts
// from WorkMate accounts are kept (`accountsOnly`), since the phone's number also gets
// bank codes, promos, and personal messages that HR must not see.
const readHttpSmsWebhook = req => {
  const signingKey = process.env.HTTPSMS_WEBHOOK_SIGNING_KEY;
  if (!signingKey) return { status: 503, error: 'SMS webhook is not configured.' };
  if (!isValidHttpSmsToken(req.headers.authorization, signingKey)) {
    return { status: 401, error: 'Invalid webhook signature.' };
  }
  const text = httpSmsIncomingText(req.headers['x-event-type'], req.body);
  // Other events, and texts to the phone's other SIM, need nothing done.
  return text ? { text, accountsOnly: true } : { ignore: true };
};

// A text sent to the UniSMS number, checked against UNISMS_WEBHOOK_SECRET.
const readUniSmsWebhook = req => {
  const expectedSecret = process.env.UNISMS_WEBHOOK_SECRET;
  if (!expectedSecret) return { status: 503, error: 'SMS webhook is not configured.' };
  if (!isMatchingSecret(req.headers['webhook-secret-key'], expectedSecret)) {
    return { status: 401, error: 'Invalid webhook secret.' };
  }
  const message = req.body?.message || req.body || {};
  return {
    text: {
      sender: normalizePhilippineNumber(message.sender || message.from || req.body?.sender),
      content: message.content || message.message || req.body?.content || req.body?.message,
      providerMessageId: req.body?.id || message.reference_id || message.id || '',
      timestamp: message.created
    }
  };
};

// Saves a reply texted to WorkMate's SMS number and tells HR. httpSMS marks its calls
// with X-Event-Type; anything else is read as UniSMS.
export const receiveSmsWebhook = async (req, res) => {
  try {
    const incoming = req.headers['x-event-type'] ? readHttpSmsWebhook(req) : readUniSmsWebhook(req);
    if (incoming.error) return res.status(incoming.status).json({ success: false, error: incoming.error });
    if (incoming.ignore) return res.status(200).json({ success: true, ignored: true });

    const { sender, content, providerMessageId, timestamp } = incoming.text;
    if (!sender || !content) {
      return res.status(400).json({ success: false, error: 'Webhook sender and message content are required.' });
    }

    const employee = await User.findByPhoneNumber(sender);
    if (incoming.accountsOnly && !employee) return res.status(200).json({ success: true, ignored: true });
    const sms = await Announcement.createIncomingSms({
      id: providerMessageId ? `sms-in-${providerMessageId}` : undefined,
      recipient: sender,
      sender,
      message: content,
      providerMessageId,
      employeeId: employee?.employeeId || '',
      employeeEmail: employee?.email || '',
      timestamp: timestamp || new Date().toISOString()
    });

    // The reply is from the employee, so HR is the one told about it.
    await Announcement.createNotification({
      title: 'New SMS Reply',
      message: `${employee ? `${employee.name || employee.email} (${sender})` : sender} replied by SMS: ${content}`,
      type: 'system',
      recipientRole: 'hr_admin'
    });

    res.status(200).json({ success: true, sms });
  } catch (error) {
    console.error('SMS webhook error:', error);
    sendServerError(res, error);
  }
};
