import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { apiFetch } from '../utils/api';

// TEMPORARY, while WorkMate is being tested (the user asked on 2026-11-25): HR removes the records
// that accounts deleted during testing left behind (see backend services/deletedAccountRecords.js).
// Take it out once WorkMate holds DILG's real records, which are kept (RA 9470). `onRemoved` reloads
// HR's attendance and requests.
const KINDS = [
  ['attendance', 'attendance record'],
  ['requests', 'leave or Travel Order request'],
  ['submissions', 'submitted DTR'],
  ['signedForms', 'signed form'],
  ['travelReports', 'travel report']
];
const describe = counts => KINDS
  .filter(([kind]) => counts?.[kind])
  .map(([kind, label]) => `${counts[kind]} ${label}${counts[kind] === 1 ? '' : 's'}`)
  .join(', ');

export default function DeletedAccountRecordsCleanup({ onRemoved }) {
  const [counts, setCounts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: '', error: false });

  useEffect(() => {
    let active = true;
    apiFetch('/api/deleted-account-records')
      .then(response => response.json())
      .then(data => { if (active && data.success) setCounts(data.counts); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const total = counts ? Object.values(counts).reduce((sum, count) => sum + (Number(count) || 0), 0) : 0;
  if (!total && !message.text) return null;

  const remove = async () => {
    if (!window.confirm(`Remove for good the ${describe(counts)} left by deleted accounts?\n\nOnly for test accounts while WorkMate is being tested. Once DILG's real records are in WorkMate, they are kept (RA 9470), and this is taken out.`)) return;
    setBusy(true);
    setMessage({ text: '', error: false });
    try {
      const response = await apiFetch('/api/deleted-account-records', { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to remove the records.');
      setCounts(null);
      setMessage({ text: `Removed: ${describe(data.removed) || 'nothing left to remove'}.`, error: false });
      onRemoved?.();
    } catch (error) {
      setMessage({ text: error.message || 'Unable to remove the records.', error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs">
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-black text-amber-900">Records of deleted accounts (testing clean-up)</p>
            <p className="mt-0.5 font-semibold text-amber-800">{describe(counts)} are left from accounts that were deleted.</p>
          </div>
          <button type="button" onClick={remove} disabled={busy} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 font-black text-white disabled:opacity-50">
            <Trash2 className="h-4 w-4" />{busy ? 'Removing…' : 'Remove them'}
          </button>
        </div>
      )}
      {message.text && <p role={message.error ? 'alert' : 'status'} className={`font-bold ${message.error ? 'text-rose-700' : 'text-emerald-700'} ${total > 0 ? 'mt-2' : ''}`}>{message.text}</p>}
    </section>
  );
}
