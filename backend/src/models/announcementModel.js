import mongoose from 'mongoose';
import { isConnected } from '../config/db.js';

// Schemas
const EventSchema = new mongoose.Schema({
  customId: { type: String, required: true },
  title: { type: String, required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  type: { type: String, default: 'event' },
  description: { type: String, default: '' },
  location: { type: String, default: '' }
}, { timestamps: true });

const NotificationSchema = new mongoose.Schema({
  customId: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  time: { type: String, default: 'Just now' },
  read: { type: Boolean, default: false },
  type: { type: String, default: 'system' },
  recipientRole: { type: String, default: '' },
  employeeId: { type: String, default: '' },
  employeeEmail: { type: String, default: '' }
}, { timestamps: true });

const SmsAlertSchema = new mongoose.Schema({
  customId: { type: String, required: true },
  recipient: { type: String, required: true },
  message: { type: String, required: true },
  timestamp: { type: String, required: true },
  status: { type: String, default: 'Sent' },
  providerMessageId: { type: String, default: '' },
  direction: { type: String, enum: ['outbound', 'inbound'], default: 'outbound' },
  sender: { type: String, default: '' },
  employeeId: { type: String, default: '' },
  employeeEmail: { type: String, default: '' }
}, { timestamps: true });

// Mini-settings schema to preserve acknowledged IDs
const SettingSchema = new mongoose.Schema({
  key: { type: String, default: 'acknowledged_ids' },
  ids: { type: [String], default: [] }
});

const MongoEvent = mongoose.models.Event || mongoose.model('Event', EventSchema);
const MongoNotification = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
const MongoSmsAlert = mongoose.models.SmsAlert || mongoose.model('SmsAlert', SmsAlertSchema);
const MongoSetting = mongoose.models.Setting || mongoose.model('Setting', SettingSchema);

const acknowledgedKey = user => `acknowledged_ids:${String(user._id)}`;

function ensureConnected() {
  if (!isConnected()) {
    throw new Error('MongoDB is not connected.');
  }
}

const notificationScope = user => ({
  $or: [
    { employeeId: user.employeeId },
    { employeeEmail: user.email?.toLowerCase?.() },
    { employeeId: '', employeeEmail: '', recipientRole: '' }
  ]
});

const ownedNotificationScope = user => ({
  $or: [
    { employeeId: user.employeeId },
    { employeeEmail: user.email?.toLowerCase?.() }
  ]
});

const serializeNotifications = list => list.map(item => {
  const obj = item.toObject();
  obj.id = obj.customId;
  return obj;
});

export const Announcement = {
  findEvents: async () => {
    ensureConnected();
    const list = await MongoEvent.find().sort({ date: 1 });
    return list.map(item => {
      const obj = item.toObject();
      obj.id = obj.customId;
      return obj;
    });
  },

  createEvent: async (eventData) => {
    ensureConnected();
    const customId = eventData.id || `evt-${Math.floor(Math.random() * 9000) + 1000}-${Date.now().toString().slice(-4)}`;
    const newEventData = {
      customId,
      title: eventData.title,
      date: eventData.date,
      time: eventData.time,
      type: eventData.type || 'event',
      description: eventData.description || '',
      location: eventData.location || ''
    };

    const item = await MongoEvent.create(newEventData);
    const obj = item.toObject();
    obj.id = obj.customId;
    return obj;
  },

  // Acknowledgements are kept per user, so one person signing an announcement
  // does not mark it as signed for everyone else.
  getAcknowledged: async (user) => {
    ensureConnected();
    if (!user?._id) return [];
    const config = await MongoSetting.findOne({ key: acknowledgedKey(user) });
    return config ? config.ids : [];
  },

  acknowledge: async (id, user) => {
    ensureConnected();
    const result = await MongoSetting.findOneAndUpdate(
      { key: acknowledgedKey(user) },
      { $addToSet: { ids: id } },
      { upsert: true, new: true }
    );
    return result.ids;
  },

  findNotifications: async () => {
    ensureConnected();
    const list = await MongoNotification.find().sort({ createdAt: -1 });
    return list.map(item => {
      const obj = item.toObject();
      obj.id = obj.customId;
      return obj;
    });
  },

  findNotificationsForUser: async (user) => {
    ensureConnected();
    return serializeNotifications(await MongoNotification.find(notificationScope(user)).sort({ createdAt: -1 }));
  },

  createNotification: async (notifData) => {
    ensureConnected();
    const customId = notifData.id || `notif-${Date.now()}`;
    const newNotifData = {
      customId,
      title: notifData.title,
      message: notifData.message,
      time: notifData.time || 'Just now',
      read: notifData.read !== undefined ? notifData.read : false,
      type: notifData.type || 'system',
      recipientRole: notifData.recipientRole || '',
      employeeId: notifData.employeeId || '',
      employeeEmail: notifData.employeeEmail?.toString().trim().toLowerCase() || ''
    };

    const item = await MongoNotification.create(newNotifData);
    const obj = item.toObject();
    obj.id = obj.customId;
    return obj;
  },

  clearNotifications: async () => {
    ensureConnected();
    await MongoNotification.updateMany({}, { read: true });
    const list = await MongoNotification.find().sort({ createdAt: -1 });
    return list.map(item => {
      const obj = item.toObject();
      obj.id = obj.customId;
      return obj;
    });
  },

  clearNotificationsForUser: async (user) => {
    ensureConnected();
    await MongoNotification.updateMany(ownedNotificationScope(user), { read: true });
    return serializeNotifications(await MongoNotification.find(notificationScope(user)).sort({ createdAt: -1 }));
  },

  markNotificationAsRead: async (id) => {
    ensureConnected();
    await MongoNotification.updateOne({ customId: id }, { read: true });
    const list = await MongoNotification.find().sort({ createdAt: -1 });
    return list.map(item => {
      const obj = item.toObject();
      obj.id = obj.customId;
      return obj;
    });
  },

  markNotificationAsReadForUser: async (id, user) => {
    ensureConnected();
    await MongoNotification.updateOne({ $and: [{ customId: id }, ownedNotificationScope(user)] }, { read: true });
    return serializeNotifications(await MongoNotification.find(notificationScope(user)).sort({ createdAt: -1 }));
  },

  findSmsAlerts: async () => {
    ensureConnected();
    const list = await MongoSmsAlert.find().sort({ createdAt: -1 });
    return list.map(item => {
      const obj = item.toObject();
      obj.id = obj.customId;
      return obj;
    });
  },

  createSmsAlert: async (smsData) => {
    ensureConnected();
    const customId = smsData.id || `sms-${Date.now()}`;
    const newSmsData = {
      customId,
      recipient: smsData.recipient,
      message: smsData.message,
      timestamp: smsData.timestamp || new Date().toISOString(),
      status: smsData.status || 'Sent',
      providerMessageId: smsData.providerMessageId || '',
      direction: smsData.direction || 'outbound',
      sender: smsData.sender || '',
      employeeId: smsData.employeeId || '',
      employeeEmail: smsData.employeeEmail?.toString().trim().toLowerCase() || ''
    };

    const item = await MongoSmsAlert.create(newSmsData);
    const obj = item.toObject();
    obj.id = obj.customId;
    return obj;
  },

  createIncomingSms: async (smsData) => {
    ensureConnected();
    const customId = smsData.id || `sms-in-${Date.now()}`;
    const item = await MongoSmsAlert.create({
      customId,
      recipient: smsData.recipient,
      message: smsData.message,
      timestamp: smsData.timestamp || new Date().toISOString(),
      status: 'Received',
      providerMessageId: smsData.providerMessageId || '',
      direction: 'inbound',
      sender: smsData.sender || '',
      employeeId: smsData.employeeId || '',
      employeeEmail: smsData.employeeEmail?.toString().trim().toLowerCase() || ''
    });
    const obj = item.toObject();
    obj.id = obj.customId;
    return obj;
  }
};
