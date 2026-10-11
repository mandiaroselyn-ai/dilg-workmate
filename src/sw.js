import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Navigation fallback: serve index.html for all non-API routes
registerRoute(
  new NavigationRoute(new NetworkFirst({ cacheName: 'navigations' }), {
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

// When the user taps the notification, open the app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      if (windowClients.length > 0) {
        return windowClients[0].focus();
      }
      return clients.openWindow('/');
    })
  );
});
