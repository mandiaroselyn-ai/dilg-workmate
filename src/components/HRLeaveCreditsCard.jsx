import React, { useState } from 'react';
import { apiFetch } from '../utils/api';

export const employeeKey = (employee = {}) =>
  String(employee._id || employee.employeeId || employee.email || employee.id || '').trim().toLowerCase();

const creditsOf = employee => ({
  vacationLeaveCredits: Number(employee?.vacationLeaveCredits ?? 0),
  sickLeaveCredits: Number(employee?.sickLeaveCredits ?? 0)
});

// One employee's vacation and sick leave balances, which HR adjusts to match the official leave
// card. Approved leave is deducted by the system. `canEdit`: only HR 1 and HR 2 adjust them
// (shared/hrSteps.js); other HR accounts only see them. `onNotify(message, isError)` shows the
// result. Give each employee their own key, so a half-filled adjustment does not carry over.
export default function HRLeaveCreditsCard({ employee, canEdit = false, onEmployeesChange, onNotify, className = 'mt-5' }) {
  const [creditForm, setCreditForm] = useState(null); // { vacationLeaveCredits, sickLeaveCredits, reason } while editing
  const [creditSaving, setCreditSaving] = useState(false);
  const credits = creditsOf(employee);

  const startCreditAdjustment = () => {
    setCreditForm({ vacationLeaveCredits: String(credits.vacationLeaveCredits), sickLeaveCredits: String(credits.sickLeaveCredits), reason: '' });
  };

  // Saves HR's adjustment of the employee's leave balances.
  const saveLeaveCredits = async event => {
    event.preventDefault();
    if (!employee || !creditForm) return;
    const key = employeeKey(employee);
    setCreditSaving(true);
    try {
      const identifier = employee.employeeId || employee.email;
      const response = await apiFetch(`/api/employees/${encodeURIComponent(identifier)}/leave-credits`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creditForm)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.employee) throw new Error(data.error || 'Unable to update leave credits.');
      onEmployeesChange?.(previous => previous.map(item => employeeKey(item) === key ? { ...item, ...data.employee } : item));
      setCreditForm(null);
      onNotify?.('Leave credits updated. The employee was notified.');
    } catch (error) {
      onNotify?.(error.message || 'Unable to update leave credits.', true);
    } finally {
      setCreditSaving(false);
    }
  };

  const last = (employee?.leaveCreditHistory || []).at(-1);

  return (
    <section className={`${className} rounded-2xl border border-slate-200 bg-white p-4 shadow-sm`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-black uppercase tracking-wide text-slate-700">Leave Credits</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">Approved vacation, forced, and sick leave is deducted automatically. Adjust here to match the official leave card.</p>
        </div>
        {!creditForm && canEdit && (
          <button type="button" onClick={startCreditAdjustment} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700">Adjust</button>
        )}
        {!canEdit && <p className="max-w-[160px] text-right text-[11px] font-semibold text-slate-500">Only HR 1 and HR 2 adjust leave credits.</p>}
      </div>
      {creditForm ? (
        <form onSubmit={saveLeaveCredits} className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-black uppercase text-slate-500">Vacation leave (days)
              <input type="number" min="0" max="1000" step="0.001" required value={creditForm.vacationLeaveCredits} onChange={event => setCreditForm(form => ({ ...form, vacationLeaveCredits: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800" />
            </label>
            <label className="text-xs font-black uppercase text-slate-500">Sick leave (days)
              <input type="number" min="0" max="1000" step="0.001" required value={creditForm.sickLeaveCredits} onChange={event => setCreditForm(form => ({ ...form, sickLeaveCredits: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800" />
            </label>
          </div>
          <label className="block text-xs font-black uppercase text-slate-500">Reason (recorded and sent to the employee)
            <input required maxLength={300} value={creditForm.reason} onChange={event => setCreditForm(form => ({ ...form, reason: event.target.value }))} placeholder="e.g. Balance from the leave card as of September 2026" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold normal-case text-slate-800" />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={creditSaving} className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{creditSaving ? 'Saving...' : 'Save credits'}</button>
            <button type="button" onClick={() => setCreditForm(null)} disabled={creditSaving} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700">Cancel</button>
          </div>
        </form>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3">
          {[['Vacation leave', credits.vacationLeaveCredits], ['Sick leave', credits.sickLeaveCredits]].map(([label, days]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-black uppercase text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-black text-slate-900">{days} <span className="text-xs font-bold text-slate-500">days</span></p>
            </div>
          ))}
        </div>
      )}
      {last && (
        <p className="mt-2 text-xs font-semibold text-slate-500">
          Last adjusted {new Date(last.changedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} by {last.changedBy}: {last.reason}
        </p>
      )}
    </section>
  );
}
