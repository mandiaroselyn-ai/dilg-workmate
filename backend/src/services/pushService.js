import { PushSubscription } from '../models/pushSubscriptionModel.js';

// Loaded lazily so a missing web-push package never crashes the API on startup.
let webpushInstance = null;
let vapidConfigured = false;

const ensureVapid = async () => {
  if (vapidConfigured) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL } = process.env;
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

export const getVapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || '';

// Save or update a push subscription for a user.
export const savePushSubscription = async ({ employeeEmail, employeeId, accessLevel, type, subscription, expoToken }) => {
  const filter = type === 'expo'
    ? { expoToken, type: 'expo' }
    : { 'subscription.endpoint': subscription?.endpoint, type: 'web' };

  await PushSubscription.findOneAndUpdate(
    filter,
    { employeeEmail, employeeId, accessLevel, type, subscription: subscription || null, expoToken: expoToken || '', updatedAt: new Date() },
    { upsert: true, new: true }
  );
};

// Remove a web push subscription (when user unsubscribes or endpoint goes invalid).
export const removePushSubscription = async (endpoint) => {
  await PushSubscription.deleteOne({ 'subscription.endpoint': endpoint, type: 'web' }).catch(() => {});
};

// Send a push notification to one Web Push subscription. Removes the sub if expired.
const sendWebPush = async (sub, payload) => {
  const ready = await ensureVapid();
  if (!ready) return;
  try {
    await webpushInstance.sendNotification(sub.subscription, JSON.stringify(payload));
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 410) {
      await removePushSubscription(sub.subscription?.endpoint);
    }
  }
};

// Send a push notification to one Expo token.
const sendExpoPush = async (token, payload) => {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: token,
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
        sound: 'default'
      })
    });
  } catch {
    // Never fail the caller when Expo push fails.
  }
};

// Send a push notification to all subscriptions matching the given filter.
// `recipientRole` ('hr_admin', 'supervisor') or `employeeEmail`/`employeeId` narrows the
// audience; with none of them, every employee gets it.
export const sendPushNotification = async ({ title, body, data, recipientRole, employeeEmail, employeeId }) => {
  try {
    const filter = {};
    if (recipientRole) filter.accessLevel = recipientRole;
    else if (employeeEmail) filter.employeeEmail = employeeEmail.toLowerCase();
    else if (employeeId) filter.employeeId = employeeId;
    // A notification with no recipient, such as an announcement or event, is for every employee.
    else filter.accessLevel = 'employee';

    const subs = await PushSubscription.find(filter).lean();
    if (!subs.length) return;

    const payload = { title, body, data };
    await Promise.all(subs.map(sub =>
      sub.type === 'expo' ? sendExpoPush(sub.expoToken, payload) : sendWebPush(sub, payload)
    ));
  } catch (error) {
    console.error('Push notification failed:', error.message);
  }
};
