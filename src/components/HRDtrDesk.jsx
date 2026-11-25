import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, Download, Eye, FileSignature, MessageSquare, PenLine, RotateCcw } from 'lucide-react';
import { getManilaDateString } from '../../shared/localDate';
import { employeesInServiceSince } from '../../shared/separation';
import { DTR_REPORT_STATUS, DTR_STATUS, reportNotReady, reportOpenToHr } from '../../shared/dtrReport';
import { dtrStatusText } from '../utils/dtrSubmission';
import { downloadReportZip, fetchReportCover, makeSubmissionDtr, monthText, reportRows } from '../utils/dtrReport';
import { dtrReportFilename, dtrReportMarks, fillDtrReport } from '../utils/dtrReportForm';
import { stampForSigning } from '../utils/signedForms';
import DocumentViewer from './DocumentViewer';
import SignedFormStep from './SignedFormStep';

// The month before this one, as YYYY-MM: the latest DTR that can be submitted.
const lastEndedMonth = () => {
  const [year, month] = getManilaDateString().split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};
const when = value => (value ? new Date(value).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }) : '');
const tone = {
  [DTR_STATUS.verified]: 'bg-emerald-50 text-emerald-700',
  [DTR_STATUS.checked]: 'bg-indigo-50 text-indigo-700',
  [DTR_STATUS.submitted]: 'bg-blue-50 text-blue-700',
  [DTR_STATUS.returned]: 'bg-orange-50 text-orange-700'
};
const statusLabel = status => ({ [DTR_STATUS.submitted]: 'To check', [DTR_STATUS.checked]: 'Checked' }[status] || status || 'Not submitted');

