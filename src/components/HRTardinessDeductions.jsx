import React, { useState } from 'react';
import { ChevronDown, Scale } from 'lucide-react';
import { getManilaDateString } from '../../shared/localDate';
import { minutesToLeaveDays } from '../../shared/leaveConversion';
import { apiFetch } from '../utils/api';
import { matchesAttendanceEmployee } from '../utils/attendanceIdentity';
import { durationText } from '../utils/dtrDay';
import { monthUndertimeMinutes } from '../utils/dtrMonth';
import { activeEmployees, dtrIssue } from '../utils/hrAttendance';

const monthLabel = month => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const daysText = days => `${Number(days || 0).toFixed(3)} day`;
const employeeId = employee => employee.employeeId || employee.email || '';
const sameEmployee = (a, b) => employeeId(a).toLowerCase() === employeeId(b).toLowerCase();

// The month before this one, as YYYY-MM: the latest month that has ended.
const lastEndedMonth = () => {
  const [year, month] = getManilaDateString().split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

// HR charging a month's tardiness and undertime to vacation leave, as government offices do
// once the month's DTRs are verified: each employee's DTR total for an ended month, the days
// it converts to by the CSC table, and whether it was charged. Each month is charged once.
export default function HRTardinessDeductions({ employees = [], attendanceHistory = [], attendanceFrom = '', loadedMonths = [], onLoadMonth, onEmployeesChange }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(lastEndedMonth);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState({ text: '', error: false });
  const latestMonth = lastEndedMonth();
  const today = getManilaDateString();

  // HR holds the records from `attendanceFrom` on, and the earlier months it loaded.
  const monthLoaded = month >= (attendanceFrom || '').slice(0, 7) || loadedMonths.includes(month);
  const [year, monthNumber] = month.split('-').map(Number);
  const monthRecords = attendanceHistory.filter(record => (record.date || '').startsWith(month));
  const rows = activeEmployees(employees).map(employee => {
    const records = monthRecords.filter(record => matchesAttendanceEmployee(record, employee));
    const minutes = monthUndertimeMinutes(records, year, monthNumber);
    return {
      employee,
      minutes,
      days: minutesToLeaveDays(minutes),
      charged: (employee.tardinessDeductions || []).find(item => item.month === month) || null,
      issues: records.filter(record => dtrIssue(record, today)).length
    };
  });
  const toCharge = rows.filter(row => !row.charged);
  const issueCount = rows.reduce((total, row) => total + row.issues, 0);

  const loadMonth = async () => {
    setLoading(true);
    setResult({ text: '', error: false });
    try {
      await onLoadMonth?.(month);
    } catch (loadError) {
      setResult({ text: loadError.message || 'Unable to load that month.', error: true });
    } finally {
      setLoading(false);
    }
  };

  const charge = async chargeRows => {
    if (!chargeRows.length || saving) return;
    const totalDays = chargeRows.reduce((total, row) => total + row.days, 0);
    const who = chargeRows.length === 1 ? chargeRows[0].employee.name || 'this employee' : `${chargeRows.length} employees`;
    const warning = issueCount ? `\n\n${issueCount} DTR record${issueCount === 1 ? '' : 's'} this month still need review in DTR Records; the charge uses the DTR as it is now.` : '';
    if (!window.confirm(`Charge ${monthLabel(month)} tardiness and undertime of ${who} to vacation leave (${daysText(Math.round(totalDays * 1000) / 1000)} in all)? Each month is charged once and cannot be undone here.${warning}`)) return;
    setSaving(true);
    setResult({ text: '', error: false });
    try {
      const response = await apiFetch('/api/employees/tardiness-deductions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, deductions: chargeRows.map(row => ({ identifier: employeeId(row.employee), minutes: row.minutes })) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to charge leave credits.');
      const saved = data.results.filter(item => item.status === 'deducted' && item.employee);
      onEmployeesChange?.(previous => previous.map(employee => {
        const match = saved.find(item => sameEmployee(item.employee, employee));
        return match ? { ...employee, ...match.employee } : employee;
      }));
      const skipped = data.results.length - saved.length;
      setResult({ text: `${saved.length} employee${saved.length === 1 ? '' : 's'} charged and notified.${skipped ? ` ${skipped} skipped (already charged or not found).` : ''}`, error: false });
    } catch (chargeError) {
      setResult({ text: chargeError.message || 'Unable to charge leave credits.', error: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="flex items-center gap-2">
          <Scale className="h-5 w-5 shrink-0 text-blue-700" />
          <span>
            <span className="block text-sm font-black text-slate-900">Leave Credits: Tardiness &amp; Undertime</span>
            <span className="block text-xs text-slate-500">Charge a month's DTR totals to vacation leave (CSC table: 1 min = 0.002 day, 1 hour = 0.125 day).</span>
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 p-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] font-black text-slate-600">Month
              <input type="month" value={month} max={latestMonth} onChange={event => event.target.value && setMonth(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold text-slate-800" />
            </label>
            {monthLoaded && (
              <button type="button" onClick={() => charge(toCharge)} disabled={saving || !toCharge.length} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                {saving ? 'Charging…' : `Charge all not yet charged (${toCharge.length})`}
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500">Only a month that has ended can be charged. When vacation leave is not enough, it goes to 0 and the rest is recorded as without pay. Each employee is notified.</p>
          {!monthLoaded ? (
            <div className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">
              {monthLabel(month)} attendance is not loaded yet.{' '}
              <button type="button" onClick={loadMonth} disabled={loading || !onLoadMonth} className="font-black text-blue-700 underline disabled:opacity-50">{loading ? 'Loading…' : `Load ${monthLabel(month)}`}</button>
            </div>
          ) : (
            <>
              {issueCount > 0 && (
                <p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                  {issueCount} DTR record{issueCount === 1 ? '' : 's'} in {monthLabel(month)} still need review (missing logs or offline punches). Fix them in DTR Records first, since the charge uses each DTR as it is now.
                </p>
              )}
              <div className="space-y-2">
                {rows.map(row => (
                  <div key={employeeId(row.employee)} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-black text-slate-800">{row.employee.name || 'Employee'}</p>
                      <p className="text-slate-500">
                        {row.minutes ? `${durationText(row.minutes)} = ${daysText(row.days)}` : 'No tardiness or undertime'}
                        {' · '}VL {Number(row.employee.vacationLeaveCredits ?? 15).toFixed(3)}
                        {row.issues > 0 && <span className="font-bold text-amber-700"> · {row.issues} to review</span>}
                      </p>
                    </div>
                    {row.charged ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-black text-emerald-700">
                        Charged {daysText(row.charged.days)}{row.charged.withoutPayDays ? ` · ${daysText(row.charged.withoutPayDays)} without pay` : ''}
                      </span>
                    ) : (
                      <button type="button" onClick={() => charge([row])} disabled={saving} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 font-black text-blue-700 disabled:opacity-50">
                        Charge
                      </button>
                    )}
                  </div>
                ))}
                {!rows.length && <p className="text-xs text-slate-500">No active employees.</p>}
              </div>
            </>
          )}
          {result.text && <p role={result.error ? 'alert' : 'status'} className={`text-xs font-bold ${result.error ? 'text-rose-700' : 'text-emerald-700'}`}>{result.text}</p>}
        </div>
      )}
    </section>
  );
}
