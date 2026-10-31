import React, { useState } from 'react';
import { CalendarOff, ChevronDown, Trash2 } from 'lucide-react';
import { getManilaDateString } from '../../shared/localDate';
import { fixedHolidays } from '../../shared/leaveCalc';
import { apiFetch } from '../utils/api';

const dateText = date => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// HR's holidays: the days that are not counted as leave days (and so are not charged to leave
// credits) and have no late or undertime. HR adds a holiday, adds a year's fixed-date national
// holidays at once, or removes one. Holy Week, the Eid holidays, and local holidays are added
// from the year's proclamation.
export default function HRHolidays({ holidays = [], onHolidaysChange }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: '', name: '' });
  const [year, setYear] = useState(() => Number(getManilaDateString().slice(0, 4)));
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState({ text: '', error: false });
  const shown = holidays.filter(holiday => holiday.date.startsWith(String(year)));

  const send = async (path, options, doneText) => {
    setSaving(true);
    setResult({ text: '', error: false });
    try {
      const response = await apiFetch(path, options);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save the holidays.');
      onHolidaysChange?.(data.holidays || []);
      setResult({ text: doneText, error: false });
      return true;
    } catch (saveError) {
      setResult({ text: saveError.message || 'Unable to save the holidays.', error: true });
      return false;
    } finally {
      setSaving(false);
    }
  };
  const add = list => send('/api/holidays', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holidays: list })
  }, `${list.length} holiday${list.length === 1 ? '' : 's'} saved.`);

  const addOne = async event => {
    event.preventDefault();
    if (await add([{ date: form.date, name: form.name.trim() }])) setForm({ date: '', name: '' });
  };
  const addFixed = () => {
    if (window.confirm(`Add the fixed-date national holidays of ${year} (New Year's Day, Araw ng Kagitingan, Labor Day, Independence Day, Ninoy Aquino Day, National Heroes Day, All Saints' Day, Bonifacio Day, Immaculate Conception, Christmas Day, Rizal Day, and the Last Day of the Year)? Check them against this year's proclamation.`)) {
      add(fixedHolidays(year));
    }
  };
  const remove = holiday => {
    if (window.confirm(`Remove ${holiday.name} (${dateText(holiday.date)})? It will count as a working day again, for leave and for late and undertime.`)) {
      send(`/api/holidays?date=${encodeURIComponent(holiday.date)}`, { method: 'DELETE' }, `${holiday.name} removed.`);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="flex items-center gap-2">
          <CalendarOff className="h-5 w-5 shrink-0 text-blue-700" />
          <span>
            <span className="block text-sm font-black text-slate-900">Holidays</span>
            <span className="block text-xs text-slate-500">Not counted as leave days, and have no late or undertime in the DTR.</span>
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 p-4">
          <form onSubmit={addOne} className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] font-black text-slate-600">Date
              <input type="date" required value={form.date} onChange={event => setForm(previous => ({ ...previous, date: event.target.value }))} className="mt-1 block rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold text-slate-800" />
            </label>
            <label className="min-w-[160px] flex-1 text-[11px] font-black text-slate-600">Name
              <input required maxLength={100} value={form.name} onChange={event => setForm(previous => ({ ...previous, name: event.target.value }))} placeholder="For example: Maundy Thursday" className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold text-slate-800" />
            </label>
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Add holiday</button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] font-black text-slate-600">Year
              <input type="number" min="2020" max="2100" value={year} onChange={event => setYear(Number(event.target.value) || year)} className="ml-2 w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-800" />
            </label>
            <button type="button" onClick={addFixed} disabled={saving} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700 disabled:opacity-50">Add {year}'s fixed-date national holidays</button>
          </div>
          {shown.length ? (
            <div className="space-y-1.5">
              {shown.map(holiday => (
                <div key={holiday.date} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs">
                  <span><b className="text-slate-800">{dateText(holiday.date)}</b> · {holiday.name}</span>
                  <button type="button" onClick={() => remove(holiday)} disabled={saving} aria-label={`Remove ${holiday.name}`} className="rounded-md p-1 text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No holidays set for {year}.</p>
          )}
          {result.text && <p role={result.error ? 'alert' : 'status'} className={`text-xs font-bold ${result.error ? 'text-rose-700' : 'text-emerald-700'}`}>{result.text}</p>}
        </div>
      )}
    </section>
  );
}
