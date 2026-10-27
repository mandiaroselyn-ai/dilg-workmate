import React, { useEffect } from 'react';
import { CheckCircle2, CloudOff } from 'lucide-react';
import { clockMinutes, durationText, OFFICE_HOURS, punchStanding } from '../utils/dtrDay';

const PUNCH_LABELS = { timeIn: 'Time In', lunchOut: 'Lunch Out', lunchIn: 'Lunch In', timeOut: 'Time Out' };

// Shown right after a punch is saved, like a biometric terminal's screen: which punch, the time
// saved (the server's; for one saved offline, this phone's), whose it is, and whether it was on
// time. `receipt` is { punch: 'timeIn' | 'lunchOut' | 'lunchIn' | 'timeOut', record, queued,
// afterQueuedTimeIn }. It closes by itself after a few seconds, or with OK or Esc.
export default function PunchReceipt({ receipt, employee, onClose }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 10000);
    const closeOnEscape = event => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [receipt, onClose]);

  const { punch, record, queued, afterQueuedTimeIn } = receipt;
  const standing = punchStanding(record)[punch];
  // A Time In from noon on starts a half day, counted against the 1:00 PM start.
  const halfDay = punch === 'timeIn' && clockMinutes(record.timeIn) >= OFFICE_HOURS.noon ? 'Half day · ' : '';
  const status = !standing ? null
    : standing.late ? { text: `${halfDay}Late · ${durationText(standing.late)}`, tone: 'bg-rose-50 text-rose-700' }
      : standing.early ? { text: `Undertime · ${durationText(standing.early)}`, tone: 'bg-amber-50 text-amber-700' }
        : { text: `${halfDay}On time`, tone: 'bg-emerald-50 text-emerald-700' };
  const dateText = record.date
    ? new Date(`${record.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  const savedNote = !queued
    ? 'Saved by the server. This is the time in your DTR.'
    : afterQueuedTimeIn
      ? "Saved on this phone with this phone's time. It is sent right after your Time In that is still being sent."
      : "No internet: saved on this phone with this phone's time. It is sent when you are back online.";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4" onClick={onClose}>
      <div
        role="alertdialog"
        aria-labelledby="punch-receipt-title"
        aria-describedby="punch-receipt-time"
        className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        {queued
          ? <CloudOff className="mx-auto h-12 w-12 text-amber-500" />
          : <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />}
        <p id="punch-receipt-title" className="mt-2 text-sm font-black uppercase tracking-[0.25em] text-slate-700">{PUNCH_LABELS[punch]}</p>
        <p id="punch-receipt-time" className="mt-3 font-mono text-5xl font-black tabular-nums text-slate-900">{record[punch] || '--:--'}</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">{dateText}</p>
        <p className="mt-4 text-sm font-black text-slate-800">{employee?.name || record.employeeName || 'Employee'}</p>
        <p className="text-xs text-slate-500">{employee?.employeeId || record.employeeId || ''}</p>
        {status && <span className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-black ${status.tone}`}>{status.text}</span>}
        {record.location && <p className="mt-2 text-xs text-slate-500">{record.location}</p>}
        <p className="mt-3 text-[11px] font-semibold text-slate-500">{savedNote}</p>
        <button type="button" autoFocus onClick={onClose} className="mt-5 w-full rounded-xl bg-[#0B4EA2] py-3 text-sm font-black text-white">OK</button>
      </div>
    </div>
  );
}
