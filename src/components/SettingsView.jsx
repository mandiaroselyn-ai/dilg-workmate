/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useEffect, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  CircleAlert,
  CloudUpload,
  HelpCircle,
  Info,
  MapPin,
  RefreshCw,
  Settings
} from 'lucide-react';
import ChangePasswordCard from './ChangePasswordCard';
import { countQueuedAttendance } from '../utils/offlineAttendance';

// Account details, the SMS number, biometric enrollment, and logging out live in Profile and
// the menu; Settings has only what is about this phone and the app.

// Time In needs a GPS fix this accurate (the server checks it too).
const TIME_IN_ACCURACY_METERS = 50;
const BUILD_DATE = typeof __APP_BUILD_DATE__ === 'string' ? __APP_BUILD_DATE__ : '';

const formatDate = value => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
};

const PERMISSION_LABELS = { granted: 'Allowed', denied: 'Blocked', prompt: 'Not yet allowed', unknown: 'Checked when you use it' };

const Card = ({ icon: Icon, title, description, children }) => (
  <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm sm:p-5">
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1e40af]">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <h2 className="text-sm font-black text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>}
      </div>
    </div>
    {children}
  </section>
);

const StatusRow = ({ icon: Icon, label, value, ok, children }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-xs font-bold text-slate-700"><Icon className="h-4 w-4 text-slate-500" />{label}</span>
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
        {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}{value}
      </span>
    </div>
    {children && <div className="mt-2 flex flex-wrap gap-2">{children}</div>}
  </div>
);

