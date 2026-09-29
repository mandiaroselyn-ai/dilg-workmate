import mongoose from 'mongoose';
import { isConnected } from '../config/db.js';
import { createRecordId } from '../utils/recordId.js';
import { stampOf } from '../utils/updateStamp.js';

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
  employeeEmail: { type: String, default: '' },
  // People who read a notice meant for several readers (all employees or all HR/Admins).
  readBy: { type: [String], default: [] }
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

// Announcements that HR publishes to employees (memoranda, guidelines, and so on).
const AnnouncementPostSchema = new mongoose.Schema({
  customId: { type: String, required: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  category: { type: String, default: 'Memorandum' },
  referenceNo: { type: String, default: '' },
  date: { type: String, required: true },
  important: { type: Boolean, default: false },
  author: { type: String, default: '' }
}, { timestamps: true });

const MongoEvent = mongoose.models.Event || mongoose.model('Event', EventSchema);
const MongoAnnouncementPost = mongoose.models.AnnouncementPost || mongoose.model('AnnouncementPost', AnnouncementPostSchema);

const withId = item => {
  const obj = item.toObject();
  obj.id = obj.customId;
  return obj;
};
const MongoNotification = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
const MongoSmsAlert = mongoose.models.SmsAlert || mongoose.model('SmsAlert', SmsAlertSchema);
const MongoSetting = mongoose.models.Setting || mongoose.model('Setting', SettingSchema);

const acknowledgedKey = user => `acknowledged_ids:${String(user._id)}`;

function ensureConnected() {
  if (!isConnected()) {
    throw new Error('MongoDB is not connected.');
  }
}

// Identifies a reader in a notice's readBy list.
export const notificationReaderKey = user => String(user?.employeeId || user?.email || '').trim().toLowerCase();

// The notifications one person sees: their own, their role's (HR/Admin or supervisor),
// and, for employees, notices sent to every employee. Nothing from before their account
// existed, or before they last cleared their notifications, is shown.
export const notificationFilter = user => {
  const own = [
    ...(user?.employeeId ? [{ employeeId: user.employeeId }] : []),
    ...(user?.email ? [{ employeeEmail: String(user.email).trim().toLowerCase() }] : [])
  ];
  const shared = user?.accessLevel === 'employee'
    ? [{ employeeId: '', employeeEmail: '', recipientRole: '' }]
    : ['hr_admin', 'supervisor'].includes(user?.accessLevel) ? [{ recipientRole: user.accessLevel }] : [];
  const audience = [...own, ...shared];
  const since = Math.max(0, ...[user?.createdAt, user?.notificationsClearedAt]
    .map(value => (value ? new Date(value).getTime() : 0))
    .filter(Number.isFinite));
  return {
    $and: [
      { $or: audience.length ? audience : [{ _id: null }] },
      { createdAt: { $gte: new Date(since) } }
    ]
  };
};

// A notice is read for this person when it was marked read for them.
const serializeNotificationsFor = (list, user) => {
  const key = notificationReaderKey(user);
  return list.map(item => {
    const { readBy = [], ...obj } = item.toObject();
    return { ...obj, id: obj.customId, read: Boolean(obj.read || (key && readBy.includes(key))) };
  });
};

const findVisibleNotifications = async user => serializeNotificationsFor(
  await MongoNotification.find(notificationFilter(user)).sort({ createdAt: -1 }),
  user
);

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

  // Applies HR's changes to one event. Returns the updated event, or null if not found.
  updateEvent: async (id, changes) => {
    ensureConnected();
    const item = await MongoEvent.findOneAndUpdate({ customId: id }, { $set: changes }, { new: true, runValidators: true });
    return item ? withId(item) : null;
  },

  deleteEvent: async (id) => {
    ensureConnected();
    const result = await MongoEvent.deleteOne({ customId: id });
    return result.deletedCount === 1;
  },

  // Newest announcements first.
  findAnnouncementPosts: async () => {
    ensureConnected();
    const list = await MongoAnnouncementPost.find().sort({ date: -1, createdAt: -1 });
    return list.map(withId);
  },

  createAnnouncementPost: async (data) => {
    ensureConnected();
    const item = await MongoAnnouncementPost.create({ ...data, customId: createRecordId('ann') });
    return withId(item);
  },

  updateAnnouncementPost: async (id, changes) => {
    ensureConnected();
    const item = await MongoAnnouncementPost.findOneAndUpdate({ customId: id }, { $set: changes }, { new: true, runValidators: true });
    return item ? withId(item) : null;
  },

  deleteAnnouncementPost: async (id) => {
    ensureConnected();
    const result = await MongoAnnouncementPost.deleteOne({ customId: id });
    return result.deletedCount === 1;
  },

  createEvent: async (eventData) => {
    ensureConnected();
    const customId = eventData.id || createRecordId('evt');
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

  // Fingerprints of the announcements, calendar events, and this person's notifications.
  updateStamps: async (user) => {
    ensureConnected();
    const [announcements, events, notifications] = await Promise.all([
      stampOf(MongoAnnouncementPost),
      stampOf(MongoEvent),
      stampOf(MongoNotification, notificationFilter(user))
    ]);
    return { announcements, events, notifications };
  },

  findNotificationsFor: async (user) => {
    ensureConnected();
    return findVisibleNotifications(user);
  },

  createNotification: async (notifData) => {
    ensureConnected();
    const customId = notifData.id || createRecordId('notif');
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

  // Marks only the notifications addressed to the given role (hr_admin or supervisor)
  // as read, so clearing the HR or supervisor bell never touches employees' notifications.
  // Marks every notification this person can see as read, for them only.
  markAllNotificationsReadFor: async (user) => {
    ensureConnected();
    const key = notificationReaderKey(user);
    if (key) await MongoNotification.updateMany(notificationFilter(user), { $addToSet: { readBy: key } });
    return findVisibleNotifications(user);
  },

  markNotificationReadFor: async (id, user) => {
    ensureConnected();
    const key = notificationReaderKey(user);
    if (key && typeof id === 'string') {
      await MongoNotification.updateOne({ $and: [{ customId: id }, notificationFilter(user)] }, { $addToSet: { readBy: key } });
    }
    return findVisibleNotifications(user);
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
    const customId = smsData.id || createRecordId('sms');
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
    const customId = smsData.id || createRecordId('sms-in');
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
