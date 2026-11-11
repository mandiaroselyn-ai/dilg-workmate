import React, { useState } from 'react';
import { ChevronDown, PenLine } from 'lucide-react';
import { getManilaDateString } from '../../shared/localDate';
import { activeEmployees } from '../utils/hrAttendance';
import { dtrStatusText } from '../utils/dtrSubmission';

// The month before this one, as YYYY-MM: the latest DTR that can be submitted.
const lastEndedMonth = () => {
  const [year, month] = getManilaDateString().split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};
const monthText = month => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const tone = { Verified: 'bg-emerald-50 text-emerald-700', Submitted: 'bg-blue-50 text-blue-700', Returned: 'bg-orange-50 text-orange-700' };

// HR's view of a month's DTRs signed through WorkMate: who has signed and submitted theirs, who
// the Supervisor verified, and who has not submitted yet. The signed DTR itself is in each
// employee's documents (Employee Management).
export default function HRDtrSubmissions({ employees = [], submissions = [] }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(lastEndedMonth);
  const staff = activeEmployees(employees);
  const rows = staff.map(employee => ({
    employee,
    submission: submissions.find(item => item.month === month && item.employeeId === employee.employeeId) || null
  }));
  const count = status => rows.filter(row => (row.submission?.status || 'Not submitted') === status).length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="flex items-center gap-2">
          <PenLine className="h-5 w-5 shrink-0 text-blue-700" />
          <span>
            <span className="block text-sm font-black text-slate-900">Signed DTRs</span>
            <span className="block text-xs text-slate-500">{monthText(month)}: {count('Verified')} verified, {count('Submitted')} waiting for the Supervisor, {count('Returned')} returned, {count('Not submitted')} not submitted.</span>
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 p-4">
          <p className="text-xs text-slate-500">Each employee signs their DTR (CSC Form No. 48) for a month that has ended, and the Supervisor verifies it as the In-charge. Open an employee in Employee Management to view or download their signed DTR.</p>
          <label className="text-[11px] font-black text-slate-600">Month
            <input type="month" value={month} max={lastEndedMonth()} onChange={event => event.target.value && setMonth(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold text-slate-800" />
          </label>
          <ul className="space-y-1.5">
            {rows.map(({ employee, submission }) => (
              <li key={employee.employeeId || employee.email} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs">
                <span className="min-w-0">
                  <b className="text-slate-800">{employee.name || 'Employee'}</b>
                  {submission && <span className="block text-[11px] text-slate-500">{dtrStatusText(submission)}</span>}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${tone[submission?.status] || 'bg-slate-100 text-slate-500'}`}>{submission?.status || 'Not submitted'}</span>
              </li>
            ))}
            {!rows.length && <li className="text-xs text-slate-500">No active employees.</li>}
          </ul>
        </div>
      )}
    </section>
  );
}
