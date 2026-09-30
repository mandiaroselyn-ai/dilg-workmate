import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronRight, FileCheck2, Search } from 'lucide-react';
import { getManilaDateString } from '../../shared/localDate';
import { matchesAttendanceEmployee } from '../utils/attendanceIdentity';
import { dtrIssue, dtrRecordStatus, hasSelfie, recordsForEmployees, totalHoursWorked } from '../utils/hrAttendance';
import { describeFingerprintCheck } from '../utils/fingerprintMessages';
import HRFaceComparison from './HRFaceComparison';
import OlderAttendanceLoader from './OlderAttendanceLoader';

// "08:05 AM" (how Time In and Time Out are saved) as "08:05" for a time input, and back.
const toInputTime = value => {
  const match = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(String(value || '').trim());
  if (!match) return '';
  const hour = (Number(match[1]) % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
};
const fromInputTime = value => {
  const [hours, minutes] = value.split(':').map(Number);
  return `${String(hours % 12 || 12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
};
const auditTime = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });
};

const fieldClass = 'mt-1 w-full rounded-lg border border-blue-200 bg-white px-2 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500';

// HR's review of one DTR record: Mark Verified records that HR checked it, and a
// correction changes its times, status, or location with a reason. The first recorded
// times are kept in the audit. The server decides again whether a corrected Time In is late.
function DtrReview({ record, reviewerName, onSave }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState({ text: '', error: false });
  const audit = record.verificationAudit || null;

  const startCorrection = () => {
    setResult({ text: '', error: false });
    setForm({
      timeIn: toInputTime(record.timeIn),
      timeOut: toInputTime(record.timeOut),
      status: record.status || 'Present',
      location: record.location || record.workAssignment?.location || '',
      task: record.workAssignment?.task || '',
      reason: ''
    });
  };
  const change = event => setForm(previous => ({ ...previous, [event.target.name]: event.target.value }));

  const send = async (changes, auditChanges, doneText) => {
    setSaving(true);
    setResult({ text: '', error: false });
    try {
      await onSave({
        id: record.id,
        ...changes,
        verificationAudit: { ...(audit || {}), ...auditChanges, verifiedBy: reviewerName, verifiedAt: new Date().toISOString() }
      });
      setForm(null);
      setResult({ text: doneText, error: false });
    } catch (saveError) {
      setResult({ text: saveError.message || 'Unable to save this DTR record.', error: true });
    } finally {
      setSaving(false);
    }
  };

  const saveCorrection = event => {
    event.preventDefault();
    if (!form.timeIn) {
      setResult({ text: 'Enter the Time In.', error: true });
      return;
    }
    send({
      timeIn: fromInputTime(form.timeIn),
      timeOut: form.timeOut ? fromInputTime(form.timeOut) : null,
      status: form.status,
      location: form.location.trim(),
      workAssignment: { ...(record.workAssignment || {}), location: form.location.trim(), task: form.task.trim() }
    }, {
      originalTimeIn: audit?.originalTimeIn ?? record.timeIn ?? null,
      originalTimeOut: audit?.originalTimeOut ?? record.timeOut ?? null,
      correctionReason: form.reason.trim(),
      correctedBy: reviewerName,
      correctedAt: new Date().toISOString()
    }, 'Correction saved and marked verified by HR.');
  };

  if (!record.id) return null;
  return (
    <div className="mt-4 rounded-2xl border border-blue-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-black uppercase tracking-wide text-slate-800">HR Review</h4>
        {!form && (
          <div className="flex gap-2">
            <button type="button" onClick={() => send({}, {}, 'Marked verified by HR.')} disabled={saving} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-60">Mark Verified</button>
            <button type="button" onClick={startCorrection} disabled={saving} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 disabled:opacity-60">Correct Record</button>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-600">
        {audit?.verifiedAt ? <>Verified by <b>{audit.verifiedBy || 'HR'}</b> on {auditTime(audit.verifiedAt)}.</> : 'Not yet verified by HR.'}
        {audit?.correctedAt && <> Corrected by <b>{audit.correctedBy || 'HR'}</b> on {auditTime(audit.correctedAt)}: {(audit.correctionReason || 'no reason given').replace(/[.\s]+$/, '')}. First recorded: Time In {audit.originalTimeIn || '-'}, Time Out {audit.originalTimeOut || '-'}.</>}
      </p>
      {form && (
        <form onSubmit={saveCorrection} className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-[11px] font-black text-slate-600">Time In
            <input type="time" name="timeIn" value={form.timeIn} onChange={change} required className={fieldClass} />
          </label>
          <label className="text-[11px] font-black text-slate-600">Time Out (leave empty if none)
            <input type="time" name="timeOut" value={form.timeOut} onChange={change} className={fieldClass} />
          </label>
          <label className="text-[11px] font-black text-slate-600">Status
            <select name="status" value={form.status} onChange={change} className={fieldClass}>
              {[...new Set(['Present', 'Absent', form.status])].map(status => <option key={status}>{status}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-black text-slate-600">Location
            <input name="location" value={form.location} onChange={change} maxLength={200} className={fieldClass} />
          </label>
          <label className="text-[11px] font-black text-slate-600 sm:col-span-2">Task
            <input name="task" value={form.task} onChange={change} maxLength={300} className={fieldClass} />
          </label>
          <label className="text-[11px] font-black text-slate-600 sm:col-span-2">Reason for the correction
            <textarea name="reason" value={form.reason} onChange={change} required maxLength={500} rows={2} placeholder="For example: employee forgot to Time Out; confirmed with supervisor." className={fieldClass} />
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={() => setForm(null)} disabled={saving} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save Correction'}</button>
          </div>
        </form>
      )}
      {result.text && <p role={result.error ? 'alert' : 'status'} className={`mt-2 text-xs font-bold ${result.error ? 'text-rose-700' : 'text-emerald-700'}`}>{result.text}</p>}
    </div>
  );
}

export default function HRAdminDTRRecordsView({ employees = [], attendanceHistory = [], attendanceFrom, loadedAttendanceMonths = [], onLoadAttendanceMonth, reviewerName = 'HR/Admin', onSaveRecord, onBack }) {
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('All Dates');
  const [officeFilter, setOfficeFilter] = useState('All Offices');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [selectedId, setSelectedId] = useState(null);
  const findEmployee = record => employees.find(employee => matchesAttendanceEmployee(record, employee));
  const today = getManilaDateString();
  // Only records that belong to current employee accounts.
  const records = recordsForEmployees(attendanceHistory, employees).map((record, index) => {
    const employee = findEmployee(record);
    const status = dtrRecordStatus(record, today);
    return {
      record,
      employee,
      id: record.id || `dtr-${index}`,
      name: employee?.name || record.employeeName || 'Registered employee',
      employeeId: employee?.employeeId || record.employeeId || 'Not assigned',
      office: employee?.office || record.employeeOffice || 'Office not assigned',
      status
    };
  });
  const dates = [...new Set(records.map(row => row.record.date).filter(Boolean))];
  const offices = [...new Set(records.map(row => row.office).filter(Boolean))];
  const filtered = records.filter(row => (
    (dateFilter === 'All Dates' || row.record.date === dateFilter)
    && (officeFilter === 'All Offices' || row.office === officeFilter)
    && (statusFilter === 'All Statuses' || row.status === statusFilter)
    && `${row.name} ${row.employeeId} ${row.office}`.toLowerCase().includes(search.toLowerCase())
  ));
  const complete = records.filter(row => row.status === 'Complete').length;
  const incomplete = records.filter(row => row.status === 'Incomplete').length;
  const forReview = records.filter(row => dtrIssue(row.record, today)).length;

  // Shown right under the record that was opened.
  const renderDetails = selected => (
    <section className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs">
      <div className="flex justify-between">
        <h3 className="font-black text-blue-900">DTR Details</h3>
        <button type="button" onClick={() => setSelectedId(null)} className="font-black text-blue-700">Close</button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-blue-900">
        <span>Employee: <b>{selected.name}</b></span>
        <span>Employee ID: <b>{selected.employeeId}</b></span>
        <span>Position: <b>{selected.employee?.role || '-'}</b></span>
        <span>Office: <b>{selected.office}</b></span>
        <span>Date: <b>{selected.record.date || '-'}</b></span>
        <span>Time In: <b>{selected.record.timeIn || '-'}</b></span>
        <span>Time Out: <b>{selected.record.timeOut || '-'}</b></span>
        <span>Total Hours: <b>{totalHoursWorked(selected.record) || '-'}</b></span>
        <span>Attendance Status: <b>{selected.status}</b></span>
        <span>Record Status: <b>{hasSelfie(selected.record) && selected.record.fingerprintVerified ? 'Fingerprint matched; selfie attached' : 'For Review'}</b></span>
        <span>Face liveness: <b>{selected.record.faceLivenessVerified ? `${Number(selected.record.faceLivenessConfidence || 0).toFixed(1)}%` : 'Not performed'}</b></span>
        <span>Face match: <b>{selected.record.faceVerified ? `Matched · distance ${Number(selected.record.faceMatchDistance || 0).toFixed(3)}` : 'Not performed'}</b></span>
        <span>Fingerprint: <b>{describeFingerprintCheck(selected.record)}</b></span>
        <span>Face-match time: <b>{selected.record.faceVerifiedAt ? new Date(selected.record.faceVerifiedAt).toLocaleString() : 'Not available'}</b></span>
        <span className="col-span-2 text-amber-800">A face match compares image similarity only. It is not a liveness or anti-spoof check and does not prove the photo was captured live.</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className={`rounded-full px-2 py-1 font-bold ${selected.record.assignmentMatch ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          <CheckCircle2 className="inline h-3 w-3" /> GPS Verification
        </span>
        <span className={`rounded-full px-2 py-1 font-bold ${selected.record.faceLivenessVerified ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          <CheckCircle2 className="inline h-3 w-3" /> {selected.record.faceLivenessVerified ? 'Liveness checked' : 'No liveness check'}
        </span>
        <span className={`rounded-full px-2 py-1 font-bold ${selected.record.fingerprintVerified ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          <CheckCircle2 className="inline h-3 w-3" /> Fingerprint
        </span>
        {Number.isFinite(selected.record.latitude) && Number.isFinite(selected.record.longitude) && (
          <a
            href={`https://www.google.com/maps?q=${selected.record.latitude},${selected.record.longitude}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-white px-2 py-1 font-bold text-blue-700 underline"
          >
            View GPS Location
          </a>
        )}
      </div>
      {onSaveRecord && <DtrReview key={selected.id} record={selected.record} reviewerName={reviewerName} onSave={onSaveRecord} />}
      <HRFaceComparison
        employeeId={selected.employee?.employeeId || selected.record.employeeId}
        recordId={selected.record.id}
        hasAttendanceSelfie={hasSelfie(selected.record)}
        attendanceSelfie={selected.record.selfieUrl}
        faceVerified={selected.record.faceVerified}
        faceMatchDistance={selected.record.faceMatchDistance}
      />
    </section>
  );

  return (
    <div className="animate-fadeIn space-y-4">
      <div>
        <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs font-black text-blue-700">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Monitoring
        </button>
        <h2 className="text-xl font-black text-slate-900">DTR Records</h2>
      </div>
      <OlderAttendanceLoader from={attendanceFrom} loadedMonths={loadedAttendanceMonths} onLoadMonth={onLoadAttendanceMonth} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Total Records', records.length, 'text-slate-900'],
          ['Complete', complete, 'text-emerald-600'],
          ['Incomplete', incomplete, 'text-amber-600'],
          ['For Review', forReview, 'text-blue-600']
        ].map(([label, value, color]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs font-black uppercase text-slate-500">{label}</p>
            <strong className={`mt-1 block text-2xl ${color}`}>{value}</strong>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search employee..." className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm" />
        </div>
        <select value={dateFilter} onChange={event => setDateFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold">
          <option>All Dates</option>{dates.map(date => <option key={date}>{date}</option>)}
        </select>
        <select value={officeFilter} onChange={event => setOfficeFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold">
          <option>All Offices</option>{offices.map(office => <option key={office}>{office}</option>)}
        </select>
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold">
          <option>All Statuses</option><option>On Duty</option><option>Complete</option><option>Late</option><option>Incomplete</option>
        </select>
      </div>
      <section>
        <h3 className="mb-3 text-sm font-black text-slate-900">DTR Records</h3>
        {filtered.length ? (
          <div className="space-y-3">
            {filtered.map(row => {
              const isOpen = row.id === selectedId;
              return (
                <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-slate-800">{row.name}</p>
                      <p className="mt-1 text-xs text-slate-500">Employee ID: {row.employeeId}</p>
                      <p className="text-xs text-slate-500">Date: {row.record.date || '-'}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${row.status === 'Complete' ? 'bg-emerald-50 text-emerald-700' : row.status === 'On Duty' ? 'bg-blue-50 text-blue-700' : row.status === 'Late' ? 'bg-orange-50 text-orange-700' : 'bg-amber-50 text-amber-700'}`}>
                      {row.status === 'Incomplete' ? (row.record.timeIn ? 'Missing Time Out' : 'Missing Time In') : row.status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                    <span>Time In: <b className="text-slate-700">{row.record.timeIn || '-'}</b></span>
                    <span>Time Out: <b className="text-slate-700">{row.record.timeOut || '-'}</b></span>
                    <span>Total Hours: <b className="text-slate-700">{totalHoursWorked(row.record) || '-'}</b></span>
                    <span>Office: <b className="text-slate-700">{row.office}</b></span>
                  </div>
                  <button type="button" onClick={() => setSelectedId(isOpen ? null : row.id)} aria-expanded={isOpen} className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">
                    {isOpen ? 'Hide Details' : 'View Details'} <ChevronRight className={`inline h-3 w-3 ${isOpen ? 'rotate-90' : ''}`} />
                  </button>
                  {isOpen && renderDetails(row)}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl bg-slate-50 p-6 text-center">
            <FileCheck2 className="mx-auto h-8 w-8 text-emerald-600" />
            <p className="mt-3 text-sm font-black text-slate-700">0 attendance records available for review.</p>
            <p className="mt-1 text-xs text-slate-500">No attendance records found for the registered employees.</p>
          </div>
        )}
      </section>
    </div>
  );
}
