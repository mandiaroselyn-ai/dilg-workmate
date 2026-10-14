import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Pages (all non-API routes) come from the network. Without internet, or when a weak signal
// gives no answer within a few seconds, the page saved last time is shown, or else the
// precached index.html, so the phone app opens in the field (see utils/offlineSession.js).
registerRoute(
  new NavigationRoute(new NetworkFirst({
    cacheName: 'navigations',
    networkTimeoutSeconds: 5,
    plugins: [{ handlerDidError: () => matchPrecache('/index.html') }]
  }), {
    denylist: [/^\/api\//]
  })
);

// Handle incoming push notifications
self.addEventListener('push', event => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { return; }

  const { title = 'DILG WorkMate', body = '', icon = '/icons/dilg-logo-192.png' } = data;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: '/icons/dilg-logo-192.png',
      data: data.data || {}
    })
  );
});

// Tapping a notification opens WorkMate on the page it is about: an open tab is told which
// page, and a new tab gets it in the address.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data || {};
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      const client = windowClients[0];
      if (client) {
        client.postMessage({ type: 'dilg-open-notification', target });
        return client.focus();
      }
      return clients.openWindow(`/?openNotification=${encodeURIComponent(JSON.stringify(target))}`);
    })
  );
});
