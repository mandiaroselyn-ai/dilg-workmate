import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, Printer, RotateCcw } from 'lucide-react';
import { getManilaDateString } from '../../shared/localDate';
import { downloadBytes } from '../utils/documentFiles';
import {
  ATTENDANCE_STATUSES,
  REPORT_TYPES,
  REQUEST_STATUSES,
  buildReport,
  describeFilters,
  employeeKey,
  reportCsv,
  reportHtml
} from '../utils/reports';

// The screen shows this many rows; the CSV and the printed report have them all.
const PREVIEW_ROWS = 100;

const fieldClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500';
const labelClass = 'block text-[10px] font-black uppercase tracking-wide text-slate-500';

// HR's reports on attendance, leave, and travel orders: filtered by employee, dates,
// office (department), and status, previewed here, and exported as CSV or printed (or saved
// as PDF from the print dialog). Attendance covers the months loaded on this page.
export default function HRReportsView({ employees = [], attendanceHistory = [], requests = [], attendanceFrom = '', generatedBy = '' }) {
  const today = getManilaDateString();
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  const emptyFilters = { employee: '', from: firstOfMonth, to: today, office: '', status: '' };
  const [type, setType] = useState('attendance');
  const [filters, setFilters] = useState(emptyFilters);
  const [message, setMessage] = useState('');

  const sortedEmployees = useMemo(
    () => [...employees].filter(employee => employeeKey(employee)).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [employees]
  );
  const offices = useMemo(
    () => [...new Set(employees.map(employee => employee.office).filter(Boolean))].sort(),
    [employees]
  );
  const statuses = type === 'attendance' ? ATTENDANCE_STATUSES : REQUEST_STATUSES;

  const report = useMemo(
    () => buildReport({ type, records: attendanceHistory, requests, employees, filters, today }),
    [type, attendanceHistory, requests, employees, filters, today]
  );
  const filtersText = describeFilters(filters, employees);

  const change = field => event => setFilters(previous => ({ ...previous, [field]: event.target.value }));
  const chooseType = next => {
    setType(next);
    // Statuses differ between attendance and requests.
    setFilters(previous => ({ ...previous, status: '' }));
    setMessage('');
  };

  const fileName = extension => `DILG-${report.title.replace(/\s+/g, '-')}-${filters.from || 'start'}-to-${filters.to || today}.${extension}`;

  const exportCsv = async () => {
    try {
      await downloadBytes(new TextEncoder().encode(reportCsv(report)), fileName('csv'), 'text/csv');
      setMessage(`Exported ${report.rows.length} row${report.rows.length === 1 ? '' : 's'} as ${fileName('csv')}.`);
    } catch (exportError) {
      setMessage(exportError.message || 'Unable to export the report.');
    }
  };

  const printReport = () => {
    const page = window.open('', '_blank');
    if (!page) {
      setMessage('The report could not open in a new tab. Allow pop-ups for this site, then try again.');
      return;
    }
    page.document.write(reportHtml(report, {
      filtersText,
      generatedAt: new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }),
      generatedBy
    }));
    page.document.close();
    page.focus();
    // Printed once the page has been laid out. "Save as PDF" in the print dialog makes a PDF.
    window.setTimeout(() => page.print(), 300);
    setMessage('The report opened in a new tab for printing. Choose "Save as PDF" in the print dialog for a PDF copy.');
  };

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-black text-slate-900">Generate a report</h3>
        <p className="mt-1 text-xs text-slate-500">Choose the report and filters, check the preview, then export it as CSV (opens in Excel) or print it.</p>

        <div className="mt-3 flex flex-wrap gap-2">
          {REPORT_TYPES.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => chooseType(option.id)}
              className={`rounded-xl border px-3 py-2 text-[11px] font-black transition ${
                type === option.id ? 'border-indigo-700 bg-indigo-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
              }`}
            >
              {option.label} Report
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className={labelClass}>Employee
            <select value={filters.employee} onChange={change('employee')} className={fieldClass}>
              <option value="">All employees</option>
              {sortedEmployees.map(employee => (
                <option key={employeeKey(employee)} value={employeeKey(employee)}>{employee.name || employeeKey(employee)}</option>
              ))}
            </select>
          </label>
          <label className={labelClass}>From
            <input type="date" value={filters.from} max={filters.to || undefined} onChange={change('from')} className={fieldClass} />
          </label>
          <label className={labelClass}>To
            <input type="date" value={filters.to} min={filters.from || undefined} onChange={change('to')} className={fieldClass} />
          </label>
          <label className={labelClass}>Office / Department
            <select value={filters.office} onChange={change('office')} className={fieldClass}>
              <option value="">All offices</option>
              {offices.map(office => <option key={office}>{office}</option>)}
            </select>
          </label>
          <label className={labelClass}>Status
            <select value={filters.status} onChange={change('status')} className={fieldClass}>
              <option value="">All statuses</option>
              {statuses.map(status => <option key={status}>{status}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700">
            <FileSpreadsheet className="h-4 w-4" /> Export CSV (Excel)
          </button>
          <button type="button" onClick={printReport} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-3 py-2 text-xs font-black text-white hover:bg-blue-800">
            <Printer className="h-4 w-4" /> Print / Save as PDF
          </button>
          <button type="button" onClick={() => { setFilters(emptyFilters); setMessage(''); }} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
            <RotateCcw className="h-4 w-4" /> Reset filters
          </button>
        </div>
        {message && <p role="status" className="mt-2 rounded-lg bg-slate-50 p-2 text-xs font-semibold text-slate-700">{message}</p>}
        {type === 'attendance' && attendanceFrom && filters.from && filters.from < attendanceFrom && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs font-semibold text-amber-800">
            Attendance before {attendanceFrom} is included only for the earlier months loaded above. Load those months first for a complete report.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-black text-slate-900">{report.title}</h3>
          <p className="text-[11px] font-semibold text-slate-500">{filtersText}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {report.summary.map(item => (
            <span key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              {item.label}: <b className="text-slate-900">{item.value}</b>
            </span>
          ))}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-[11px]">
            <thead className="bg-slate-100 text-slate-600">
              <tr>{report.columns.map(column => <th key={column.key} className="whitespace-nowrap px-2 py-2 font-black">{column.label}</th>)}</tr>
            </thead>
            <tbody>
              {report.rows.length === 0 ? (
                <tr><td colSpan={report.columns.length} className="px-2 py-6 text-center font-semibold text-slate-500">No records match these filters.</td></tr>
              ) : report.rows.slice(0, PREVIEW_ROWS).map((row, index) => (
                <tr key={`${row.id || row.date}-${row.employeeId}-${index}`} className="border-t border-slate-100">
                  {report.columns.map(column => <td key={column.key} className="px-2 py-1.5 align-top text-slate-700">{row[column.key] === '' ? '—' : row[column.key]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {report.rows.length > PREVIEW_ROWS && (
          <p className="mt-2 text-[11px] font-semibold text-slate-500">
            Showing the first {PREVIEW_ROWS} of {report.rows.length} rows. The CSV and the printed report include all of them.
          </p>
        )}
        {report.note && <p className="mt-2 text-[11px] font-semibold text-slate-500">{report.note}</p>}
      </div>
    </section>
  );
}
