import assert from 'node:assert/strict';
import test from 'node:test';
import { getVapidPublicKey, vapidSetting } from './pushService.js';

test('push keys pasted with a hidden byte order mark or a line break still work', t => {
  const saved = process.env.VAPID_PUBLIC_KEY;
  t.after(() => {
    if (saved === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = saved;
  });

  process.env.VAPID_PUBLIC_KEY = '﻿BHDY87qzXv8\n';
  assert.equal(getVapidPublicKey(), 'BHDY87qzXv8');
  assert.equal(vapidSetting('VAPID_PUBLIC_KEY'), 'BHDY87qzXv8');

  process.env.VAPID_PUBLIC_KEY = '';
  assert.equal(getVapidPublicKey(), '');
});

test('an attendance reminder rings: high priority, on the ringing channel only for phones that have it', async t => {
  const { PushSubscription } = await import('../models/pushSubscriptionModel.js');
  const { sendPushNotification, REMINDER_CHANNEL } = await import('./pushService.js');
  t.mock.method(PushSubscription, 'find', () => ({
    lean: async () => [
      { type: 'expo', expoToken: 'ExponentPushToken[new-app]', androidChannels: [REMINDER_CHANNEL] },
      { type: 'expo', expoToken: 'ExponentPushToken[old-app]' }
    ]
  }));
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    sent.push(JSON.parse(options.body));
    return new Response('{}', { status: 200 });
  });

  await sendPushNotification({ title: 'Time In Reminder', body: 'Time In by 9:00 AM.', employeeId: 'E-1', ring: true });
  const byToken = Object.fromEntries(sent.map(message => [message.to, message]));
  assert.equal(byToken['ExponentPushToken[new-app]'].channelId, REMINDER_CHANNEL);
  assert.equal(byToken['ExponentPushToken[new-app]'].priority, 'high');
  // An older app has no such channel, and Android would drop the notification sent to it.
  assert.equal(byToken['ExponentPushToken[old-app]'].channelId, undefined);
  assert.equal(byToken['ExponentPushToken[old-app]'].priority, 'high');

  sent.length = 0;
  await sendPushNotification({ title: 'Leave Approved', body: 'Your leave was approved.', employeeId: 'E-1' });
  for (const message of sent) {
    assert.equal(message.channelId, undefined);
    assert.equal(message.priority, undefined);
  }
});

test('a phone registers only the channels WorkMate knows', async t => {
  const { PushSubscription } = await import('../models/pushSubscriptionModel.js');
  const { savePushSubscription, REMINDER_CHANNEL } = await import('./pushService.js');
  const saved = [];
  t.mock.method(PushSubscription, 'findOneAndUpdate', async (filter, update) => { saved.push(update); });

  await savePushSubscription({ type: 'expo', expoToken: 'ExponentPushToken[a]', androidChannels: [REMINDER_CHANNEL, 'made-up'] });
  await savePushSubscription({ type: 'expo', expoToken: 'ExponentPushToken[b]' });
  await savePushSubscription({ type: 'expo', expoToken: 'ExponentPushToken[c]', androidChannels: 'attendance-reminders' });
  assert.deepEqual(saved.map(update => update.androidChannels), [[REMINDER_CHANNEL], [], []]);
});
