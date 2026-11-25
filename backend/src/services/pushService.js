import { PushSubscription } from '../models/pushSubscriptionModel.js';

// Loaded lazily so a missing web-push package never crashes the API on startup.
let webpushInstance = null;
let vapidConfigured = false;

// Reads a VAPID setting. A value pasted into a hosting dashboard can carry an invisible
// byte order mark or a line break, which makes the key invalid for browsers and web-push.
export const vapidSetting = name => String(process.env[name] || '').replace(/^\uFEFF/, '').trim();

const ensureVapid = async () => {
  if (vapidConfigured) return true;
  const [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL] = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_EMAIL'].map(vapidSetting);
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_EMAIL) return false;
  try {
    if (!webpushInstance) {
      const mod = await import('web-push');
      webpushInstance = mod.default;
    }
    webpushInstance.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
    return true;
  } catch {
    return false;
  }
};

export const getVapidPublicKey = () => vapidSetting('VAPID_PUBLIC_KEY');

// The phone app's Android channel for the attendance reminders, which rings and vibrates
// (mobile/App.js). Only a phone that says it has the channel gets reminders on it: Android does
// not show a notification sent to a channel the phone lacks.
export const REMINDER_CHANNEL = 'attendance-reminders';
const KNOWN_ANDROID_CHANNELS = [REMINDER_CHANNEL];

// Save or update a push subscription for a user.
export const savePushSubscription = async ({ employeeEmail, employeeId, accessLevel, type, subscription, expoToken, androidChannels }) => {
  const filter = type === 'expo'
    ? { expoToken, type: 'expo' }
    : { 'subscription.endpoint': subscription?.endpoint, type: 'web' };
  const channels = type === 'expo' && Array.isArray(androidChannels)
    ? KNOWN_ANDROID_CHANNELS.filter(channel => androidChannels.includes(channel))
    : [];

  await PushSubscription.findOneAndUpdate(
    filter,
    { employeeEmail, employeeId, accessLevel, type, subscription: subscription || null, expoToken: expoToken || '', androidChannels: channels, updatedAt: new Date() },
    { upsert: true, new: true }
  );
};

// Remove a web push subscription (when user unsubscribes or endpoint goes invalid).
export const removePushSubscription = async (endpoint) => {
  await PushSubscription.deleteOne({ 'subscription.endpoint': endpoint, type: 'web' }).catch(() => {});
};

// Send a push notification to one Web Push subscription. Removes the sub if expired. A reminder
// (`payload.ring`) is sent as urgent, and the browser vibrates and keeps it shown (src/sw.js).
const sendWebPush = async (sub, payload) => {
  const ready = await ensureVapid();
  if (!ready) return;
  try {
    await webpushInstance.sendNotification(sub.subscription, JSON.stringify(payload), payload.ring ? { urgency: 'high' } : {});
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 410) {
      await removePushSubscription(sub.subscription?.endpoint);
    }
  }
};

// Send a push notification to the phone of Expo subscription `sub`. A reminder (`payload.ring`)
// goes at high priority, so a sleeping phone shows it at once, and on the ringing reminder
// channel when the phone has it.
const sendExpoPush = async (sub, payload) => {
  const ringChannel = payload.ring && (sub.androidChannels || []).includes(REMINDER_CHANNEL);
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: sub.expoToken,
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
        sound: 'default',
        ...(payload.ring ? { priority: 'high' } : {}),
        ...(ringChannel ? { channelId: REMINDER_CHANNEL } : {})
      })
    });
  } catch {
    // Never fail the caller when Expo push fails.
  }
};

// Send a push notification to all subscriptions matching the given filter.
// `recipientRole` ('hr_admin', 'supervisor') or `employeeEmail`/`employeeId` narrows the
// audience; with none of them, every employee gets it. `ring` marks an attendance reminder,
// which rings and vibrates.
export const sendPushNotification = async ({ title, body, data, recipientRole, employeeEmail, employeeId, ring = false }) => {
  try {
    const filter = {};
    if (recipientRole) filter.accessLevel = recipientRole;
    else if (employeeEmail) filter.employeeEmail = employeeEmail.toLowerCase();
    else if (employeeId) filter.employeeId = employeeId;
    // A notification with no recipient, such as an announcement or event, is for every employee.
    else filter.accessLevel = 'employee';

    const subs = await PushSubscription.find(filter).lean();
    if (!subs.length) return;

    const payload = { title, body, data, ...(ring ? { ring: true } : {}) };
    await Promise.all(subs.map(sub =>
      sub.type === 'expo' ? sendExpoPush(sub, payload) : sendWebPush(sub, payload)
    ));
  } catch (error) {
    console.error('Push notification failed:', error.message);
  }
};
