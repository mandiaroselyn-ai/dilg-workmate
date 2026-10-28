import React, { useState } from 'react';
import { ChevronDown, Scale } from 'lucide-react';
import { getManilaDateString } from '../../shared/localDate';
import { minutesToLeaveDays } from '../../shared/leaveConversion';
import { monthlyEarnedCredits, monthServiceDays, monthWithoutPayDays } from '../../shared/leaveCalc';
import { pesoText, withoutPayAmount } from '../../shared/salarySchedule';
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

// HR's monthly leave credits, as government offices keep them once a month's DTRs are verified,
// in two steps for each ended month and employee:
// 1. the month's tardiness and undertime (the DTR total) charged to vacation leave by the CSC
//    table (1 minute = 0.002 day, 1 hour = 0.125 day), and the rest without pay;
// 2. the month's earned leave credited: 1.25 days of vacation and of sick leave (1.25/30 for each
//    day of service in the month the employee was hired), less 1.25/30 for each day without pay
//    that month (unpaid leave and unpaid tardiness, so step 1 comes first).
// Each step is done once per month and employee, and the employee is notified.
export default function HRMonthlyLeaveCredits({ employees = [], attendanceHistory = [], requests = [], attendanceFrom = '', loadedMonths = [], onLoadMonth, onEmployeesChange }) {
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
    const charged = (employee.tardinessDeductions || []).find(item => item.month === month) || null;
    const credited = (employee.leaveEarnings || []).find(item => item.month === month) || null;
    // Days without pay this month, as the server reads them when it credits the month.
    const withoutPayDays = monthWithoutPayDays(month, {
      requests: requests.filter(request => matchesAttendanceEmployee(request, employee)),
      tardinessDeductions: employee.tardinessDeductions || []
    });
    // Days of service this month, from the date hired: fewer than 30 in the month hired.
    const serviceDays = monthServiceDays(month, employee.dateHired);
    return {
      employee,
      minutes,
      days: minutesToLeaveDays(minutes),
      charged,
      credited,
      withoutPayDays,
      // As credited (months credited before days of service were kept were full months).
      shownServiceDays: credited ? credited.serviceDays ?? 30 : serviceDays,
      earned: monthlyEarnedCredits(withoutPayDays, serviceDays),
      issues: records.filter(record => dtrIssue(record, today)).length
    };
  });
  const toCharge = rows.filter(row => !row.charged);
  const toCredit = rows.filter(row => row.charged && !row.credited);
  const issueCount = rows.reduce((total, row) => total + row.issues, 0);
  const issueWarning = issueCount ? `\n\n${issueCount} DTR record${issueCount === 1 ? '' : 's'} this month still need review in DTR Records; the charge uses the DTR as it is now.` : '';

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

  // Sends one step for some employees and merges the updated employees back.
  const post = async (path, body, doneStatus, doneText) => {
    setSaving(true);
    setResult({ text: '', error: false });
    try {
      const response = await apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save leave credits.');
      const saved = data.results.filter(item => item.status === doneStatus && item.employee);
      onEmployeesChange?.(previous => previous.map(employee => {
        const match = saved.find(item => sameEmployee(item.employee, employee));
        return match ? { ...employee, ...match.employee } : employee;
      }));
      const skipped = data.results.length - saved.length;
      setResult({ text: `${saved.length} employee${saved.length === 1 ? '' : 's'} ${doneText} and notified.${skipped ? ` ${skipped} skipped (already done or not found).` : ''}`, error: false });
    } catch (saveError) {
      setResult({ text: saveError.message || 'Unable to save leave credits.', error: true });
    } finally {
      setSaving(false);
    }
  };

  const charge = chargeRows => {
    if (!chargeRows.length || saving) return;
    const totalDays = Math.round(chargeRows.reduce((total, row) => total + row.days, 0) * 1000) / 1000;
    const who = chargeRows.length === 1 ? chargeRows[0].employee.name || 'this employee' : `${chargeRows.length} employees`;
    if (!window.confirm(`Charge ${monthLabel(month)} tardiness and undertime of ${who} to vacation leave (${daysText(totalDays)} in all)? Each month is charged once and cannot be undone here.${issueWarning}`)) return;
    post('/api/employees/tardiness-deductions', {
      month,
      deductions: chargeRows.map(row => ({ identifier: employeeId(row.employee), minutes: row.minutes }))
    }, 'deducted', 'charged');
  };

  const credit = creditRows => {
    if (!creditRows.length || saving) return;
    const who = creditRows.length === 1 ? creditRows[0].employee.name || 'this employee' : `${creditRows.length} employees`;
    if (!window.confirm(`Credit the leave earned in ${monthLabel(month)} to ${who} (1.25 days of vacation and of sick leave each, less for days without pay, and for each day of service in the month an employee was hired)? Each month is credited once and cannot be undone here.`)) return;
    post('/api/employees/leave-earnings', { month, identifiers: creditRows.map(row => employeeId(row.employee)) }, 'credited', 'credited');
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="flex items-center gap-2">
          <Scale className="h-5 w-5 shrink-0 text-blue-700" />
          <span>
            <span className="block text-sm font-black text-slate-900">Monthly Leave Credits</span>
            <span className="block text-xs text-slate-500">1. Charge late &amp; undertime to vacation leave. 2. Credit the leave earned (1.25 VL and 1.25 SL a month).</span>
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
              <>
                <button type="button" onClick={() => charge(toCharge)} disabled={saving || !toCharge.length} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                  1. Charge all not yet charged ({toCharge.length})
                </button>
                <button type="button" onClick={() => credit(toCredit)} disabled={saving || !toCredit.length} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                  2. Credit all earned leave ({toCredit.length})
                </button>
              </>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Only a month that has ended can be done. Tardiness uses the CSC table (1 min = 0.002 day, 1 hour = 0.125 day); when vacation leave is not enough, the rest is without pay. Each month earns 1.25 days of vacation and of sick leave, less 1.25/30 for each day without pay that month, so charge step 1 first. In the month an employee was hired, they earn 1.25/30 for each day from their Date Hired (CSC Table II), so fill in each new employee's Date Hired first.
          </p>
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
                  <div key={employeeId(row.employee)} className="space-y-1.5 rounded-xl border border-slate-200 p-3 text-xs">
                    <p className="font-black text-slate-800">
                      {row.employee.name || 'Employee'}
                      <span className="font-semibold text-slate-500"> · VL {Number(row.employee.vacationLeaveCredits ?? 0).toFixed(3)} · SL {Number(row.employee.sickLeaveCredits ?? 0).toFixed(3)}</span>
                      {row.issues > 0 && <span className="font-bold text-amber-700"> · {row.issues} to review</span>}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-slate-600">1. Late &amp; undertime: {row.minutes ? `${durationText(row.minutes)} = ${daysText(row.days)}` : 'none'}</span>
                      {row.charged ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-black text-emerald-700">
                          Charged {daysText(row.charged.days)}{row.charged.withoutPayDays ? ` · ${daysText(row.charged.withoutPayDays)} without pay${withoutPayAmount(row.employee, row.charged.withoutPayDays) ? ` (${pesoText(withoutPayAmount(row.employee, row.charged.withoutPayDays))})` : ''}` : ''}
                        </span>
                      ) : (
                        <button type="button" onClick={() => charge([row])} disabled={saving} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 font-black text-blue-700 disabled:opacity-50">Charge</button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-slate-600">
                        2. Earned: +{daysText(row.credited ? row.credited.earned : row.earned)} VL and SL
                        {row.shownServiceDays < 30 ? ` (${row.shownServiceDays} of 30 days of service)` : ''}
                        {(row.credited ? row.credited.withoutPayDays : row.withoutPayDays) ? ` (${daysText(row.credited ? row.credited.withoutPayDays : row.withoutPayDays)} without pay that month)` : ''}
                      </span>
                      {row.credited ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-black text-emerald-700">Credited</span>
                      ) : row.charged ? (
                        <button type="button" onClick={() => credit([row])} disabled={saving} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-black text-emerald-700 disabled:opacity-50">Credit</button>
                      ) : (
                        <span className="text-[11px] font-semibold text-slate-400">Charge step 1 first</span>
                      )}
                    </div>
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
