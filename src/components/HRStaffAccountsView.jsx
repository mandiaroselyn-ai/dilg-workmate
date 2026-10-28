import React, { useEffect, useState } from 'react';
import { Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../utils/api.js';
import HRResetPasswordCard from './HRResetPasswordCard';
import { ProfileFieldInput, RequiredMark } from './ProfileDetails';
import { EMPLOYMENT_FIELDS, PERSONAL_FIELDS, fullNameOf, profileFieldValues } from '../../shared/profileFields';
import { DEFAULT_REGION, POSITION_TITLES } from '../../shared/dilgAssignments';

const ACCESS_LABELS = { employee: 'Employee', supervisor: 'Supervisor', hr_admin: 'HR/Admin' };
const MIN_PASSWORD_LENGTH = 10;
const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold normal-case text-slate-800 outline-none focus:border-blue-500 focus:bg-white';
const labelClass = 'block text-xs font-black uppercase tracking-wide text-slate-500';

// The name parts go on official forms such as CSC Form No. 6; the full name is built from them.
const NAME_KEYS = ['firstName', 'middleName', 'lastName', 'suffix'];
const NAME_FIELDS = PERSONAL_FIELDS
  .filter(field => NAME_KEYS.includes(field.key))
  .map(field => (['firstName', 'lastName'].includes(field.key) ? { ...field, required: true } : field));
const ASSIGNMENT_FIELDS = [
  { key: 'role', label: 'Position Title', required: true, max: 120, suggestions: POSITION_TITLES, placeholder: 'e.g. Local Government Operations Officer VI' },
  { key: 'office', label: 'Office', required: true, offices: true },
  { key: 'phoneNumber', label: 'Mobile Number', type: 'tel', required: true, max: 20, placeholder: '09XX XXX XXXX' }
];

// HR keeps a staff member's employment details; their other personal details are their own
// to fill in on their profile. A new account needs the date hired and status of appointment,
// like an employee's.
const STAFF_EMPLOYMENT_FIELDS = [
  { key: 'region', label: 'Region', required: true },
  { key: 'dateHired', label: 'Date hired', type: 'date', max: 40 },
  ...EMPLOYMENT_FIELDS
];
const NEW_STAFF_EMPLOYMENT_FIELDS = STAFF_EMPLOYMENT_FIELDS
  .map(field => (['dateHired', 'appointmentStatus'].includes(field.key) ? { ...field, required: true } : field));

const emptyForm = {
  email: '', employeeId: '', accessLevel: 'supervisor', password: '',
  ...profileFieldValues({}, [...NAME_FIELDS, ...ASSIGNMENT_FIELDS, ...STAFF_EMPLOYMENT_FIELDS]),
  region: DEFAULT_REGION
};

// An account saved before the name parts were kept gets them from its full name, for HR to correct.
const nameParts = account => {
  const words = (account.name || '').trim().split(/\s+/).filter(Boolean);
  return account.firstName || account.lastName
    ? profileFieldValues(account, NAME_FIELDS)
    : { ...profileFieldValues({}, NAME_FIELDS), firstName: words[0] || '', lastName: words.slice(1).join(' ') };
};
const isActive = account => !account.accountStatus || account.accountStatus.toLowerCase() === 'active';
const identifierOf = account => account.employeeId || account.email;

// Sends a staff account change and returns the response data, or throws with the
// server's message.
const sendStaffRequest = async (path, method, body) => {
  const response = await apiFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save the change.');
  return data;
};

// HR screen for Supervisor and HR/Admin accounts: create, edit, change access,
// deactivate, and delete. Changes involving HR/Admin access ask for HR's own password.
export default function HRStaffAccountsView({ currentUser = {}, onToast }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(null); // new account form, or null
  const [editing, setEditing] = useState(null); // { account, fields }
  const [pending, setPending] = useState(null); // action waiting for confirmation
  const [adminPassword, setAdminPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isSelf = account => (account.email || '').toLowerCase() === (currentUser.email || '').toLowerCase();

  const loadStaff = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await apiFetch('/api/staff');
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load staff accounts.');
      setStaff(data.staff || []);
    } catch (loadFailure) {
      setLoadError(loadFailure.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  const replaceAccount = updated => setStaff(previous => previous.map(item => item._id === updated._id ? updated : item));

  // Opens the confirmation panel for an action. `run` receives HR's password when needed.
  const confirmAction = action => {
    setError('');
    setAdminPassword('');
    setPending(action);
  };

  const runPending = async event => {
    event.preventDefault();
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      const message = await pending.run(pending.needsPassword ? adminPassword : undefined);
      setPending(null);
      onToast?.(message);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
      setAdminPassword('');
    }
  };

  const submitNewAccount = event => {
    event.preventDefault();
    if (form.password.trim().length < MIN_PASSWORD_LENGTH) {
      setError(`The initial password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    const fields = { ...form, name: fullNameOf(form) };
    confirmAction({
      title: `Create ${ACCESS_LABELS[fields.accessLevel]} account for ${fields.name}?`,
      description: `${fields.email} will be able to log in as ${ACCESS_LABELS[fields.accessLevel]} right away. Share the initial password privately; they can change it under Profile.`,
      needsPassword: fields.accessLevel === 'hr_admin',
      run: async password => {
        const { account } = await sendStaffRequest('/api/staff', 'POST', { ...fields, adminPassword: password });
        setStaff(previous => [...previous, account].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        setForm(null);
        return `${ACCESS_LABELS[account.accessLevel]} account created for ${account.name}.`;
      }
    });
  };

  const submitEdit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      // The full name stays as saved unless HR changed the name parts.
      const before = nameParts(editing.account);
      const renamed = NAME_KEYS.some(key => (editing.fields[key] || '').trim() !== (before[key] || '').trim());
      const fields = { ...editing.fields, name: renamed || !editing.account.name ? fullNameOf(editing.fields) : editing.account.name };
      const { account } = await sendStaffRequest(`/api/staff/${encodeURIComponent(identifierOf(editing.account))}`, 'PATCH', fields);
      replaceAccount(account);
      setEditing(null);
      onToast?.('Account details saved.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const changeAccess = (account, accessLevel) => confirmAction({
    title: `Change ${account.name} to ${ACCESS_LABELS[accessLevel]}?`,
    description: accessLevel === 'employee'
      ? 'They will lose supervisor/HR access and appear in the Employees list instead.'
      : `They will log in with the ${ACCESS_LABELS[accessLevel]} role from now on.`,
    needsPassword: accessLevel === 'hr_admin' || account.accessLevel === 'hr_admin',
    run: async password => {
      const { account: updated } = await sendStaffRequest(`/api/staff/${encodeURIComponent(identifierOf(account))}/access`, 'PATCH', { accessLevel, adminPassword: password });
      if (updated.accessLevel === 'employee') setStaff(previous => previous.filter(item => item._id !== updated._id));
      else replaceAccount(updated);
      return `${updated.name} now has ${ACCESS_LABELS[updated.accessLevel]} access.`;
    }
  });

  const changeStatus = (account, accountStatus) => confirmAction({
    title: `${accountStatus === 'Active' ? 'Reactivate' : 'Deactivate'} ${account.name}?`,
    description: accountStatus === 'Active' ? 'They will be able to log in again.' : 'They will no longer be able to log in.',
    needsPassword: account.accessLevel === 'hr_admin',
    run: async password => {
      const { account: updated } = await sendStaffRequest(`/api/staff/${encodeURIComponent(identifierOf(account))}/status`, 'PATCH', { accountStatus, adminPassword: password });
      replaceAccount(updated);
      return `${updated.name} is now ${updated.accountStatus}.`;
    }
  });

  const deleteAccount = account => confirmAction({
    title: `Delete ${account.name}'s account permanently?`,
    description: 'They will no longer be able to log in. This cannot be undone.',
    needsPassword: account.accessLevel === 'hr_admin',
    run: async password => {
      await sendStaffRequest(`/api/staff/${encodeURIComponent(identifierOf(account))}`, 'DELETE', { adminPassword: password });
      setStaff(previous => previous.filter(item => item._id !== account._id));
      return `${account.name}'s account was deleted.`;
    }
  });

  const updateFormField = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  const updateEditField = event => setEditing(current => ({ ...current, fields: { ...current.fields, [event.target.name]: event.target.value } }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900">Supervisors &amp; HR/Admin</h2>
          <p className="text-xs text-slate-500">Accounts that review requests or manage the system. Changes to HR/Admin access need your password.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={loadStaff} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button type="button" onClick={() => { setError(''); setEditing(null); setForm({ ...emptyForm }); }} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-3 py-2 text-xs font-black text-white">
            <Plus className="h-4 w-4" /> Add Account
          </button>
        </div>
      </div>

      {pending && (
        <form onSubmit={runPending} className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-black text-amber-900">{pending.title}</p>
          <p className="text-xs font-semibold text-amber-800">{pending.description}</p>
          {pending.needsPassword && (
            <label className={labelClass}>Your current password (required for HR/Admin changes)
              <input type="password" autoComplete="current-password" required value={adminPassword} onChange={event => setAdminPassword(event.target.value)} className={inputClass} />
            </label>
          )}
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-2 text-xs font-bold text-rose-700">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{busy ? 'Saving...' : 'Confirm'}</button>
            <button type="button" onClick={() => setPending(null)} disabled={busy} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700">Cancel</button>
          </div>
        </form>
      )}

      {form && !pending && (
        <form onSubmit={submitNewAccount} className="space-y-3 rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-black text-slate-900">New Supervisor or HR/Admin account</p>
          <p className="text-xs text-slate-500">Fields marked <span className="text-rose-600">*</span> are required. Put Provincial Director, Program Manager, and the like under Designation.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[...NAME_FIELDS, ...ASSIGNMENT_FIELDS].map(field => (
              <ProfileFieldInput key={field.key} item={field} value={form[field.key]} values={form} onChange={updateFormField} />
            ))}
            <label className={labelClass}>Email<RequiredMark /><input name="email" type="email" required maxLength={254} value={form.email} onChange={updateFormField} className={inputClass} /></label>
            <label className={labelClass}>Employee ID<input name="employeeId" maxLength={64} value={form.employeeId} onChange={updateFormField} placeholder="Generated if blank" className={inputClass} /></label>
            <label className={labelClass}>Access<RequiredMark />
              <select name="accessLevel" value={form.accessLevel} onChange={updateFormField} className={inputClass}>
                <option value="supervisor">Supervisor</option>
                <option value="hr_admin">HR/Admin</option>
              </select>
            </label>
            <label className={labelClass}>Initial password (at least {MIN_PASSWORD_LENGTH} characters)<RequiredMark />
              <input name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} maxLength={256} value={form.password} onChange={updateFormField} className={inputClass} />
            </label>
            {NEW_STAFF_EMPLOYMENT_FIELDS.map(field => (
              <ProfileFieldInput key={field.key} item={field} value={form[field.key]} values={form} onChange={updateFormField} />
            ))}
          </div>
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-2 text-xs font-bold text-rose-700">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-black text-white">Create account</button>
            <button type="button" onClick={() => setForm(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700">Cancel</button>
          </div>
        </form>
      )}

      {editing && !pending && (
        <form onSubmit={submitEdit} className="space-y-3 rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-black text-slate-900">Edit {editing.account.name}</p>
          <p className="text-xs text-slate-500">Fields marked <span className="text-rose-600">*</span> are required.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[...NAME_FIELDS, ...ASSIGNMENT_FIELDS, ...STAFF_EMPLOYMENT_FIELDS].map(field => (
              <ProfileFieldInput key={field.key} item={field} value={editing.fields[field.key]} values={editing.fields} onChange={updateEditField} />
            ))}
          </div>
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-2 text-xs font-bold text-rose-700">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{busy ? 'Saving...' : 'Save'}</button>
            <button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700">Cancel</button>
          </div>
        </form>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading && <p className="p-6 text-center text-sm font-semibold text-slate-500">Loading accounts...</p>}
        {!loading && loadError && <p role="alert" className="p-6 text-center text-sm font-bold text-rose-700">{loadError}</p>}
        {!loading && !loadError && staff.length === 0 && <p className="p-6 text-center text-sm font-semibold text-slate-500">No Supervisor or HR/Admin accounts yet.</p>}
        {!loading && staff.map(account => {
          const self = isSelf(account);
          return (
            <div key={account._id} className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="font-black text-slate-800">
                  {account.name}
                  {self && <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-black text-blue-700">You</span>}
                </p>
                <p className="text-[11px] text-slate-500">{account.email} • {[account.role || 'No position title', account.designation].filter(Boolean).join(', ')} • {account.office || 'No office'}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-black ${account.accessLevel === 'hr_admin' ? 'bg-indigo-50 text-indigo-700' : 'bg-sky-50 text-sky-700'}`}>
                    <ShieldCheck className="h-3 w-3" /> {ACCESS_LABELS[account.accessLevel]}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-black ${isActive(account) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {account.accountStatus || 'Active'}
                  </span>
                </div>
                {!self && <HRResetPasswordCard account={account} />}
              </div>
              {self ? (
                <p className="max-w-[220px] text-right text-xs font-semibold text-slate-500">Another HR/Admin must change your own access or status. Edit your details under Profile.</p>
              ) : (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button type="button" onClick={() => { setError(''); setForm(null); setEditing({ account, fields: { ...nameParts(account), ...profileFieldValues(account, [...ASSIGNMENT_FIELDS, ...STAFF_EMPLOYMENT_FIELDS]) } }); }} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-black text-slate-700">Edit</button>
                  <select
                    aria-label={`Change access for ${account.name}`}
                    value=""
                    onChange={event => event.target.value && changeAccess(account, event.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-black text-slate-700"
                  >
                    <option value="">Change access…</option>
                    {Object.entries(ACCESS_LABELS).filter(([level]) => level !== account.accessLevel).map(([level, label]) => (
                      <option key={level} value={level}>Make {label}</option>
                    ))}
                  </select>
                  {isActive(account) ? (
                    <button type="button" onClick={() => changeStatus(account, 'Inactive')} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-black text-slate-700">Deactivate</button>
                  ) : (
                    <>
                      <button type="button" onClick={() => changeStatus(account, 'Active')} className="rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-black text-white">Reactivate</button>
                      <button type="button" onClick={() => deleteAccount(account)} className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-black text-rose-700">Delete</button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
