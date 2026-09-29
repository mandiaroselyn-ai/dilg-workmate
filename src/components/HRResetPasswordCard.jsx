import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { apiFetch } from '../utils/api';

// A readable temporary password (no look-alike characters such as 0/O or 1/l).
const makeTemporaryPassword = () => {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const values = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(values, value => letters[value % letters.length]).join('');
};

// Lets HR set a temporary password for someone who cannot reset theirs by email, such as a
// DILG email account. Resetting an HR/Admin's password also needs HR's own password.
export default function HRResetPasswordCard({ account }) {
  const [open, setOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { text, error }
  const isAdminAccount = account?.accessLevel === 'hr_admin';
  const name = account?.name || account?.email || 'this person';

  const close = () => {
    setOpen(false);
    setNewPassword('');
    setAdminPassword('');
  };

  const resetPassword = async event => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const identifier = account.employeeId || account.email;
      const response = await apiFetch(`/api/employees/${encodeURIComponent(identifier)}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword, ...(isAdminAccount ? { adminPassword } : {}) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to reset the password.');
      setMessage({ text: `Password reset. Give ${name} the temporary password in person or by phone, and ask them to change it in Settings after they log in.` });
      close();
    } catch (error) {
      setMessage({ text: error.message || 'Unable to reset the password.', error: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Password</p>
      {open ? (
        <form onSubmit={resetPassword} className="mt-2 space-y-2">
          <p className="text-xs font-semibold text-slate-700">
            Set a temporary password for {name}. They are signed out on their other devices.
          </p>
          <label className="block text-[10px] font-black uppercase text-slate-500">Temporary password (at least 10 characters)
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                autoComplete="off"
                required
                minLength={10}
                maxLength={256}
                value={newPassword}
                onChange={event => setNewPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs font-semibold normal-case text-slate-800"
              />
              <button type="button" onClick={() => setNewPassword(makeTemporaryPassword())} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-700">Generate</button>
            </div>
          </label>
          {isAdminAccount && (
            <label className="block text-[10px] font-black uppercase text-slate-500">Your current password (required for HR/Admin)
              <input type="password" autoComplete="current-password" required value={adminPassword} onChange={event => setAdminPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold normal-case text-slate-800" />
            </label>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{saving ? 'Saving...' : 'Reset password'}</button>
            <button type="button" onClick={close} disabled={saving} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700">Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => { setMessage(null); setOpen(true); }} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-black text-slate-700">
          <KeyRound className="h-3 w-3" /> Reset password
        </button>
      )}
      {message && (
        <p role={message.error ? 'alert' : 'status'} className={`mt-2 rounded-xl p-2 text-[11px] font-bold ${message.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-800'}`}>{message.text}</p>
      )}
    </div>
  );
}