const Button = ({ children, onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
  >
    {children}
  </button>
);

const Message = ({ message }) => (message?.text
  ? <p role="status" className={`rounded-lg px-3 py-2 text-xs font-bold ${message.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{message.text}</p>
  : null);

// Asks the browser whether WorkMate may use location or the camera. Browsers that cannot
// tell answer 'unknown'; the permission is then asked when the employee uses it.
const queryPermission = async name => {
  try {
    const status = await navigator.permissions?.query({ name });
    return status?.state || 'unknown';
  } catch {
    return 'unknown';
  }
};

export default function SettingsView({ user = {}, onViewChange, onSyncOfflineAttendance }) {
  const owner = { employeeId: user.employeeId, email: user.email };

  // Phone permissions
  const [permissions, setPermissions] = useState({ geolocation: 'unknown', camera: 'unknown' });
  const [gpsTest, setGpsTest] = useState(null); // { testing } or a message
  const [cameraTest, setCameraTest] = useState(null);
  const refreshPermissions = async () => {
    const [geolocation, camera] = await Promise.all([queryPermission('geolocation'), queryPermission('camera')]);
    setPermissions({ geolocation, camera });
  };
  useEffect(() => { refreshPermissions(); }, []);

  const testGps = () => {
    if (!navigator.geolocation) {
      setGpsTest({ error: true, text: 'This phone or browser cannot share its location.' });
      return;
    }
    setGpsTest({ testing: true, text: 'Finding your location...' });
    navigator.geolocation.getCurrentPosition(position => {
      const accuracy = Math.round(position.coords.accuracy || 0);
      setGpsTest(accuracy <= TIME_IN_ACCURACY_METERS
        ? { text: `Accuracy: ${accuracy} m. Good enough for Time In (${TIME_IN_ACCURACY_METERS} m or better is needed).` }
        : { error: true, text: `Accuracy: ${accuracy} m. Too weak for Time In, which needs ${TIME_IN_ACCURACY_METERS} m or better. Move outdoors or near a window, wait a moment, and test again.` });
      refreshPermissions();
    }, error => {
      setGpsTest({
        error: true,
        text: error.code === 1
          ? 'Location is blocked. Allow location for WorkMate in your phone settings, then test again.'
          : 'Your location could not be found. Turn on Location (GPS), move outdoors or near a window, and test again.'
      });
      refreshPermissions();
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  };

  const testCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraTest({ error: true, text: 'This phone or browser cannot use the camera here.' });
      return;
    }
    setCameraTest({ testing: true, text: 'Opening the camera...' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      stream.getTracks().forEach(track => track.stop());
      setCameraTest({ text: 'The camera works.' });
    } catch (error) {
      setCameraTest({
        error: true,
        text: error?.name === 'NotAllowedError'
          ? 'The camera is blocked. Allow the camera for WorkMate in your phone settings, then test again.'
          : 'The camera could not be opened. Close other apps using the camera and test again.'
      });
    }
    refreshPermissions();
  };

  // Offline records
  const [queued, setQueued] = useState(null); // number, or 'unavailable'
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const recount = async () => {
    try {
      const count = await countQueuedAttendance(owner);
      setQueued(count);
      return count;
    } catch {
      setQueued('unavailable');
      return null;
    }
  };
  useEffect(() => {
    recount();
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
    // Counted when Settings opens; Sync now counts again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncNow = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      await onSyncOfflineAttendance();
      const left = await recount();
      setSyncMessage(left ? { error: true, text: 'Some records could not be sent yet. WorkMate keeps trying while the app is open.' } : { text: 'All records are synced.' });
    } catch {
      setSyncMessage({ error: true, text: 'Unable to sync right now. WorkMate keeps trying while the app is open.' });
    } finally {
      setSyncing(false);
    }
  };

  // App updates
  const [updateMessage, setUpdateMessage] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const checkForUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateMessage(null);
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (!registration) {
        window.location.reload();
        return;
      }
      await registration.update();
      setUpdateMessage(registration.installing || registration.waiting
        ? { text: 'A new version is downloading. WorkMate reloads by itself when it is ready.' }
        : { text: 'You have the latest version.' });
    } catch {
      setUpdateMessage({ error: true, text: 'Unable to check for updates. Check your internet connection and try again.' });
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4 pb-32 font-sans sm:p-6 sm:pb-8 lg:p-8">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1e40af] text-white shadow-sm">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-slate-900">Settings</h1>
            <p className="text-xs text-slate-500">This phone's setup, offline records, your password, and app updates.</p>
          </div>
        </div>

        <Card icon={MapPin} title="Phone permissions" description="Time In needs your location and camera. Test them here if Time In does not work.">
          <StatusRow icon={MapPin} label="Location" value={PERMISSION_LABELS[permissions.geolocation] || PERMISSION_LABELS.unknown} ok={permissions.geolocation === 'granted'}>
            <Button onClick={testGps} disabled={gpsTest?.testing}>{gpsTest?.testing ? 'Testing...' : 'Test GPS'}</Button>
          </StatusRow>
          {gpsTest && !gpsTest.testing && <Message message={gpsTest} />}
          <StatusRow icon={Camera} label="Camera" value={PERMISSION_LABELS[permissions.camera] || PERMISSION_LABELS.unknown} ok={permissions.camera === 'granted'}>
            <Button onClick={testCamera} disabled={cameraTest?.testing}>{cameraTest?.testing ? 'Testing...' : 'Test camera'}</Button>
          </StatusRow>
          {cameraTest && !cameraTest.testing && <Message message={cameraTest} />}
        </Card>

        <Card icon={CloudUpload} title="Offline records" description="A Time Out made without internet is saved on this phone and sent when you are back online.">
          <p className="text-xs font-bold text-slate-700">
            {queued === null ? 'Checking...'
              : queued === 'unavailable' ? 'This browser cannot save records offline.'
                : queued === 0 ? 'Nothing is waiting to sync.'
                  : `${queued} record${queued === 1 ? '' : 's'} saved on this phone, waiting to sync.`}
          </p>
          {!online && <p className="text-[11px] font-semibold text-amber-700">You are offline. Records sync when you are back online.</p>}
          {typeof queued === 'number' && queued > 0 && (
            <Button onClick={syncNow} disabled={syncing || !online}><RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />{syncing ? 'Syncing...' : 'Sync now'}</Button>
          )}
          <Message message={syncMessage} />
        </Card>

        <ChangePasswordCard hasPassword={user.hasPassword !== false} />

        <Card icon={Info} title="About WorkMate" description={BUILD_DATE ? `This version was released on ${formatDate(BUILD_DATE)}.` : ''}>
          <div className="flex flex-wrap gap-2">
            <Button onClick={checkForUpdate} disabled={checkingUpdate}><RefreshCw className={`h-3.5 w-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />{checkingUpdate ? 'Checking...' : 'Check for update'}</Button>
            <Button onClick={() => onViewChange('help')}><HelpCircle className="h-3.5 w-3.5" />Help, FAQ, and privacy notice</Button>
          </div>
          <Message message={updateMessage} />
        </Card>
      </div>
    </div>
  );
}
