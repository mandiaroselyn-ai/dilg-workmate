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
