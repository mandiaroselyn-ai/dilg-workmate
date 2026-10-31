import React, { useState } from 'react';
import { ChevronDown, ClipboardCheck, Trash2 } from 'lucide-react';
import { getManilaDateString } from '../../shared/localDate';
import { earnsLeaveCredits } from '../../shared/profileFields';
import { apiFetch } from '../utils/api';
import { activeEmployees } from '../utils/hrAttendance';

const identifierOf = employee => employee.employeeId || employee.email || '';
const dateText = date => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
// "17:30" as "5:30 PM".
const timeText = value => {
  const [hours, minutes] = value.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
};
const emptyForm = () => {
  const today = getManilaDateString();
  return { orderNumber: '', purpose: '', startDate: today, endDate: today, startTime: '17:00', endTime: '20:00', employeeIds: [] };
};

const fieldClass = 'mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold text-slate-800';

// HR's office orders for overtime: the Head of Office orders it for named employees, dates, and
// hours (CSC-DBM Joint Circular No. 2, s. 2004, Sec. 5.2; Joint CSC-DBM Circular No. 01-15,
// Sec. 13.2), and HR enters the order here. Work outside office hours, or on a rest day, counts
// as overtime in the DTR only within an order's hours. To change one, remove it and add it again.
// Contract of service and job order workers are not government employees, so they earn overtime
// only when their contract says so (COA-DBM Joint Circular No. 1, s. 2022, item 6.6): they are
// listed, but All employees leaves them out.
export default function HROvertimeOrders({ employees = [], orders = [], onOrdersChange }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState({ text: '', error: false });
  const staff = activeEmployees(employees).filter(identifierOf);
  const nameOf = id => employees.find(employee => identifierOf(employee) === id)?.name || id;

  const change = event => setForm(previous => ({ ...previous, [event.target.name]: event.target.value }));
  const toggle = id => setForm(previous => ({
    ...previous,
    employeeIds: previous.employeeIds.includes(id) ? previous.employeeIds.filter(item => item !== id) : [...previous.employeeIds, id]
  }));
  const governmentEmployees = staff.filter(earnsLeaveCredits).map(identifierOf);
  const allChosen = governmentEmployees.length > 0 && governmentEmployees.every(id => form.employeeIds.includes(id));
  const toggleAll = () => setForm(previous => ({ ...previous, employeeIds: allChosen ? [] : governmentEmployees }));

  const send = async (path, options, doneText) => {
    setSaving(true);
    setResult({ text: '', error: false });
    try {
      const response = await apiFetch(path, options);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save the office order.');
      onOrdersChange?.(data.overtimeOrders || []);
      setResult({ text: doneText, error: false });
      return true;
    } catch (saveError) {
      setResult({ text: saveError.message || 'Unable to save the office order.', error: true });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const add = async event => {
    event.preventDefault();
    if (!form.employeeIds.length) {
      setResult({ text: 'Choose at least one employee.', error: true });
      return;
    }
    const saved = await send('/api/overtime-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    }, `${form.orderNumber.trim()} saved. It now counts in the DTR.`);
    if (saved) setForm(emptyForm());
  };
  const remove = order => {
    if (window.confirm(`Remove ${order.orderNumber}? Its overtime will no longer count in the DTR.`)) {
      send(`/api/overtime-orders?id=${encodeURIComponent(order.id)}`, { method: 'DELETE' }, `${order.orderNumber} removed.`);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 shrink-0 text-blue-700" />
          <span>
            <span className="block text-sm font-black text-slate-900">Overtime Office Orders</span>
            <span className="block text-xs text-slate-500">Overtime counts in the DTR only for the employees, dates, and hours of an office order.</span>
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 p-4">
          <form onSubmit={add} className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-[11px] font-black text-slate-600">Office Order No.
                <input name="orderNumber" required maxLength={60} value={form.orderNumber} onChange={change} placeholder="For example: OO No. 2026-014" className={fieldClass} />
              </label>
              <label className="text-[11px] font-black text-slate-600">Purpose
                <input name="purpose" required maxLength={300} value={form.purpose} onChange={change} placeholder="For example: Year-end reports" className={fieldClass} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="text-[11px] font-black text-slate-600">From date
                <input type="date" name="startDate" required value={form.startDate} max={form.endDate || undefined} onChange={change} className={fieldClass} />
              </label>
              <label className="text-[11px] font-black text-slate-600">To date
                <input type="date" name="endDate" required value={form.endDate} min={form.startDate || undefined} onChange={change} className={fieldClass} />
              </label>
              <label className="text-[11px] font-black text-slate-600">From time
                <input type="time" name="startTime" required value={form.startTime} onChange={change} className={fieldClass} />
              </label>
              <label className="text-[11px] font-black text-slate-600">To time
                <input type="time" name="endTime" required value={form.endTime} onChange={change} className={fieldClass} />
              </label>
            </div>
            <fieldset className="rounded-lg border border-slate-200 p-2">
              <legend className="px-1 text-[11px] font-black text-slate-600">Employees ({form.employeeIds.length})</legend>
              {staff.length ? (
                <>
                  <label className="flex items-center gap-2 border-b border-slate-100 pb-1.5 text-xs font-black text-slate-700">
                    <input type="checkbox" checked={allChosen} onChange={toggleAll} /> All employees
                  </label>
                  <div className="mt-1.5 grid max-h-40 gap-1 overflow-y-auto sm:grid-cols-2">
                    {staff.map(employee => (
                      <label key={identifierOf(employee)} className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <input type="checkbox" checked={form.employeeIds.includes(identifierOf(employee))} onChange={() => toggle(identifierOf(employee))} />
                        {employee.name || identifierOf(employee)}
                        {!earnsLeaveCredits(employee) && <span className="font-bold text-amber-700">{employee.appointmentStatus}</span>}
                      </label>
                    ))}
                  </div>
                </>
              ) : <p className="text-xs text-slate-500">No active employees.</p>}
              <p className="mt-1.5 text-[11px] font-semibold text-slate-500">Work from home and days on a Travel Order earn no overtime. Choose Contract of Service and Job Order workers only when their contract provides for overtime.</p>
            </fieldset>
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Add office order</button>
          </form>
          {orders.length ? (
            <div className="space-y-1.5">
              {orders.map(order => (
                <div key={order.id} className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs">
                  <span className="min-w-0 text-slate-600">
                    <b className="text-slate-800">{order.orderNumber}</b> · {dateText(order.startDate)}{order.endDate !== order.startDate ? ` to ${dateText(order.endDate)}` : ''} · {timeText(order.startTime)} to {timeText(order.endTime)}
                    <span className="block">{order.purpose}</span>
                    <span className="block text-slate-500">{order.employeeIds.map(nameOf).join(', ')}</span>
                  </span>
                  <button type="button" onClick={() => remove(order)} disabled={saving} aria-label={`Remove ${order.orderNumber}`} className="rounded-md p-1 text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No office orders yet.</p>
          )}
          {result.text && <p role={result.error ? 'alert' : 'status'} className={`text-xs font-bold ${result.error ? 'text-rose-700' : 'text-emerald-700'}`}>{result.text}</p>}
        </div>
      )}
    </section>
  );
}
