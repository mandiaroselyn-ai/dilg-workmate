import React, { useEffect, useState } from 'react';
import { CalendarClock, ChevronDown } from 'lucide-react';
import { asOfLabel, needsStartingBalance, startMonthLabel } from '../../shared/leaveStart';
import { apiFetch } from '../utils/api';

const employeeId = employee => employee.employeeId || employee.email || '';
const sameEmployee = (a, b) => employeeId(a).toLowerCase() === employeeId(b).toLowerCase();
const inputClass = 'mt-1 w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-800';

// When WorkMate starts counting leave credits, and each active employee's balance from their
// leave card as of the day before (shared/leaveStart.js). Vacation and sick leave carry over from
// year to year (CSC MC No. 41, s. 1998), so an employee's earlier leave is not started over: HR 1
// sets the start month, copies each balance from the leave card, and WorkMate counts from the
// start month on. Only HR 1 sets them (`canChangeCredits`); other HR accounts see them.
// `start` and `asOf` come from the server; `onStartChange` gets a new { start, asOf }.
export default function HRLeaveCreditsStart({ employees = [], start = '', asOf = '', onStartChange, onEmployeesChange, canChangeCredits = true }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(start);
  // The start arrives from the server after the page opens.
  useEffect(() => setMonth(start), [start]);
  const [balances, setBalances] = useState({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState({ text: '', error: false });

  const waiting = start ? employees.filter(employee => needsStartingBalance(employee, start)) : [];
  const entered = start ? employees.filter(employee => employee.startingLeaveBalance?.start === start).length : 0;
  const filledIn = waiting.filter(employee => {
    const value = balances[employeeId(employee)];
    return value && (value.vacationLeaveCredits !== '' || value.sickLeaveCredits !== '');
  });

  const setBalance = (employee, field, value) => setBalances(previous => ({
    ...previous,
    [employeeId(employee)]: { vacationLeaveCredits: '', sickLeaveCredits: '', ...previous[employeeId(employee)], [field]: value }
  }));

  const send = async (path, init, onDone) => {
    setSaving(true);
    setResult({ text: '', error: false });
    try {
      const response = await apiFetch(path, { ...init, headers: { 'Content-Type': 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save.');
      onDone(data);
    } catch (saveError) {
      setResult({ text: saveError.message || 'Unable to save.', error: true });
    } finally {
      setSaving(false);
    }
  };

  const saveStart = event => {
    event.preventDefault();
    if (!month || saving) return;
    if (!window.confirm(`Start counting leave credits in WorkMate from ${startMonthLabel(month)}? You will enter each employee's balance on their leave card as of the day before. Once a balance is entered, the start month can no longer be changed.`)) return;
    send('/api/employees/leave-credits-start', { method: 'PUT', body: JSON.stringify({ month }) }, data => {
      onStartChange?.({ start: data.start, asOf: data.asOf });
      setResult({ text: `WorkMate counts leave credits from ${startMonthLabel(data.start)}. Enter each balance as of ${asOfLabel(data.asOf)}.`, error: false });
    });
  };

  const saveBalances = rows => {
    if (!rows.length || saving) return;
    const who = rows.length === 1 ? rows[0].name || 'this employee' : `${rows.length} employees`;
    if (!window.confirm(`Save the leave card balances of ${who} as of ${asOfLabel(asOf)}? Each replaces the employee's balance in WorkMate and is entered once; a correction afterwards is an adjustment with a reason.`)) return;
    send('/api/employees/starting-balances', {
      method: 'POST',
      body: JSON.stringify({
        balances: rows.map(employee => ({ identifier: employeeId(employee), ...balances[employeeId(employee)] }))
      })
    }, data => {
      const saved = data.results.filter(item => item.status === 'entered' && item.employee);
      onEmployeesChange?.(previous => previous.map(employee => {
        const match = saved.find(item => sameEmployee(item.employee, employee));
        return match ? { ...employee, ...match.employee } : employee;
      }));
      const skipped = data.results.length - saved.length;
      setResult({ text: `${saved.length} starting balance${saved.length === 1 ? '' : 's'} saved and the employee${saved.length === 1 ? '' : 's'} notified.${skipped ? ` ${skipped} skipped (already entered, no leave credits, or not found).` : ''}`, error: false });
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 shrink-0 text-blue-700" />
          <span>
            <span className="block text-sm font-black text-slate-900">Leave Credits Start</span>
            <span className="block text-xs text-slate-500">
              {!start ? 'Not set yet. Set the month WorkMate starts counting leave credits.'
                : waiting.length ? `From ${startMonthLabel(start)}. ${waiting.length} employee${waiting.length === 1 ? '' : 's'} still need a starting balance.`
                : `From ${startMonthLabel(start)}. Every active employee has a starting balance.`}
            </span>
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 p-4">
          <p className="text-xs text-slate-500">
            Vacation and sick leave carry over from year to year (CSC MC No. 41, s. 1998), so nobody's earlier leave is started over. Choose the month WorkMate starts counting, then copy each active employee's balance from their leave card as of the day before. From that month on, WorkMate credits 1.25 days a month and deducts approved leave and tardiness; the months before it stay on the leave card. Employees hired from the start month on begin with none.
          </p>
          {!canChangeCredits && <p className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">Only HR 1 (leave credits) sets the start and the starting balances. You can see them here.</p>}
          <form onSubmit={saveStart} className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] font-black text-slate-600">Start month
              <input type="month" value={month} onChange={event => setMonth(event.target.value)} disabled={!canChangeCredits} className="mt-1 block rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold text-slate-800 disabled:bg-slate-100" />
            </label>
            <button type="submit" disabled={!canChangeCredits || saving || !month || month === start} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
              {start ? 'Change start' : 'Set start'}
            </button>
            {start && <span className="text-xs font-semibold text-slate-500">Balances are as of {asOfLabel(asOf)}. {entered} entered.</span>}
          </form>
          {start && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black text-slate-700">Still need a starting balance ({waiting.length})</p>
                <button type="button" onClick={() => saveBalances(filledIn)} disabled={!canChangeCredits || saving || !filledIn.length} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                  Save all filled in ({filledIn.length})
                </button>
              </div>
              <div className="space-y-2">
                {waiting.map(employee => {
                  const value = balances[employeeId(employee)] || { vacationLeaveCredits: '', sickLeaveCredits: '' };
                  return (
                    <div key={employeeId(employee)} className="flex flex-wrap items-end justify-between gap-2 rounded-xl border border-slate-200 p-3 text-xs">
                      <p className="min-w-0 font-black text-slate-800">
                        {employee.name || 'Employee'}
                        <span className="block font-semibold text-slate-500">{[employee.role, employee.dateHired ? `hired ${employee.dateHired}` : 'no date hired'].filter(Boolean).join(' · ')}</span>
                      </p>
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="text-[11px] font-black text-slate-600">VL (days)
                          <input type="number" min="0" max="1000" step="0.001" value={value.vacationLeaveCredits} onChange={event => setBalance(employee, 'vacationLeaveCredits', event.target.value)} disabled={!canChangeCredits} placeholder="0" className={inputClass} />
                        </label>
                        <label className="text-[11px] font-black text-slate-600">SL (days)
                          <input type="number" min="0" max="1000" step="0.001" value={value.sickLeaveCredits} onChange={event => setBalance(employee, 'sickLeaveCredits', event.target.value)} disabled={!canChangeCredits} placeholder="0" className={inputClass} />
                        </label>
                        <button type="button" onClick={() => saveBalances([employee])} disabled={!canChangeCredits || saving} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-black text-emerald-700 disabled:opacity-50">Save</button>
                      </div>
                    </div>
                  );
                })}
                {!waiting.length && <p className="text-xs text-slate-500">Every active employee who earns leave credits has a starting balance.</p>}
              </div>
            </>
          )}
          {result.text && <p role={result.error ? 'alert' : 'status'} className={`text-xs font-bold ${result.error ? 'text-rose-700' : 'text-emerald-700'}`}>{result.text}</p>}
        </div>
      )}
    </section>
  );
}
