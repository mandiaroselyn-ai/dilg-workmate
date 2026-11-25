import React, { useState } from 'react';
import { ChevronDown, FilePlus2 } from 'lucide-react';
import { getManilaDateString } from '../../shared/localDate';

const inputClass = 'mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold text-slate-800';
const REASON_MAX = 300;

// "13:05" (a time input) as "01:05 PM", how times are saved; '' stays ''.
const clockText = value => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return '';
  const hour = Number(match[1]);
  return `${String(hour % 12 || 12).padStart(2, '0')}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
};

const emptyForm = { employee: '', date: '', dutyType: 'office', location: '', timeIn: '', lunchOut: '', lunchIn: '', timeOut: '', reason: '' };

// HR adds an attendance record for a day an employee worked but has none of: their phone died,
// WorkMate was down, or they forgot to time in (backend/src/utils/hrAddedRecord.js). As with a
// paper DTR, it needs a reason, such as the letter of explanation the Head approved, and the
// record says HR added it. A day that has a record is corrected in the list below instead.
// `employees` are the employee accounts; `onAdd(body)` saves it and resolves with the record.
export default function HRAddRecord({ employees = [], onAdd }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState({ text: '', error: false });
  const active = employees.filter(employee => (employee.accountStatus || 'Active') === 'Active')
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const change = event => {
    const { name, value } = event.target;
    setForm(previous => {
      const next = { ...previous, [name]: value };
      // Choosing the employee fills in their office as the place, which HR can change.
      if (name === 'employee' && !previous.location) {
        const employee = active.find(item => String(item._id || item.employeeId || item.email) === value);
        if (employee?.office) next.location = employee.office;
      }
      return next;
    });
  };

  const save = async event => {
    event.preventDefault();
    setSaving(true);
    setResult({ text: '', error: false });
    try {
      const employee = active.find(item => String(item._id || item.employeeId || item.email) === form.employee);
      await onAdd({
        employee: form.employee,
        date: form.date,
        dutyType: form.dutyType,
        location: form.location.trim(),
        timeIn: clockText(form.timeIn),
        lunchOut: clockText(form.lunchOut),
        lunchIn: clockText(form.lunchIn),
        timeOut: clockText(form.timeOut),
        reason: form.reason.trim()
      });
      setResult({ text: `Added ${employee?.name || 'the employee'}'s record on ${form.date}. They were told.`, error: false });
      setForm(emptyForm);
    } catch (saveError) {
      setResult({ text: saveError.message || 'Unable to add the record.', error: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="flex items-center gap-2">
          <FilePlus2 className="h-5 w-5 shrink-0 text-blue-700" />
          <span>
            <span className="block text-sm font-black text-slate-900">Add Record</span>
            <span className="block text-xs text-slate-500">For a day an employee worked but has no record: phone died, WorkMate was down, or they forgot to time in.</span>
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <form onSubmit={save} className="space-y-3 border-t border-slate-100 p-4">
          <p className="text-xs text-slate-500">As with a paper DTR, a day without a log needs a reason, such as the letter of explanation the Head approved. The record shows "Added by HR" with who added it, when, and why, and the employee is told. A day that already has a record is corrected in the list below instead. A day of approved leave or Travel Order has no attendance.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-[11px] font-black text-slate-600 sm:col-span-2">Employee
              <select name="employee" required value={form.employee} onChange={change} className={inputClass}>
                <option value="">Choose an employee</option>
                {active.map(employee => {
                  const key = String(employee._id || employee.employeeId || employee.email);
                  return <option key={key} value={key}>{employee.name || employee.email}{employee.employeeId ? ` (${employee.employeeId})` : ''}</option>;
                })}
              </select>
            </label>
            <label className="text-[11px] font-black text-slate-600">Date
              <input type="date" name="date" required max={getManilaDateString()} value={form.date} onChange={change} className={inputClass} />
            </label>
            <label className="text-[11px] font-black text-slate-600">Worked at
              <select name="dutyType" value={form.dutyType} onChange={change} className={inputClass}>
                <option value="office">Office</option>
                <option value="field">Field</option>
                <option value="wfh">WFH</option>
              </select>
            </label>
            <label className="text-[11px] font-black text-slate-600 sm:col-span-2">Place
              <input name="location" required maxLength={200} value={form.location} onChange={change} placeholder="Such as their office, or the barangay of the field work" className={inputClass} />
            </label>
            <label className="text-[11px] font-black text-slate-600">Time In
              <input type="time" name="timeIn" required value={form.timeIn} onChange={change} className={inputClass} />
            </label>
            <label className="text-[11px] font-black text-slate-600">Lunch Out
              <input type="time" name="lunchOut" value={form.lunchOut} onChange={change} className={inputClass} />
            </label>
            <label className="text-[11px] font-black text-slate-600">Lunch In
              <input type="time" name="lunchIn" value={form.lunchIn} onChange={change} className={inputClass} />
            </label>
            <label className="text-[11px] font-black text-slate-600">Time Out
              <input type="time" name="timeOut" value={form.timeOut} onChange={change} className={inputClass} />
            </label>
            <label className="text-[11px] font-black text-slate-600 sm:col-span-3">Reason
              <textarea name="reason" required maxLength={REASON_MAX} rows={2} value={form.reason} onChange={change} placeholder="Such as: Phone battery died; letter of explanation approved by the PD on Nov. 26" className={inputClass} />
            </label>
          </div>
          <button type="submit" disabled={saving || !onAdd} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{saving ? 'Adding...' : 'Add Record'}</button>
          {result.text && <p className={`rounded-xl p-3 text-xs font-bold ${result.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{result.text}</p>}
        </form>
      )}
    </section>
  );
}
