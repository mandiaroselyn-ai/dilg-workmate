import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { subscribeToWebPush } from '../utils/webPush.js';

const currentPermission = () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

const STATUS_LABELS = {
  granted: 'On in this browser',
  denied: 'Blocked in this browser',
  default: 'Off',
  unsupported: 'Not available in this browser'
};

const resultMessage = result => {
  if (result === 'subscribed') return { text: 'Notifications are on. They pop up on this device even when the WorkMate tab is closed.' };
  if (result === 'denied') return { isError: true, text: 'Notifications are blocked. Click the lock icon beside the web address, allow Notifications, then try again.' };
  if (result === 'unsupported') {
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return { isError: true, text: 'On iPhone, add WorkMate to your Home Screen first: in Safari, tap Share, then Add to Home Screen. Open WorkMate from the Home Screen and try again.' };
    return { isError: true, text: 'This browser cannot show notifications. Open WorkMate in Chrome or Edge and try again.' };
  }
  return { isError: true, text: 'Unable to turn on notifications. Check your internet connection and try again.' };
};

// Lets HR/Admins and supervisors, who use WorkMate in a browser, turn on notifications so
// updates pop up on their computer or phone even when the WorkMate tab is closed. Browsers
// only ask for permission after a click, so it is a button.
export default function NotificationsCard({ isHrAdmin = false }) {
  const [permission, setPermission] = useState(currentPermission);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const turnOn = async () => {
    setBusy(true);
    setMessage(null);
    const result = await subscribeToWebPush();
    setMessage(resultMessage(result));
    setPermission(currentPermission());
    setBusy(false);
  };

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-blue-700" aria-hidden="true" />
        <h3 className="text-sm font-black text-slate-900">Notifications</h3>
      </div>
      <p className="text-[11px] text-slate-500">
        {isHrAdmin
          ? 'Get a pop-up on this computer or phone for new requests, accounts to review, and SMS replies from employees, even when WorkMate is closed.'
          : 'Get a pop-up on this computer or phone when a request is waiting for your approval, even when WorkMate is closed.'}
      </p>
      <p className="text-xs font-bold text-slate-700">
        Status: <span className={permission === 'granted' ? 'text-emerald-700' : 'text-slate-600'}>{STATUS_LABELS[permission] || STATUS_LABELS.default}</span>
      </p>
      {message && (
        <p role={message.isError ? 'alert' : 'status'} className={`rounded-xl p-3 text-xs font-bold ${message.isError ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {message.text}
        </p>
      )}
      <button type="button" onClick={turnOn} disabled={busy} className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-black text-white disabled:opacity-50">
        {busy ? 'Turning on...' : 'Turn on notifications'}
      </button>
    </section>
  );
}
