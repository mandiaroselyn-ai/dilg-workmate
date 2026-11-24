import React, { useState } from 'react';
import { apiFetch } from '../utils/api';
import { MAX_SERVICE_RECORD_LINES, SERVICE_RECORD_FIELDS, normalizeServiceRecord, serviceRecordHtml, serviceRecordRow } from '../../shared/serviceRecord';
import { getManilaDateString } from '../../shared/localDate';
import { employeeKey } from './HRLeaveCreditsCard';

const blankLine = () => Object.fromEntries(SERVICE_RECORD_FIELDS.map(field => [field.key, '']));
const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold normal-case text-slate-800 outline-none focus:border-blue-500';

// The employee's present appointment from their profile, as a first line: the date hired, the
// position, the status of appointment, the annual salary (12 times the monthly salary from the
// salary grade and step), the office and division, and the station. DILG is a national agency.
const currentAppointment = employee => {
  const monthly = Number(String(employee?.salary || '').replace(/[^\d.]/g, ''));
  return {
    ...blankLine(),
    from: employee?.dateHired || '',
    designation: employee?.role || '',
    status: employee?.appointmentStatus || '',
    salary: monthly > 0 ? String(Math.round(monthly * 12 * 100) / 100) : '',
    office: [employee?.office, employee?.division].filter(Boolean).join(' / '),
    station: employee?.assignedStation || employee?.assignedLGU || '',
    branch: 'National'
  };
};

const ROW_KEYS = ['from', 'to', 'designation', 'status', 'salary', 'office', 'station', 'branch', 'leaveWithoutPay', 'separation'];
const ROW_LABELS = { from: 'From', to: 'To', designation: 'Designation', status: 'Status', salary: 'Salary (Annual)', office: 'Office / Division', station: 'Station', branch: 'Branch', leaveWithoutPay: 'Leave w/o Pay', separation: 'Separation' };