// HR's desk for the month's DTRs (see shared/dtrReport.js), in DTR Records: each employee's DTR
// as they signed it, which HR checks or returns with remarks; then the month's report (a cover
// list of everyone's DTR), which HR signs as "Prepared by" to send it with the checked DTRs to the
// Provincial Director. Once the PD signs it, HR downloads it for the Regional Office too.
// `canAct` is false for an HR account that only views (HR 2's desk). `signer` is
// { image, key, name, email, position, onSaveSignature } for signing (see SignedFormStep).
export default function HRDtrDesk({ employees = [], submissions = [], reports = [], canAct = true, onReview, onOpen, onUploadSignedForm, signer = {} }) {
  const [open, setOpen] = useState(true);
  const [month, setMonth] = useState(lastEndedMonth);
  const [viewer, setViewer] = useState(null);
  const [returning, setReturning] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [signing, setSigning] = useState(false);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState({ text: '', error: false });

  const staff = employeesInServiceSince(employees, `${month}-01`);
  const rows = reportRows(staff, submissions, month);
  const ofMonth = submissions.filter(item => item.month === month);
  const report = reports.find(item => item.month === month) || null;
  const openToHr = reportOpenToHr(report);
  const notReady = reportNotReady(ofMonth, month);
  const count = status => rows.filter(row => (row.submission?.status || 'Not submitted') === status).length;
  const say = (text, error = false) => setNote({ text, error });

  const view = submission => setViewer({ key: Date.now(), title: `DTR of ${submission.employeeName} – ${monthText(submission.month)}`, load: () => makeSubmissionDtr(submission, onOpen) });
  const viewCover = () => setViewer({
    key: Date.now(),
    title: `DTR Report – ${monthText(month)}`,
    load: async () => {
      const cover = await fetchReportCover(report);
      if (!cover) throw new Error('The signed report is not available.');
      return { fileName: cover.fileName, fileType: 'application/pdf', bytes: cover.bytes };
    }
  });

  const check = async submission => {
    setBusy(submission.id);
    say('');
    try {
      await onReview({ id: submission.id, action: 'check' });
      say(`${submission.employeeName}'s DTR is checked. It goes to the Provincial Director with the month's report.`);
    } catch (error) {
      say(error.message || 'Unable to check the DTR.', true);
    } finally {
      setBusy('');
    }
  };
  const sendBack = async event => {
    event.preventDefault();
    if (!returning || busy) return;
    setBusy(returning.id);
    try {
      await onReview({ id: returning.id, action: 'return', remarks });
      say(`${returning.employeeName}'s DTR was returned. They were told what to fix.`);
      setReturning(null);
      setRemarks('');
    } catch (error) {
      say(error.message || 'Unable to return the DTR.', true);
    } finally {
      setBusy('');
    }
  };

  // The cover to sign as "Prepared by", tagged for the upload.
  const coverToSign = async () => {
    const made = await fillDtrReport({
      month,
      rows,
      preparedBy: { name: signer.name || 'HR/Admin', position: signer.position || 'HR/Admin' }
    });
    return { bytes: await stampForSigning(made.bytes, 'dtr-report-hr', month), pageIndex: made.pageIndex, fileName: dtrReportFilename(month).replace(/\.pdf$/, '_to_sign.pdf'), marks: dtrReportMarks('hr') };
  };

  const download = async () => {
    setBusy('zip');
    try {
      await downloadReportZip(report, submissions, text => text && say(text));
      say('The report and its signed DTRs were downloaded as one ZIP file.');
    } catch (error) {
      say(error.message || 'Unable to download the report.', true);
    } finally {
      setBusy('');
    }
  };

  const reportLine = !report
    ? 'Not sent to the Provincial Director yet.'
    : {
      [DTR_REPORT_STATUS.forPd]: `Sent to the Provincial Director on ${when(report.preparedBy?.at)} with ${report.submissionIds.length} DTR${report.submissionIds.length === 1 ? '' : 's'}. Waiting for the signature.`,
      [DTR_REPORT_STATUS.returned]: `Returned by the Provincial Director: ${report.remarks || 'fix it and send it again'}`,
      [DTR_REPORT_STATUS.signed]: `Signed by ${report.approvedBy?.name || 'the Provincial Director'} on ${when(report.approvedBy?.at)}. Ready for the Regional Office.`,
      [DTR_REPORT_STATUS.forwarded]: `Forwarded to the Regional Office on ${when(report.forwarded?.at)}${report.forwarded?.reference ? ` (${report.forwarded.reference})` : ''}.`
    }[report.status] || report.status;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="flex items-center gap-2">
          <PenLine className="h-5 w-5 shrink-0 text-blue-700" />
          <span>
            <span className="block text-sm font-black text-slate-900">Monthly DTRs and Report</span>
            <span className="block text-xs text-slate-500">{monthText(month)}: {count(DTR_STATUS.submitted)} to check, {count(DTR_STATUS.checked)} checked, {count(DTR_STATUS.verified)} verified, {count(DTR_STATUS.returned)} returned, {count('Not submitted')} not submitted.</span>
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 p-4">
          <p className="text-xs text-slate-500">Employees sign their DTR (CSC Form No. 48) when a month ends, and it comes here. Check each one, or return it with what to fix. Then sign the month's report and send it with the checked DTRs to the Provincial Director, who signs them and forwards them to the Regional Office.</p>
          <label className="text-[11px] font-black text-slate-600">Month
            <input type="month" value={month} max={lastEndedMonth()} onChange={event => { if (event.target.value) { setMonth(event.target.value); setSigning(false); say(''); } }} className="mt-1 block rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold text-slate-800" />
          </label>

          <div className={`rounded-xl border p-3 text-xs ${report?.status === DTR_REPORT_STATUS.returned ? 'border-orange-200 bg-orange-50 text-orange-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
            <p className="font-black">Report for {monthText(month)}{report ? `: ${report.status}` : ''}</p>
            <p className="mt-0.5 font-semibold">{reportLine}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {report && !openToHr && <button type="button" onClick={viewCover} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700"><Eye className="h-3.5 w-3.5" />View Report</button>}
              {[DTR_REPORT_STATUS.signed, DTR_REPORT_STATUS.forwarded].includes(report?.status) && (
                <button type="button" disabled={busy === 'zip'} onClick={download} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-800 disabled:opacity-60"><Download className="h-3.5 w-3.5" />{busy === 'zip' ? 'Downloading…' : 'Download Report and DTRs (ZIP)'}</button>
              )}
              {canAct && openToHr && !signing && (
                <button type="button" disabled={Boolean(notReady)} onClick={() => { say(''); setSigning(true); }} className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"><FileSignature className="h-3.5 w-3.5" />{report ? 'Sign & Send the Report Again' : 'Sign & Send the Report to the PD'}</button>
              )}
            </div>
            {canAct && openToHr && notReady && <p className="mt-2 text-[11px] font-semibold text-slate-500">{notReady}</p>}
          </div>

          {signing && (
            <div>
              <SignedFormStep
                key={month}
                title="Sign the report as Prepared by"
                description={`The report lists every employee's DTR for ${monthText(month)}. The checked DTRs go with it to the Provincial Director.`}
                signLabel="Sign & Send to the PD"
                digitalSign={{
                  getForm: coverToSign,
                  owner: signer.key,
                  signerName: signer.name,
                  signerEmail: signer.email,
                  image: signer.image || '',
                  onSaveSignature: signer.onSaveSignature,
                  reason: `Prepared the DTR report for ${monthText(month)}`,
                  location: 'DILG Marinduque'
                }}
                onSubmit={async ({ file }) => {
                  await onUploadSignedForm({ kind: 'dtr-report-hr', ref: month, file });
                  say(`The DTR report for ${monthText(month)} was signed and sent to the Provincial Director.`);
                  setSigning(false);
                }}
              />
              <button type="button" onClick={() => setSigning(false)} className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600">Cancel</button>
            </div>
          )}

          {note.text && <p role={note.error ? 'alert' : 'status'} className={`rounded-xl p-3 text-xs font-bold ${note.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{note.text}</p>}

          {month > lastEndedMonth() && <p className="text-xs font-semibold text-amber-800">This month has not ended yet, so its DTRs cannot be signed and submitted yet.</p>}
          <ul className="space-y-1.5">
            {rows.map(({ employeeId, name, submission }) => (
              <li key={employeeId || name} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <b className="text-slate-800">{name}</b>
                    {submission && <span className="block text-[11px] text-slate-500">{dtrStatusText(submission)}</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${tone[submission?.status] || 'bg-slate-100 text-slate-500'}`}>{statusLabel(submission?.status)}</span>
                    {submission && submission.status !== DTR_STATUS.returned && (
                      <button type="button" onClick={() => view(submission)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700"><Eye className="h-3.5 w-3.5" />View</button>
                    )}
                    {canAct && openToHr && submission?.status === DTR_STATUS.submitted && (
                      <button type="button" disabled={busy === submission.id} onClick={() => check(submission)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-60"><CheckCircle2 className="h-3.5 w-3.5" />Check</button>
                    )}
                    {canAct && openToHr && [DTR_STATUS.submitted, DTR_STATUS.checked].includes(submission?.status) && (
                      <button type="button" onClick={() => { say(''); setReturning(submission); setRemarks(''); }} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700"><RotateCcw className="h-3.5 w-3.5" />Return</button>
                    )}
                  </span>
                </div>
                {returning?.id && returning.id === submission?.id && (
                  <form onSubmit={sendBack} className="mt-2 space-y-2 rounded-xl bg-rose-50 p-3">
                    <label className="block text-[11px] font-black text-rose-800">What should {name} fix?
                      <textarea required maxLength={300} value={remarks} onChange={event => setRemarks(event.target.value)} className="mt-1 min-h-16 w-full rounded-lg border border-rose-200 bg-white p-2 text-xs font-semibold" placeholder="For example: Oct 6 has no Time Out." />
                    </label>
                    <div className="flex gap-2">
                      <button type="submit" disabled={Boolean(busy)} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-black text-white disabled:opacity-60"><MessageSquare className="h-3.5 w-3.5" />{busy ? 'Returning…' : 'Return to Employee'}</button>
                      <button type="button" onClick={() => setReturning(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600">Cancel</button>
                    </div>
                  </form>
                )}
              </li>
            ))}
            {!rows.length && <li className="text-xs text-slate-500">No employees in service this month.</li>}
          </ul>
        </div>
      )}

      {viewer && <DocumentViewer key={viewer.key} title={viewer.title} load={viewer.load} onClose={() => setViewer(null)} />}
    </section>
  );
}
