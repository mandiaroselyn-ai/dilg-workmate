import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiFetch, parseApiResponse } from '../utils/api';

// HR's lists leave attendance selfies out, so a record's selfie is loaded here by its
// `recordId` when `hasAttendanceSelfie` says there is one (unless `attendanceSelfie` is given).
export default function HRFaceComparison({
  employeeId,
  recordId,
  hasAttendanceSelfie = false,
  attendanceSelfie: givenAttendanceSelfie = '',
  faceVerified = false,
  faceMatchDistance
}) {
  const [enrollmentSelfie, setEnrollmentSelfie] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [loadedSelfie, setLoadedSelfie] = useState('');
  const [selfieLoading, setSelfieLoading] = useState(false);
  const [selfieError, setSelfieError] = useState('');
  const [selfieReloadKey, setSelfieReloadKey] = useState(0);
  const attendanceSelfie = givenAttendanceSelfie || loadedSelfie;

  useEffect(() => {
    let active = true;
    setLoadedSelfie('');
    setSelfieError('');
    if (givenAttendanceSelfie || !hasAttendanceSelfie || !recordId) {
      setSelfieLoading(false);
      return () => { active = false; };
    }
    setSelfieLoading(true);
    apiFetch(`/api/dtr/action?action=record-selfie&id=${encodeURIComponent(recordId)}`, { cache: 'no-store' })
      .then(async response => {
        const result = await parseApiResponse(response, 'Attendance selfie request');
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load the attendance selfie.');
        if (active) setLoadedSelfie(result.selfieUrl || '');
      })
      .catch(loadError => {
        if (active) setSelfieError(loadError.message || 'Unable to load the attendance selfie.');
      })
      .finally(() => {
        if (active) setSelfieLoading(false);
      });
    return () => { active = false; };
  }, [recordId, hasAttendanceSelfie, givenAttendanceSelfie, selfieReloadKey]);

  useEffect(() => {
    let active = true;
    setEnrollmentSelfie('');
    setError('');

    if (!employeeId) {
      setLoading(false);
      setError('Cannot load the enrollment selfie because this attendance record has no employee ID.');
      return () => { active = false; };
    }

    setLoading(true);
    apiFetch(`/api/face-enrollment?employeeId=${encodeURIComponent(employeeId)}`)
      .then(async response => {
        const result = await parseApiResponse(response, 'HR enrollment image request');
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Unable to load the employee enrollment selfie.');
        }
        if (active) setEnrollmentSelfie(result.enrollmentImage || '');
      })
      .catch(loadError => {
        if (active) setError(loadError.message || 'Unable to load the employee enrollment selfie.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [employeeId, reloadKey]);

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <h4 className="text-xs font-black uppercase tracking-wide text-slate-800">Face Match Evidence</h4>
        <p className={`mt-1 text-xs font-black ${faceVerified ? 'text-emerald-700' : 'text-amber-800'}`}>
          {faceVerified
            ? `Server face match passed${faceMatchDistance != null && Number.isFinite(Number(faceMatchDistance)) ? ` · distance ${Number(faceMatchDistance).toFixed(3)}` : ''}`
            : 'No successful face match is recorded for this attendance entry.'}
        </p>
        <p className="mt-1 text-[11px] font-semibold text-amber-800">
          Attendance face matching runs on the server against the HR-approved enrollment selfie. It is not a liveness or anti-spoof check.
        </p>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-2">
          <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-blue-900">Attendance selfie</p>
          {selfieLoading ? (
            <p role="status" className="rounded-lg bg-white p-4 text-xs font-semibold text-blue-800">Loading attendance selfie...</p>
          ) : attendanceSelfie ? (
            <img src={attendanceSelfie} alt="Employee attendance selfie for HR manual comparison" className="max-h-64 min-h-36 w-full rounded-lg bg-white object-contain" referrerPolicy="no-referrer" />
          ) : selfieError ? (
            <div className="rounded-lg bg-white p-3">
              <p role="alert" className="text-xs font-semibold text-rose-700">{selfieError}</p>
              <button
                type="button"
                onClick={() => setSelfieReloadKey(previous => previous + 1)}
                className="mt-2 inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-xs font-black text-rose-700"
              >
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            </div>
          ) : (
            <p className="rounded-lg bg-white p-4 text-xs font-semibold text-slate-500">No attendance selfie is attached to this record.</p>
          )}
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-2">
          <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-amber-900">Biometric enrollment selfie</p>
          {loading ? (
            <p role="status" className="rounded-lg bg-white p-4 text-xs font-semibold text-blue-800">Loading enrollment selfie...</p>
          ) : enrollmentSelfie ? (
            <img src={enrollmentSelfie} alt="Employee biometric enrollment selfie for HR manual comparison" className="max-h-64 min-h-36 w-full rounded-lg bg-white object-contain" />
          ) : error ? (
            <div className="rounded-lg bg-white p-3">
              <p role="alert" className="text-xs font-semibold text-rose-700">{error}</p>
              <button
                type="button"
                onClick={() => setReloadKey(previous => previous + 1)}
                className="mt-2 inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-xs font-black text-rose-700"
              >
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            </div>
          ) : (
            <p className="rounded-lg bg-white p-4 text-xs font-semibold text-slate-500">No biometric enrollment selfie is on file for this employee.</p>
          )}
        </div>
      </div>
    </section>
  );
}
