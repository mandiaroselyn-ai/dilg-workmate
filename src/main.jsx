import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import './index.css';

// A new version is picked up when the page loads, when the person comes back to the app,
// and every 30 minutes while it is in the background, so an open tab does not keep running
// an old version. The page then reloads itself, and the saved session keeps the person
// signed in.
registerSW({
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const checkForNewVersion = () => {
      registration.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForNewVersion();
    });
    window.setInterval(() => {
      if (document.hidden) checkForNewVersion();
    }, 30 * 60 * 1000);
  },
  onOfflineReady() {
    console.log('PWA ready to work offline');
  }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
