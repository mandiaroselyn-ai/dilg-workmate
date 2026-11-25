import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, Printer, RotateCcw } from 'lucide-react';
import { getManilaDateString, getManilaMinutesOfDay } from '../../shared/localDate';
import bagongPilipinasLogo from '../assets/Bagong_Pilipinas-logo.png';
import dilgSeal from '../assets/dilg-seal.png';
import consolidatedTemplateUrl from '../assets/template/consolidated-attendance-template.xlsx?url';
import { consolidatedHtml, fillConsolidatedXlsx } from '../utils/consolidatedReportFiles';
import { downloadBytes } from '../utils/documentFiles';
import {
  ACCOUNT_STATUSES,
  REPORT_TYPES,
  buildReport,
  describeFilters,
  employeeKey,
  employeeLabel,
  reportCsv,
  reportHtml
} from '../utils/reports';
import { useProvincialDirector } from '../utils/useProvincialDirector';

// The screen shows this many rows; the downloaded and printed reports have them all.
const PREVIEW_ROWS = 100;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const fieldClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500';
const labelClass = 'block text-[10px] font-black uppercase tracking-wide text-slate-500';

// HR's two reports, previewed here. The attendance report is DILG Marinduque's monthly
// Consolidated Report of Attendance: downloaded as the office's own Excel template, or printed
// (or saved as PDF from the print dialog). The employee masterlist is as of today, exported as
// CSV or printed. Attendance covers the months loaded on this page.
export default function HRReportsView({ employees = [], attendanceHistory = [], requests = [], holidays = [], attendanceFrom = '', loadedAttendanceMonths = [], generatedBy = '' }) {
  const today = getManilaDateString();
  const emptyFilters = { employee: '', month: today.slice(0, 7), office: '', status: '' };
  const [type, setType] = useState('attendance');
  const [filters, setFilters] = useState(emptyFilters);
  // The number of vacant positions HR types, kept apart from the filters so typing it does not
  // make the report again.
  const [vacant, setVacant] = useState('');
  const [message, setMessage] = useState('');
  const isAttendance = type === 'attendance';
  // The Provincial Director who certifies the attendance report, from WorkMate's accounts.
  const director = useProvincialDirector(employees);

  const sortedEmployees = useMemo(
    () => [...employees].filter(employee => employeeKey(employee)).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [employees]
  );
  const offices = useMemo(
    () => [...new Set(employees.map(employee => employee.office).filter(Boolean))].sort(),
    [employees]
  );
  // An earlier month loaded on this page is counted from its first day; otherwise attendance
  // starts with the first loaded day.
  const monthLoaded = !attendanceFrom || filters.month >= attendanceFrom.slice(0, 7) || loadedAttendanceMonths.includes(filters.month);
  const from = loadedAttendanceMonths.includes(filters.month) ? '' : attendanceFrom;

  const report = useMemo(
    () => buildReport({ type, records: attendanceHistory, requests, employees, holidays, filters, from, today, minutes: getManilaMinutesOfDay() }),
    [type, attendanceHistory, requests, employees, holidays, filters, from, today]
  );
  const filtersText = describeFilters(filters, employees, isAttendance ? { period: report.monthLabel, status: false } : { period: `As of ${today}` });

  const change = field => event => setFilters(previous => ({ ...previous, [field]: event.target.value }));
  const chooseType = next => {
    setType(next);
    setFilters(previous => ({ ...previous, status: '' }));
    setMessage('');
  };

  const fileName = extension => (isAttendance
    ? `DILG-Consolidated-Report-of-Attendance-${report.month}.${extension}`
    : `DILG-${report.title.replace(/\s+/g, '-')}-${today}.${extension}`);

  const download = async (bytes, name, mimeType) => {
    await downloadBytes(bytes, name, mimeType);
    setMessage(`Downloaded ${name}.`);
  };

  const downloadExcel = async () => {
    try {
      let template;
      try {
        const response = await fetch(consolidatedTemplateUrl);
        if (!response.ok) throw new Error();
        template = new Uint8Array(await response.arrayBuffer());
      } catch {
        throw new Error('The report template could not be loaded. Check your internet connection and try again.');
      }
      await download(fillConsolidatedXlsx(template, report, { vacant, director }), fileName('xlsx'), XLSX_TYPE);
    } catch (downloadError) {
      setMessage(downloadError.message || 'Unable to download the report.');
    }
  };

  const exportCsv = async () => {
    try {
      await download(new TextEncoder().encode(reportCsv(report)), fileName('csv'), 'text/csv');
    } catch (exportError) {
      setMessage(exportError.message || 'Unable to export the report.');
    }
  };

  // Printed from a hidden frame on this page, so the print dialog opens over WorkMate and the page
  // works again as soon as the dialog closes. (Printed from a new tab, the page froze until that
  // tab's print dialog was closed, and the dialog could be out of sight in the other tab.)
  const printReport = () => {
    const html = isAttendance
      ? consolidatedHtml(report, { vacant, director, logos: [dilgSeal, bagongPilipinasLogo].map(src => new URL(src, window.location.href).href) })
      : reportHtml(report, {
        filtersText,
        generatedAt: new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }),
        generatedBy
      });
    document.querySelectorAll('iframe[data-report-print]').forEach(frame => frame.remove());
    const frame = document.createElement('iframe');
    frame.setAttribute('data-report-print', '');
    frame.setAttribute('aria-hidden', 'true');
    frame.title = report.title;
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    const view = frame.contentWindow;
    view.document.open();
    view.document.write(html);
    view.document.close();
    // Printed once its logos have loaded. "Save as PDF" in the print dialog makes a PDF.
    const images = [...view.document.images];
    Promise.all(images.map(image => (image.complete ? null : new Promise(resolve => { image.onload = resolve; image.onerror = resolve; }))))
      .then(() => {
        view.addEventListener('afterprint', () => window.setTimeout(() => frame.remove(), 0));
        view.focus();
        view.print();
      });
    setMessage('The print dialog opens on this page. Choose "Save as PDF" there for a PDF copy.');
  };

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-black text-slate-900">Generate a report</h3>
        <p className="mt-1 text-xs text-slate-500">
          {isAttendance
            ? 'Choose the month, check the preview, then download it as Excel in DILG\'s Consolidated Report of Attendance template, or print it.'
            : 'Choose the filters, check the preview, then export it as CSV (opens in Excel) or print it.'}
        </p>

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

        <div className={`mt-4 grid gap-3 sm:grid-cols-2 ${isAttendance ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
          <label className={labelClass}>Employee
            <select value={filters.employee} onChange={change('employee')} className={fieldClass}>
              <option value="">All employees</option>
              {sortedEmployees.map(employee => (
                <option key={employeeKey(employee)} value={employeeKey(employee)}>{employeeLabel(employee)}</option>
              ))}
            </select>
          </label>
          {isAttendance && (
            <label className={labelClass}>Month
              <input type="month" value={filters.month} max={today.slice(0, 7)} onChange={change('month')} className={fieldClass} />
            </label>
          )}
          <label className={labelClass}>Office / Department
            <select value={filters.office} onChange={change('office')} className={fieldClass}>
              <option value="">All offices</option>
              {offices.map(office => <option key={office}>{office}</option>)}
            </select>
          </label>
          {isAttendance ? (
            <label className={labelClass}>No. of vacant positions
              <input type="number" min="0" inputMode="numeric" value={vacant} onChange={event => setVacant(event.target.value)} placeholder="Leave blank to write it in" className={fieldClass} />
            </label>
          ) : (
            <label className={labelClass}>Status
              <select value={filters.status} onChange={change('status')} className={fieldClass}>
                <option value="">All statuses</option>
                {ACCOUNT_STATUSES.map(status => <option key={status}>{status}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isAttendance ? (
            <button type="button" onClick={downloadExcel} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700">
              <FileSpreadsheet className="h-4 w-4" /> Download Excel
            </button>
          ) : (
            <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700">
              <FileSpreadsheet className="h-4 w-4" /> Export CSV (Excel)
            </button>
          )}
          <button type="button" onClick={printReport} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-3 py-2 text-xs font-black text-white hover:bg-blue-800">
            <Printer className="h-4 w-4" /> Print / Save as PDF
          </button>
          <button type="button" onClick={() => { setFilters(emptyFilters); setVacant(''); setMessage(''); }} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
            <RotateCcw className="h-4 w-4" /> Reset filters
          </button>
        </div>
        {message && <p role="status" className="mt-2 rounded-lg bg-slate-50 p-2 text-xs font-semibold text-slate-700">{message}</p>}
        {isAttendance && !monthLoaded && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs font-semibold text-amber-800">
            The attendance of {report.monthLabel} is not loaded. Load that month above first for a complete report.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-black text-slate-900">{report.title}{isAttendance ? ` · ${report.monthLabel}` : ''}</h3>
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
                <tr key={`${row.employeeId}-${index}`} className="border-t border-slate-100">
                  {report.columns.map(column => <td key={column.key} className="whitespace-pre-line px-2 py-1.5 align-top text-slate-700">{row[column.key] === '' ? '—' : row[column.key]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {report.rows.length > PREVIEW_ROWS && (
          <p className="mt-2 text-[11px] font-semibold text-slate-500">
            Showing the first {PREVIEW_ROWS} of {report.rows.length} rows. The downloaded and printed reports include all of them.
          </p>
        )}
        {isAttendance && (
          <p className={`mt-2 text-[11px] font-semibold ${director ? 'text-slate-600' : 'text-amber-700'}`}>
            {director
              ? `Certified by ${director.toUpperCase()}, Provincial Director, from that WorkMate account. The PD signs it in WorkMate with the month's DTR report: it goes with the report HR sends in DTR Records.`
              : 'No active WorkMate account has the position title Provincial Director, so the name above "Provincial Director" is left blank. Set the PD\'s position title in Employee Directory > Supervisors & HR/Admin, or write the name on the report.'}
          </p>
        )}
        {report.note && <p className="mt-2 text-[11px] font-semibold text-slate-500">{report.note}</p>}
      </div>
    </section>
  );
}
