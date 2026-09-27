import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronRight, FileCheck2, Search } from 'lucide-react';
import { matchesAttendanceEmployee } from '../utils/attendanceIdentity';
import HRFaceComparison from './HRFaceComparison';

export default function HRAdminDTRRecordsView({ employees = [], attendanceHistory = [], onBack }) {
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('All Dates');
  const [officeFilter, setOfficeFilter] = useState('All Offices');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const findEmployee = record => employees.find(employee => matchesAttendanceEmployee(record, employee));
  const records = attendanceHistory.map((record, index) => {
    const employee = findEmployee(record);
    const status = !record.timeIn || !record.timeOut
      ? 'Incomplete'
      : record.late || /late/i.test(record.status || '')
        ? 'Late'
        : 'Complete';
    return {
      record,
      employee,
      id: record.id || `dtr-${index}`,
      name: employee?.name || record.employeeName || 'Registered employee',
      employeeId: employee?.employeeId || record.employeeId || 'Not assigned',
      office: employee?.office || 'Office not assigned',
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
  const forReview = records.filter(row => (
    row.status !== 'Complete'
    || !row.record.selfieUrl
    || !row.record.fingerprintVerified
  )).length;

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
          <option>All Statuses</option><option>Complete</option><option>Late</option><option>Incomplete</option>
        </select>
      </div>
      <section>
        <h3 className="mb-3 text-sm font-black text-slate-900">DTR Records</h3>
        {filtered.length ? (
          <div className="space-y-3">
            {filtered.map(row => (
              <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-800">{row.name}</p>
                    <p className="mt-1 text-xs text-slate-500">Employee ID: {row.employeeId}</p>
                    <p className="text-xs text-slate-500">Date: {row.record.date || '-'}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-black ${row.status === 'Complete' ? 'bg-emerald-50 text-emerald-700' : row.status === 'Late' ? 'bg-orange-50 text-orange-700' : 'bg-amber-50 text-amber-700'}`}>
                    {row.status === 'Complete' ? 'Complete' : row.status === 'Late' ? 'Late' : 'Missing Time Out'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                  <span>Time In: <b className="text-slate-700">{row.record.timeIn || '-'}</b></span>
                  <span>Time Out: <b className="text-slate-700">{row.record.timeOut || '-'}</b></span>
                  <span>Total Hours: <b className="text-slate-700">{row.record.totalHours || '-'}</b></span>
                  <span>Office: <b className="text-slate-700">{row.office}</b></span>
                </div>
                <button onClick={() => setSelectedRecord(row)} className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">
                  View Details <ChevronRight className="inline h-3 w-3" />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-slate-50 p-6 text-center">
            <FileCheck2 className="mx-auto h-8 w-8 text-emerald-600" />
            <p className="mt-3 text-sm font-black text-slate-700">0 attendance records available for review.</p>
            <p className="mt-1 text-xs text-slate-500">No attendance records found for the registered employees.</p>
          </div>
        )}
      </section>
      {selectedRecord && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs">
          <div className="flex justify-between">
            <h3 className="font-black text-blue-900">DTR Details</h3>
            <button onClick={() => setSelectedRecord(null)} className="font-black text-blue-700">Close</button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-blue-900">
            <span>Employee: <b>{selectedRecord.name}</b></span>
            <span>Employee ID: <b>{selectedRecord.employeeId}</b></span>
            <span>Position: <b>{selectedRecord.employee?.role || '-'}</b></span>
            <span>Office: <b>{selectedRecord.office}</b></span>
            <span>Date: <b>{selectedRecord.record.date || '-'}</b></span>
            <span>Time In: <b>{selectedRecord.record.timeIn || '-'}</b></span>
            <span>Time Out: <b>{selectedRecord.record.timeOut || '-'}</b></span>
            <span>Total Hours: <b>{selectedRecord.record.totalHours || '-'}</b></span>
            <span>Attendance Status: <b>{selectedRecord.status}</b></span>
            <span>Record Status: <b>{selectedRecord.record.selfieUrl && selectedRecord.record.fingerprintVerified ? 'Passkey verified; selfie attached' : 'For Review'}</b></span>
            <span>Face liveness: <b>{selectedRecord.record.faceLivenessVerified ? `${Number(selectedRecord.record.faceLivenessConfidence || 0).toFixed(1)}%` : 'Not performed'}</b></span>
            <span>Face match: <b>{selectedRecord.record.faceVerified ? `Matched · distance ${Number(selectedRecord.record.faceMatchDistance || 0).toFixed(3)}` : 'Not performed'}</b></span>
            <span>Passkey verification: <b>{selectedRecord.record.fingerprintVerified ? 'Verified' : 'Not verified'}</b></span>
            <span>Face-match time: <b>{selectedRecord.record.faceVerifiedAt ? new Date(selectedRecord.record.faceVerifiedAt).toLocaleString() : 'Not available'}</b></span>
            <span className="col-span-2 text-amber-800">A face match compares image similarity only. It is not a liveness or anti-spoof check and does not prove the photo was captured live.</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={`rounded-full px-2 py-1 font-bold ${selectedRecord.record.assignmentMatch ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              <CheckCircle2 className="inline h-3 w-3" /> GPS Verification
            </span>
            <span className={`rounded-full px-2 py-1 font-bold ${selectedRecord.record.faceLivenessVerified ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              <CheckCircle2 className="inline h-3 w-3" /> {selectedRecord.record.faceLivenessVerified ? 'Liveness checked' : 'No liveness check'}
            </span>
            <span className={`rounded-full px-2 py-1 font-bold ${selectedRecord.record.fingerprintVerified ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              <CheckCircle2 className="inline h-3 w-3" /> Device Biometric
            </span>
            {Number.isFinite(selectedRecord.record.latitude) && Number.isFinite(selectedRecord.record.longitude) && (
              <a
                href={`https://www.google.com/maps?q=${selectedRecord.record.latitude},${selectedRecord.record.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-white px-2 py-1 font-bold text-blue-700 underline"
              >
                View GPS Location
              </a>
            )}
          </div>
          <HRFaceComparison
            employeeId={selectedRecord.employee?.employeeId || selectedRecord.record.employeeId}
            attendanceSelfie={selectedRecord.record.selfieUrl}
            faceVerified={selectedRecord.record.faceVerified}
            faceMatchDistance={selectedRecord.record.faceMatchDistance}
          />
        </section>
      )}
    </div>
  );
}
