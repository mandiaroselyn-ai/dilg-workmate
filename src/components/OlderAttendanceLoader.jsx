import React, { useState } from 'react';
import { History } from 'lucide-react';

const monthLabel = month => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

// The 24 months before the month of `from` (YYYY-MM-DD), newest first, as "YYYY-MM".
const monthsBefore = from => {
  const [year, month] = from.split('-').map(Number);
  return Array.from({ length: 24 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 2 - index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
};

// HR's attendance screens hold the records from `from` (the start of the previous month)
// on. This says so, and loads an earlier month when HR picks one.
export default function OlderAttendanceLoader({ from, loadedMonths = [], onLoadMonth }) {
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', error: false });
  if (!from || !onLoadMonth) return null;

  const choices = monthsBefore(from).filter(choice => !loadedMonths.includes(choice));
  const selected = choices.includes(month) ? month : choices[0] || '';
  const load = async () => {
    if (!selected || loading) return;
    setLoading(true);
    setMessage({ text: '', error: false });
    try {
      const count = await onLoadMonth(selected);
      setMessage({ text: `${monthLabel(selected)}: ${count} record${count === 1 ? '' : 's'} loaded.`, error: false });
    } catch (loadError) {
      setMessage({ text: loadError.message || 'Unable to load that month.', error: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <History className="h-4 w-4 shrink-0 text-slate-500" />
      <span className="min-w-0 flex-1 font-semibold text-slate-600">
        Showing records from {monthLabel(from.slice(0, 7))} on{loadedMonths.length ? `, plus ${loadedMonths.map(monthLabel).join(', ')}` : ''}.
      </span>
      {choices.length > 0 && (
        <span className="flex items-center gap-2">
          <select value={selected} onChange={event => setMonth(event.target.value)} aria-label="Earlier month to load" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-bold text-slate-700">
            {choices.map(choice => <option key={choice} value={choice}>{monthLabel(choice)}</option>)}
          </select>
          <button type="button" onClick={load} disabled={loading} className="rounded-lg bg-blue-700 px-3 py-1.5 font-black text-white disabled:opacity-60">
            {loading ? 'Loading…' : 'Load month'}
          </button>
        </span>
      )}
      {message.text && <span role={message.error ? 'alert' : 'status'} className={`w-full font-bold ${message.error ? 'text-rose-700' : 'text-emerald-700'}`}>{message.text}</span>}
    </div>
  );
}
