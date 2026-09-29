import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronRight, FileCheck2, Search } from 'lucide-react';
import { getManilaDateString } from '../../shared/localDate';
import { matchesAttendanceEmployee } from '../utils/attendanceIdentity';
import { dtrIssue, dtrRecordStatus, recordsForEmployees, totalHoursWorked } from '../utils/hrAttendance';
import { describeFingerprintCheck } from '../utils/fingerprintMessages';
import HRFaceComparison from './HRFaceComparison';

export default function HRAdminDTRRecordsView({ employees = [], attendanceHistory = [], onBack }) {
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
        <span>Record Status: <b>{selected.record.selfieUrl && selected.record.fingerprintVerified ? 'Fingerprint matched; selfie attached' : 'For Review'}</b></span>
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
      <HRFaceComparison
        employeeId={selected.employee?.employeeId || selected.record.employeeId}
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Total Records', records.length, 'text-slate-900'],
          ['Complete', complete, 'text-emerald-600'],
          ['Incomplete', incomplete, 'text-amber-600'],
          ['For Review', forReview, 'text-blue-600']
        ].map(([label, value, color]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[10px] font-black uppercase text-slate-500">{label}</p>
            <strong className={`mt-1 block text-2xl ${color}`}>{value}</strong>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
                    <span className={`rounded-full px-3 py-1 text-[10px] font-black ${row.status === 'Complete' ? 'bg-emerald-50 text-emerald-700' : row.status === 'On Duty' ? 'bg-blue-50 text-blue-700' : row.status === 'Late' ? 'bg-orange-50 text-orange-700' : 'bg-amber-50 text-amber-700'}`}>
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
