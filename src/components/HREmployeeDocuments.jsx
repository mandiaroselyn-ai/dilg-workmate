import React, { useMemo, useState } from 'react';
import { CalendarDays, Download, Eye, FileText, Plane } from 'lucide-react';
import { getManilaDateString } from '../../shared/localDate';
import dtrTemplate from '../assets/template/dtr-template.pdf';
import { dtrFilename, fillDTR } from '../utils/dtrForm';
import { downloadBytes } from '../utils/documentFiles';
import { recordsForEmployees } from '../utils/hrAttendance';
import { travelDurationLabel } from '../utils/travelDuration';
import AttachmentList from './AttachmentList';
import CSCForm6Preview from './CSCForm6Preview';
import DocumentViewer from './DocumentViewer';
import TravelOrderPreview from './TravelOrderPreview';

// A draft the employee has not submitted, or one they discarded, is not on record.
const UNSUBMITTED = ['Draft', 'Cancelled'];

const statusTone = status => ({
  Approved: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-rose-100 text-rose-700',
  Returned: 'bg-orange-100 text-orange-700',
  Withdrawn: 'bg-slate-100 text-slate-600'
}[status] || 'bg-amber-100 text-amber-700');

const buttonClass = 'inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-700 hover:border-blue-300 disabled:opacity-50';

// One employee's documents for HR, in one place: their DTR for any month (CSC Form 48),
// their leave applications (CSC Form 6), their travel orders, and the files attached to
// them, each viewed or downloaded here.
export default function HREmployeeDocuments({ employee, requests = [], attendanceHistory = [], attendanceFrom = '', loadedAttendanceMonths = [], onLoadAttendanceMonth }) {
  const [month, setMonth] = useState(() => getManilaDateString().slice(0, 7));
  const [viewer, setViewer] = useState(null); // { key, title, load }
  const [form, setForm] = useState(null); // a leave or travel request
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ownRequests = useMemo(
    () => recordsForEmployees(requests, [employee])
      .filter(request => !UNSUBMITTED.includes(request.status))
      .sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || ''))),
    [requests, employee]
  );
  const leaves = ownRequests.filter(request => request.type === 'Leave Request');
  const travels = ownRequests.filter(request => request.type === 'Travel Order');
  const ownAttendance = useMemo(() => recordsForEmployees(attendanceHistory, [employee]), [attendanceHistory, employee]);

  // HR's attendance holds the months from `attendanceFrom` on, plus those HR loaded.
  const monthLoaded = !attendanceFrom || month >= attendanceFrom.slice(0, 7) || loadedAttendanceMonths.includes(month);
  const daysRecorded = new Set(ownAttendance.filter(record => String(record.date || '').startsWith(month)).map(record => record.date)).size;

  const makeDtr = async () => {
    const [year, monthNumber] = month.split('-').map(Number);
    const response = await fetch(dtrTemplate);
    const bytes = await fillDTR(await response.arrayBuffer(), employee, year, monthNumber, ownAttendance);
    return { fileName: dtrFilename(employee?.name, year, monthNumber), fileType: 'application/pdf', bytes };
  };
  const viewDtr = () => setViewer({ key: Date.now(), title: `DTR · ${employee?.name || 'Employee'} · ${month}`, load: makeDtr });
  const downloadDtr = async () => {
    setBusy(true);
    setError('');
    try {
      const file = await makeDtr();
      downloadBytes(file.bytes, file.fileName, file.fileType);
    } catch (errorValue) {
      setError(errorValue.message || 'Unable to prepare the DTR. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const RequestRow = ({ request, icon: Icon, title, meta, formLabel }) => (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-black text-slate-800"><Icon className="h-3.5 w-3.5 shrink-0 text-blue-700" />{title}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{meta}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${statusTone(request.status)}`}>{request.status}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setForm(request)} className={buttonClass}><Eye className="h-3.5 w-3.5" />{formLabel}</button>
        <AttachmentList
          attachments={request.attachments}
          className="flex flex-wrap gap-2"
          itemClassName="max-w-full rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-bold text-blue-700"
        />
      </div>
    </li>
  );

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-black text-slate-900">Employee Documents</h3>
      <p className="mt-0.5 text-xs text-slate-500">This employee's DTR, leave applications, travel orders, and attached files.</p>

      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
        <p className="flex items-center gap-1.5 text-xs font-black text-slate-800"><CalendarDays className="h-3.5 w-3.5 text-blue-700" />Daily Time Record (CSC Form 48)</p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">Month
            <input type="month" value={month} max={getManilaDateString().slice(0, 7)} onChange={event => setMonth(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700" />
          </label>
          <button type="button" onClick={viewDtr} disabled={!month || !monthLoaded} className={buttonClass}><Eye className="h-3.5 w-3.5" />View</button>
          <button type="button" onClick={downloadDtr} disabled={!month || !monthLoaded || busy} className={buttonClass}><Download className="h-3.5 w-3.5" />{busy ? 'Preparing...' : 'Download'}</button>
        </div>
        {monthLoaded ? (
          <p className="mt-1.5 text-[11px] font-semibold text-slate-500">{daysRecorded} day{daysRecorded === 1 ? '' : 's'} with attendance in this month.</p>
        ) : (
          <p className="mt-1.5 text-[11px] font-semibold text-amber-800">
            This month's attendance is not loaded yet.{' '}
            {onLoadAttendanceMonth && <button type="button" onClick={() => onLoadAttendanceMonth(month)} className="font-black text-blue-700 underline">Load {month}</button>}
          </p>
        )}
        {error && <p role="alert" className="mt-1.5 text-[11px] font-semibold text-rose-700">{error}</p>}
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Leave applications ({leaves.length})</p>
        {leaves.length ? (
          <ul className="mt-1.5 space-y-2">
            {leaves.map(request => (
              <RequestRow
                key={request.id}
                request={request}
                icon={FileText}
                title={`${request.leaveType || 'Leave application'} · ${request.id}`}
                meta={`${request.startDate} to ${request.endDate} · ${request.workingDays || 0} working day(s) · Filed ${request.submissionDate || '-'}`}
                formLabel="CSC Form 6"
              />
            ))}
          </ul>
        ) : <p className="mt-1 text-xs font-semibold text-slate-500">No leave applications.</p>}
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Travel orders ({travels.length})</p>
        {travels.length ? (
          <ul className="mt-1.5 space-y-2">
            {travels.map(request => (
              <RequestRow
                key={request.id}
                request={request}
                icon={Plane}
                title={`${request.travelActivity || 'Travel order'} · ${request.id}`}
                meta={[`${request.startDate} to ${request.endDate}`, travelDurationLabel(request), request.travelVenue, `Filed ${request.submissionDate || '-'}`].filter(Boolean).join(' · ')}
                formLabel="Travel Order"
              />
            ))}
          </ul>
        ) : <p className="mt-1 text-xs font-semibold text-slate-500">No travel orders.</p>}
      </div>

      {viewer && <DocumentViewer key={viewer.key} title={viewer.title} load={viewer.load} onClose={() => setViewer(null)} />}
      {form?.type === 'Leave Request' && <CSCForm6Preview request={form} user={employee} onClose={() => setForm(null)} />}
      {form?.type === 'Travel Order' && <TravelOrderPreview request={form} user={employee} onClose={() => setForm(null)} />}
    </section>
  );
}