// The employee's Service Record: one line for each appointment or change (promotion,
// reappointment, salary adjustment, transfer, separation), which HR enters from the appointments
// and other papers on file (shared/serviceRecord.js), and prints for HR to sign. `currentUser`
// is the HR officer who certifies the printout.
export default function HRServiceRecordCard({ employee, currentUser = {}, onEmployeesChange, onNotify, className = 'mt-5' }) {
  const [draft, setDraft] = useState(null); // the lines while HR edits them
  const [saving, setSaving] = useState(false);
  const lines = Array.isArray(employee?.serviceRecord) ? employee.serviceRecord : [];

  const changeLine = (index, key, value) => setDraft(previous => previous.map((line, at) => (at === index ? { ...line, [key]: value } : line)));
  const addLine = line => setDraft(previous => [...previous, line]);
  const removeLine = index => setDraft(previous => previous.filter((_, at) => at !== index));

  const save = async event => {
    event.preventDefault();
    const checked = normalizeServiceRecord(draft);
    if (checked.error) {
      onNotify?.(checked.error, true);
      return;
    }
    setSaving(true);
    try {
      // The email is the account's own; an Employee ID can be shared by old accounts.
      const identifier = employee.email || employee.employeeId;
      const response = await apiFetch(`/api/employees/${encodeURIComponent(identifier)}/service-record`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: checked.value })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.employee) throw new Error(data.error || 'Unable to save the Service Record.');
      const key = employeeKey(employee);
      onEmployeesChange?.(previous => previous.map(item => (
        employeeKey(item) === key ? { ...item, serviceRecord: data.employee.serviceRecord || checked.value } : item
      )));
      setDraft(null);
      onNotify?.('Service Record saved.');
    } catch (error) {
      onNotify?.(error.message || 'Unable to save the Service Record.', true);
    } finally {
      setSaving(false);
    }
  };

  const print = () => {
    const page = window.open('', '_blank');
    if (!page) {
      onNotify?.('Allow pop-ups for this site to print the Service Record.', true);
      return;
    }
    const printedAt = new Date(`${getManilaDateString()}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    page.document.write(serviceRecordHtml(employee, lines, {
      certifiedBy: { name: currentUser?.name || '', position: currentUser?.role || '' },
      printedAt
    }));
    page.document.close();
    page.focus();
    page.print();
  };

  return (
    <section className={`${className} rounded-2xl border border-slate-200 bg-white p-4 shadow-sm`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xs font-black uppercase tracking-wide text-slate-700">Service Record</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">One line for each appointment, promotion, salary adjustment, transfer, or separation, from the papers on file.</p>
        </div>
        {!draft && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setDraft(lines.length ? lines.map(line => ({ ...blankLine(), ...line })) : [currentAppointment(employee)])} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700">
              {lines.length ? 'Edit' : 'Add lines'}
            </button>
            <button type="button" onClick={print} disabled={!lines.length} className="rounded-xl bg-blue-700 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">Print</button>
          </div>
        )}
      </div>

      {draft ? (
        <form onSubmit={save} className="mt-3 space-y-3">
          {draft.length === 0 && <p className="text-xs font-semibold text-slate-500">No lines. Saving clears the Service Record.</p>}
          {draft.map((line, index) => (
            <div key={index} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black text-slate-800">Line {index + 1}</p>
                <button type="button" onClick={() => removeLine(index)} className="rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-black text-rose-700">Remove</button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {SERVICE_RECORD_FIELDS.map(field => (
                  <label key={field.key} className="text-[11px] font-black uppercase text-slate-500">
                    {field.label}{field.required && <span className="text-rose-600"> *</span>}
                    {field.options ? (
                      <select value={line[field.key] || ''} onChange={event => changeLine(index, field.key, event.target.value)} className={inputClass}>
                        <option value="">-</option>
                        {field.options.map(option => <option key={option} value={option}>{option}</option>)}
                      </select>
                    ) : (
                      <input
                        type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                        min={field.type === 'number' ? '0' : field.key === 'to' ? line.from || undefined : undefined}
                        step={field.type === 'number' ? '0.01' : undefined}
                        maxLength={field.max}
                        required={field.required}
                        value={line[field.key] || ''}
                        onChange={event => changeLine(index, field.key, event.target.value)}
                        className={inputClass}
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => addLine(blankLine())} disabled={draft.length >= MAX_SERVICE_RECORD_LINES} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50">Add line</button>
            <button type="button" onClick={() => addLine(currentAppointment(employee))} disabled={draft.length >= MAX_SERVICE_RECORD_LINES} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50">Add current appointment</button>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save Service Record'}</button>
            <button type="button" onClick={() => setDraft(null)} disabled={saving} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700">Cancel</button>
          </div>
        </form>
      ) : lines.length === 0 ? (
        <p className="mt-3 text-xs font-semibold text-slate-500">No Service Record lines yet.</p>
      ) : (
        <>
          {/* Phone: one card per line. */}
          <ol className="mt-3 space-y-2 sm:hidden">
            {lines.map(serviceRecordRow).map((row, index) => (
              <li key={index} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-700">
                <p className="font-black text-slate-900">{row.designation}</p>
                <p className="mt-0.5 font-semibold">{row.from} – {row.to}{row.status ? ` · ${row.status}` : ''}</p>
                {row.salary && <p className="mt-0.5">PHP {row.salary} a year</p>}
                {(row.office || row.station) && <p className="mt-0.5">{[row.office, row.station].filter(Boolean).join(' · ')}</p>}
                {row.leaveWithoutPay && <p className="mt-0.5">Leave without pay: {row.leaveWithoutPay}</p>}
                {row.separation && <p className="mt-0.5 font-semibold text-rose-700">Separated {row.separation}</p>}
              </li>
            ))}
          </ol>
          {/* Wider screens: the table as printed. */}
          <div className="mt-3 hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[720px] border-collapse text-left text-[11px]">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  {ROW_KEYS.map(key => <th key={key} className="border border-slate-100 px-2 py-1.5 font-black uppercase">{ROW_LABELS[key]}</th>)}
                </tr>
              </thead>
              <tbody>
                {lines.map(serviceRecordRow).map((row, index) => (
                  <tr key={index} className="text-slate-700">
                    {ROW_KEYS.map(key => <td key={key} className="border border-slate-100 px-2 py-1.5 font-semibold">{row[key]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
