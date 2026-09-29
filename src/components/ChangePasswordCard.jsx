import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { apiFetch, storeSessionToken } from '../utils/api.js';

const MIN_PASSWORD_LENGTH = 10;
const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white';
const labelClass = 'block text-[10px] font-black uppercase tracking-wide text-slate-500';

// Lets any signed-in user change their password. Accounts created with Google sign-in
// have no password yet, so they only choose a new one.
export default function ChangePasswordCard({ hasPassword = true }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { text, isError }

  const submit = async event => {
    event.preventDefault();
    setMessage(null);
    if (newPassword.trim().length < MIN_PASSWORD_LENGTH) {
      setMessage({ text: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`, isError: true });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ text: 'The new passwords do not match.', isError: true });
      return;
    }
    setSaving(true);
    try {
      const response = await apiFetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to change your password.');
      // Other sessions were ended; this one continues with the new token.
      if (data.token) storeSessionToken(data.token);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage({ text: data.message || 'Password changed.', isError: false });
    } catch (error) {
      setMessage({ text: error.message || 'Unable to change your password.', isError: true });
    } finally {
      setSaving(false);
    }
  };

  const type = showPasswords ? 'text' : 'password';

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-blue-700" />
          <h3 className="text-sm font-black text-slate-900">{hasPassword ? 'Change password' : 'Set a password'}</h3>
        </div>
        <button type="button" onClick={() => setShowPasswords(value => !value)} className="inline-flex items-center gap-1 text-[10px] font-black text-slate-500">
          {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {showPasswords ? 'Hide' : 'Show'}
        </button>
      </div>
      <p className="text-[11px] text-slate-500">
        {hasPassword
          ? 'Changing your password signs you out on your other devices.'
          : 'Your account uses Google sign-in. Set a password to also log in with your email.'}
      </p>
      {hasPassword && (
        <label className={labelClass}>Current password
          <input type={type} autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required className={inputClass} />
        </label>
      )}
      <label className={labelClass}>New password (at least {MIN_PASSWORD_LENGTH} characters)
        <input type={type} autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} required minLength={MIN_PASSWORD_LENGTH} maxLength={256} className={inputClass} />
      </label>
      <label className={labelClass}>Confirm new password
        <input type={type} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required className={inputClass} />
      </label>
      {message && (
        <p role={message.isError ? 'alert' : 'status'} className={`rounded-xl p-3 text-xs font-bold ${message.isError ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {message.text}
        </p>
      )}
      <button type="submit" disabled={saving} className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-black text-white disabled:opacity-50">
        {saving ? 'Saving...' : hasPassword ? 'Change password' : 'Set password'}
      </button>
    </form>
  );
}
