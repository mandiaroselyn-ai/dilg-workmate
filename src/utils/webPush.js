import { apiFetch } from './api.js';

const urlBase64ToUint8Array = base64String => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
};

// If running inside the Expo mobile app, register the Expo push token the native
// shell injected. Otherwise subscribe to Web Push. Returns 'subscribed', 'unsupported'
// (this browser cannot receive push; on iPhone, WorkMate must be opened from the Home
// Screen), 'denied', or 'failed'.
export const subscribeToWebPush = async () => {
  try {
    if (window.__expoPushToken) {
      const response = await apiFetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'expo', expoToken: window.__expoPushToken })
      });
      return response.ok ? 'subscribed' : 'failed';
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') return 'unsupported';
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';

    const keyRes = await apiFetch('/api/push/vapid-public-key');
    if (!keyRes.ok) return 'failed';
    const { publicKey } = await keyRes.json();
    if (!publicKey) return 'failed';

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    const response = await apiFetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'web', subscription })
    });
    return response.ok ? 'subscribed' : 'failed';
  } catch {
    return 'failed';
  }
};
