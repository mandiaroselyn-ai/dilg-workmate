import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { canChangeLeaveCredits } from '../../shared/hrSteps';
import { earnsLeaveCredits } from '../../shared/profileFields';
import { needsStartingBalance } from '../../shared/leaveStart';
import { activeEmployees } from '../utils/hrAttendance';
import useLeaveCreditsStart from '../utils/useLeaveCreditsStart';
import HRLeaveCreditsCard, { employeeKey } from './HRLeaveCreditsCard';
import HRLeaveCreditsStart from './HRLeaveCreditsStart';
import HRMonthlyLeaveCredits from './HRMonthlyLeaveCredits';

const daysText = value => Number(value ?? 0).toFixed(3);

// HR 2's Leave Credits page (Sir Erick at DILG Marinduque, whose WorkMate is only the requests
// to pre-approve and the leave credits): every employee's vacation and sick leave balances, which
// he adjusts to match the leave card, the balances WorkMate starts from (Leave Credits Start),
// and each ended month's tardiness charge and earned leave. HR 1 does the same in Employee
// Management and DTR Records. Contract of service and job order workers earn no leave credits,
// so they are not listed.
export default function HRLeaveCreditsView({ user = {}, employees = [], attendanceHistory = [], attendanceFrom = '', loadedAttendanceMonths = [], onLoadAttendanceMonth, requests = [], onEmployeesChange }) {
  const canEdit = canChangeLeaveCredits(user);
  const [creditsStart, setCreditsStart] = useLeaveCreditsStart();
  const [search, setSearch] = useState('');
  const [openKey, setOpenKey] = useState('');
  const [toast, setToast] = useState({ text: '', error: false });

  const notify = (text, error = false) => {
    setToast({ text, error });
    window.setTimeout(() => setToast({ text: '', error: false }), 6000);
  };

  const earning = useMemo(() => activeEmployees(employees)
    .filter(employee => (!employee.accessLevel || employee.accessLevel === 'employee') && earnsLeaveCredits(employee))
    .sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || '')), [employees]);
  const query = search.trim().toLowerCase();
  const visible = earning.filter(employee => `${employee.name || ''} ${employee.employeeId || ''} ${employee.email || ''} ${employee.office || ''}`.toLowerCase().includes(query));

  return (
    <div className="w-full min-w-0 space-y-4 pb-24 sm:pb-0">
      <header>
        <h2 className="text-xl font-black text-slate-900">Leave Credits</h2>
        <p className="mt-1 text-sm font-semibold text-slate-600">Enter and correct the employees' leave balances from their leave cards. Approved leave is deducted automatically, and the balances here are the ones you certify on a leave (7.A).</p>
      </header>

      <HRLeaveCreditsStart
        employees={employees}
        start={creditsStart.start}
        asOf={creditsStart.asOf}
        onStartChange={setCreditsStart}
        onEmployeesChange={onEmployeesChange}
        canChangeCredits={canEdit}
      />
      <HRMonthlyLeaveCredits
        creditsStart={creditsStart.start}
        employees={employees}
        attendanceHistory={attendanceHistory}
        requests={requests}
        attendanceFrom={attendanceFrom}
        loadedMonths={loadedAttendanceMonths}
        onLoadMonth={onLoadAttendanceMonth}
        onEmployeesChange={onEmployeesChange}
        canChangeCredits={canEdit}
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-900">Employee Balances</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">{earning.length} employee(s) earning leave credits. Open one to adjust their balance.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, ID, or office..." className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-xs font-semibold shadow-sm outline-none focus:border-blue-500" />
          </div>
        </div>
        {toast.text && <p className={`mt-3 rounded-xl p-3 text-center text-xs font-black ${toast.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{toast.text}</p>}
        <div className="mt-3 hidden grid-cols-[minmax(0,1fr)_7rem_7rem_1.5rem] gap-3 px-3 text-xs font-black uppercase tracking-wide text-slate-500 sm:grid">
          <span>Employee</span><span className="text-right">Vacation</span><span className="text-right">Sick</span><span />
        </div>
        <ul className="mt-2 divide-y divide-slate-100">
          {visible.map(employee => {
            const key = employeeKey(employee);
            const isOpen = openKey === key;
            const Chevron = isOpen ? ChevronDown : ChevronRight;
            return (
              <li key={key}>
                <button type="button" onClick={() => setOpenKey(isOpen ? '' : key)} aria-expanded={isOpen} className="grid w-full grid-cols-[minmax(0,1fr)_1.5rem] items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_1.5rem]">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-slate-900">{employee.name || employee.email}</span>
                    <span className="block truncate text-xs font-semibold text-slate-500">{employee.employeeId || 'No employee ID'} · {employee.office || 'Office not set'}</span>
                    <span className="mt-1 block text-xs font-bold text-slate-600 sm:hidden">VL {daysText(employee.vacationLeaveCredits)} · SL {daysText(employee.sickLeaveCredits)}</span>
                    {needsStartingBalance(employee, creditsStart.start) && <span className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-black text-amber-700">Starting balance not entered</span>}
                  </span>
                  <span className="hidden text-right text-sm font-black text-slate-800 sm:block">{daysText(employee.vacationLeaveCredits)}</span>
                  <span className="hidden text-right text-sm font-black text-slate-800 sm:block">{daysText(employee.sickLeaveCredits)}</span>
                  <Chevron className="h-4 w-4 text-slate-400" />
                </button>
                {isOpen && (
                  <div className="px-3 pb-3">
                    <HRLeaveCreditsCard key={key} employee={employee} canEdit={canEdit} onEmployeesChange={onEmployeesChange} onNotify={notify} className="" />
                  </div>
                )}
              </li>
            );
          })}
          {visible.length === 0 && <li className="py-8 text-center text-xs font-semibold text-slate-500">{earning.length ? 'No employee matches your search.' : 'No active employee earns leave credits yet.'}</li>}
        </ul>
      </section>
    </div>
  );
}
