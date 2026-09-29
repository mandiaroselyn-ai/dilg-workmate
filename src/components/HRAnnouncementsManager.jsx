import React, { useState } from 'react';
import { CalendarDays, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import { getManilaDateString } from '../../shared/localDate';

const ANNOUNCEMENT_CATEGORIES = ['Memorandum', 'Meeting', 'Guidelines', 'Training'];
const EVENT_TYPES = [
  { value: 'meeting', label: 'Meeting' },
  { value: 'training', label: 'Training' },
  { value: 'event', label: 'LGU Event' }
];

const emptyAnnouncement = () => ({
  title: '',
  content: '',
  category: 'Memorandum',
  referenceNo: '',
  date: getManilaDateString(),
  important: false
});

const emptyEvent = () => ({
  title: '',
  date: getManilaDateString(),
  time: '09:00 AM',
  type: 'meeting',
  location: '',
  description: ''
});

const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white';
const labelClass = 'block text-[10px] font-black uppercase tracking-wide text-slate-500';

// HR screen for publishing announcements and scheduling calendar events. Employees see
// them on their Dashboard, Announcements page, and Calendar.
export default function HRAnnouncementsManager({
  announcements = [],
  events = [],
  onCreateAnnouncement,
  onUpdateAnnouncement,
  onDeleteAnnouncement,
  onCreateEvent,
  onUpdateEvent,
  onDeleteEvent,
  onToast
}) {
  const [tab, setTab] = useState('announcements');
  const [editing, setEditing] = useState(null); // { kind, id|null, form }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isAnnouncements = tab === 'announcements';
  const sortedAnnouncements = [...announcements].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const sortedEvents = [...events].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));
  const today = getManilaDateString();

  const startCreate = () => {
    setError('');
    setEditing({ kind: tab, id: null, form: isAnnouncements ? emptyAnnouncement() : emptyEvent() });
  };

  const startEdit = (kind, item) => {
    setError('');
    const form = kind === 'announcements'
      ? { title: item.title || '', content: item.content || item.description || '', category: item.category || 'Memorandum', referenceNo: item.referenceNo || '', date: item.date || today, important: Boolean(item.important) }
      : { title: item.title || '', date: item.date || today, time: item.time || '', type: item.type || 'event', location: item.location || '', description: item.description || '' };
    setEditing({ kind, id: item.id, form });
  };

  const updateField = event => {
    const { name, type, checked, value } = event.target;
    setEditing(current => ({ ...current, form: { ...current.form, [name]: type === 'checkbox' ? checked : value } }));
  };

  const save = async event => {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError('');
    try {
      const { kind, id, form } = editing;
      if (kind === 'announcements') {
        if (id) await onUpdateAnnouncement(id, form);
        else await onCreateAnnouncement(form);
      } else if (id) {
        await onUpdateEvent(id, form);
      } else {
        await onCreateEvent(form);
      }
      onToast?.(id
        ? 'Changes saved.'
        : kind === 'announcements' ? 'Announcement published. Employees were notified.' : 'Event added to the calendar.');
      setEditing(null);
    } catch (saveError) {
      setError(saveError.message || 'Unable to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (kind, item) => {
    const label = kind === 'announcements' ? 'announcement' : 'event';
    if (!window.confirm(`Delete the ${label} "${item.title}"? Employees will no longer see it. This cannot be undone.`)) return;
    try {
      if (kind === 'announcements') await onDeleteAnnouncement(item.id);
      else await onDeleteEvent(item.id);
      onToast?.(`The ${label} was deleted.`);
      if (editing?.id === item.id) setEditing(null);
    } catch (deleteError) {
      onToast?.(deleteError.message || `Unable to delete the ${label}.`);
    }
  };

  const renderForm = () => {
    const { kind, id, form } = editing;
    return (
      <form onSubmit={save} className="space-y-3 rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-black text-slate-900">
          {id ? 'Edit' : 'New'} {kind === 'announcements' ? 'announcement' : 'event'}
        </h3>
        <label className={labelClass}>Title
          <input name="title" value={form.title} onChange={updateField} required maxLength={200} className={inputClass} />
        </label>
        {kind === 'announcements' ? (
          <>
            <label className={labelClass}>Announcement text
              <textarea name="content" value={form.content} onChange={updateField} required maxLength={5000} rows={5} className={inputClass} />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className={labelClass}>Category
                <select name="category" value={form.category} onChange={updateField} className={inputClass}>
                  {ANNOUNCEMENT_CATEGORIES.map(category => <option key={category}>{category}</option>)}
                </select>
              </label>
              <label className={labelClass}>Reference no. (optional)
                <input name="referenceNo" value={form.referenceNo} onChange={updateField} maxLength={100} placeholder="e.g. MC-2026-015" className={inputClass} />
              </label>
              <label className={labelClass}>Date
                <input type="date" name="date" value={form.date} onChange={updateField} required className={inputClass} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <input type="checkbox" name="important" checked={form.important} onChange={updateField} />
              Mark as important (highlighted for employees)
            </label>
          </>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className={labelClass}>Date
                <input type="date" name="date" value={form.date} onChange={updateField} required className={inputClass} />
              </label>
              <label className={labelClass}>Time
                <input name="time" value={form.time} onChange={updateField} required maxLength={20} placeholder="09:00 AM" className={inputClass} />
              </label>
              <label className={labelClass}>Type
                <select name="type" value={form.type} onChange={updateField} className={inputClass}>
                  {EVENT_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
            </div>
            <label className={labelClass}>Location
              <input name="location" value={form.location} onChange={updateField} maxLength={200} className={inputClass} />
            </label>
            <label className={labelClass}>Description
              <textarea name="description" value={form.description} onChange={updateField} maxLength={2000} rows={3} className={inputClass} />
            </label>
          </>
        )}
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={saving} className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-black text-white disabled:opacity-50">
            {saving ? 'Saving...' : id ? 'Save changes' : kind === 'announcements' ? 'Publish announcement' : 'Add event'}
          </button>
          <button type="button" onClick={() => setEditing(null)} disabled={saving} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700">Cancel</button>
        </div>
      </form>
    );
  };

  const items = isAnnouncements ? sortedAnnouncements : sortedEvents;

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-900">Announcements &amp; Events</h2>
          <p className="text-sm text-slate-500">Publish announcements and schedule calendar events for employees.</p>
        </div>
        <button type="button" onClick={startCreate} className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2 text-xs font-black text-white">
          <Plus className="h-4 w-4" /> {isAnnouncements ? 'Create Announcement' : 'Add Event'}
        </button>
      </div>

      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-xs font-black">
        {[['announcements', Megaphone, `Announcements (${announcements.length})`], ['events', CalendarDays, `Events (${events.length})`]].map(([value, Icon, label]) => (
          <button key={value} type="button" onClick={() => { setTab(value); setEditing(null); }} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 ${tab === value ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {editing && editing.kind === tab && renderForm()}

      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {items.length === 0 && (
          <p className="p-6 text-center text-sm font-semibold text-slate-500">
            {isAnnouncements ? 'No announcements yet. Click Create Announcement to publish one.' : 'No events yet. Click Add Event to schedule one.'}
          </p>
        )}
        {items.map(item => (
          <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-3 last:border-0">
            <div className="min-w-0 flex-1">
              <p className="font-black text-slate-800">
                {item.title}
                {isAnnouncements && item.important && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase text-amber-800">Important</span>}
                {!isAnnouncements && item.date < today && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-500">Past</span>}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {isAnnouncements
                  ? [item.category, item.referenceNo, item.date, item.author && `by ${item.author}`].filter(Boolean).join(' • ')
                  : [item.date, item.time, EVENT_TYPES.find(type => type.value === item.type)?.label || item.type, item.location].filter(Boolean).join(' • ')}
              </p>
              {(item.content || item.description) && (
                <p className="mt-1 line-clamp-2 text-xs text-slate-600">{item.content || item.description}</p>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => startEdit(tab, item)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1 text-[10px] font-black text-slate-700">
                <Pencil className="h-3 w-3" /> Edit
              </button>
              <button type="button" onClick={() => remove(tab, item)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-[10px] font-black text-rose-700">
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
