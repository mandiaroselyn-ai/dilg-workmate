import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, Clock, Download, Eye, MessageSquare, PenLine, RotateCcw, Send } from 'lucide-react';
import { DTR_REPORT_STATUS, DTR_STATUS } from '../../shared/dtrReport';
import { dtrInChargeMarks } from '../utils/dtrForm';
import { dtrStatusText } from '../utils/dtrSubmission';
import { downloadReportZip, makeSubmissionDtr, monthText, reportCover } from '../utils/dtrReport';
import { dtrReportMarks } from '../utils/dtrReportForm';
import { stampForSigning } from '../utils/signedForms';
import DocumentViewer from './DocumentViewer';
import SignedFormStep from './SignedFormStep';

const TABS = [
  { status: DTR_REPORT_STATUS.forPd, label: 'For Signature' },
  { status: DTR_REPORT_STATUS.signed, label: 'To Forward' },
  { status: DTR_REPORT_STATUS.forwarded, label: 'Forwarded' },
  { status: DTR_REPORT_STATUS.returned, label: 'Returned to HR' }
];
const when = value => (value ? new Date(value).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }) : '');

// The Provincial Director's desk for the monthly DTR reports (see shared/dtrReport.js). HR sends
// each month's report, a cover list of every employee's DTR, with the DTRs it checked (HR signs
// nothing; the DTRs carry the employees' signatures). The PD opens them and
// signs once, with their digital ID and password: the report as "Approved by" and every DTR as the
// In-charge ("VERIFIED as to the prescribed office hours"). Or the PD returns the report to HR
// with what to fix. A signed report downloads as one ZIP (the report and the signed DTRs) to send
// to the Regional Office, and the PD marks it forwarded.
// `signatureImage` is the PD's saved signature; `signerKey` is their account, under which this
// device remembers their digital ID; `signerName` and `signerEmail` go on a digital ID they make
// here; `onSaveSignature(image)` keeps a new signature on their profile.
export default function SupervisorDtrDesk({ reports = [], submissions = [], onReviewReport, onOpen, onReload, onUploadSignedForm, signatureImage = '', signerKey = '', signerName = '', signerEmail = '', onSaveSignature = null }) {
  const [tab, setTab] = useState(DTR_REPORT_STATUS.forPd);
  const [viewer, setViewer] = useState(null);
  const [expanded, setExpanded] = useState('');
  const [signing, setSigning] = useState(null);
  const [returning, setReturning] = useState(null);
  const [forwarding, setForwarding] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState({ text: '', error: false });
  const say = (message, error = false) => setNote({ text: message, error });

  useEffect(() => {
    onReload?.().catch?.(() => {});
    // Only when the desk opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = reports.filter(report => report.status === tab);
  const count = status => reports.filter(report => report.status === status).length;
  const dtrsOf = report => report.submissionIds.map(id => submissions.find(item => item.id === id)).filter(Boolean);

  const view = submission => setViewer({ key: Date.now(), title: `DTR of ${submission.employeeName} – ${monthText(submission.month)}`, load: () => makeSubmissionDtr(submission, onOpen) });
  const viewCover = report => setViewer({
    key: Date.now(),
    title: `DTR Report – ${monthText(report.month)}`,
    load: () => reportCover(report)
  });

  // The report made from the list HR sent, tagged for the upload, to sign as "Approved by" on its
  // last page.
  const coverToSign = async report => {
    const made = await reportCover(report);
    return { bytes: await stampForSigning(made.bytes, 'dtr-report-pd', report.month), pageIndex: made.pageIndex, fileName: made.fileName.replace(/\.pdf$/i, '_to_sign.pdf'), marks: dtrReportMarks() };
  };
  // The report's DTRs still to sign as the In-charge, each tagged for its upload.
  const dtrsToSign = async report => {
    const forms = [];
    for (const submission of dtrsOf(report).filter(item => item.status === DTR_STATUS.checked)) {
      const made = await makeSubmissionDtr(submission, onOpen);
      forms.push({
        ref: submission.id,
        label: submission.employeeName,
        bytes: await stampForSigning(made.bytes, 'dtr-incharge', submission.id),
        fileName: made.fileName.replace(/\.pdf$/i, '_to_sign.pdf'),
        marks: dtrInChargeMarks(),
        reason: `Verified as to the prescribed office hours (In-charge), DTR ${monthText(submission.month)}`
      });
    }
    return forms;
  };
  // Saves the signed DTRs first (the report waits for them), then the report.
  const saveSigned = async (report, { file, also = [] }) => {
    for (const [index, item] of also.entries()) {
      say(`Saving DTR ${index + 1} of ${also.length}: ${item.label}…`);
      await onUploadSignedForm({ kind: 'dtr-incharge', ref: item.ref, file: item.file });
    }
    await onUploadSignedForm({ kind: 'dtr-report-pd', ref: report.month, file });
    say(`The DTR report for ${monthText(report.month)} and its ${report.submissionIds.length} DTR${report.submissionIds.length === 1 ? '' : 's'} are signed. Download them for the Regional Office under To Forward.`);
    setSigning(null);
  };

  const act = async (event, report, body, done) => {
    event.preventDefault();
    if (busy) return;
    setBusy(report.id);
    try {
      await onReviewReport({ id: report.id, ...body });
      say(done);
      setReturning(null);
      setForwarding(null);
      setText('');
    } catch (error) {
      say(error.message || 'Unable to save.', true);
    } finally {
      setBusy('');
    }
  };
  const download = async report => {
    setBusy(`zip-${report.id}`);
    try {
      await downloadReportZip(report, submissions, message => message && say(message));
      say('The report and its signed DTRs were downloaded as one ZIP file. Send it to the Regional Office, then mark it forwarded.');
    } catch (error) {
      say(error.message || 'Unable to download the report.', true);
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="space-y-4 text-left">
      <div>
        <h2 className="text-lg font-black text-slate-900">Monthly DTR Reports</h2>
        <p className="text-xs font-semibold text-slate-500">HR sends each month's report with the DTRs (CSC Form No. 48) the employees signed and HR checked. Sign once with your digital ID: the report as Approved by, and every DTR as the In-charge. Then send it to the Regional Office.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map(item => (
          <button key={item.status} type="button" onClick={() => setTab(item.status)} className={`rounded-xl border px-3 py-2 text-xs font-black ${tab === item.status ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500'}`}>
            {item.label} ({count(item.status)})
          </button>
        ))}
      </div>
      {note.text && <p role={note.error ? 'alert' : 'status'} className={`rounded-xl p-3 text-xs font-bold ${note.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{note.text}</p>}
      <ul className="space-y-2">
        {shown.map(report => {
          const dtrs = dtrsOf(report);
          const signedCount = dtrs.filter(item => item.status === DTR_STATUS.verified).length;
          return (
            <li key={report.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-900">DTR Report – {monthText(report.month)}</p>
                  <p className="text-xs font-semibold text-slate-600">Sent by {report.sentBy?.name || 'HR'} on {when(report.sentBy?.at)} · {report.submissionIds.length} DTR{report.submissionIds.length === 1 ? '' : 's'}{report.status === DTR_REPORT_STATUS.forPd && signedCount ? ` · ${signedCount} signed so far` : ''}</p>
                  {report.status === DTR_REPORT_STATUS.signed && <p className="mt-0.5 text-[11px] font-bold text-emerald-700">Signed on {when(report.approvedBy?.at)}. Not forwarded yet.</p>}
                  {report.status === DTR_REPORT_STATUS.forwarded && <p className="mt-0.5 text-[11px] font-bold text-emerald-700">Forwarded to the Regional Office on {when(report.forwarded?.at)}{report.forwarded?.reference ? ` · ${report.forwarded.reference}` : ''}</p>}
                  {report.status === DTR_REPORT_STATUS.returned && <p className="mt-0.5 text-[11px] font-bold text-orange-700">Returned: {report.remarks}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => viewCover(report)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700"><Eye className="h-3.5 w-3.5" />View Report</button>
                  {report.status === DTR_REPORT_STATUS.forPd && (
                    <>
                      <button type="button" onClick={() => { say(''); setReturning(null); setSigning(report); }} className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-2.5 py-1.5 text-[11px] font-bold text-white"><PenLine className="h-3.5 w-3.5" />Sign Report &amp; DTRs</button>
                      <button type="button" onClick={() => { say(''); setSigning(null); setReturning(report); setText(''); }} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700"><RotateCcw className="h-3.5 w-3.5" />Return to HR</button>
                    </>
                  )}
                  {[DTR_REPORT_STATUS.signed, DTR_REPORT_STATUS.forwarded].includes(report.status) && (
                    <button type="button" disabled={busy === `zip-${report.id}`} onClick={() => download(report)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-800 disabled:opacity-60"><Download className="h-3.5 w-3.5" />{busy === `zip-${report.id}` ? 'Downloading…' : 'Download for Regional Office (ZIP)'}</button>
                  )}
                  {report.status === DTR_REPORT_STATUS.signed && (
                    <button type="button" onClick={() => { say(''); setForwarding(report); setText(''); }} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white"><Send className="h-3.5 w-3.5" />Mark as Forwarded</button>
                  )}
                </div>
              </div>

              <button type="button" onClick={() => setExpanded(expanded === report.id ? '' : report.id)} aria-expanded={expanded === report.id} className="mt-2 inline-flex items-center gap-1 text-[11px] font-black text-blue-700">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded === report.id ? 'rotate-180' : ''}`} />{expanded === report.id ? 'Hide the DTRs' : 'Show the DTRs'}
              </button>
              {expanded === report.id && (
                <ul className="mt-2 space-y-1.5">
                  {dtrs.map(submission => (
                    <li key={submission.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <span className="min-w-0">
                        <b className="text-slate-800">{submission.employeeName || submission.employeeId}</b>
                        <span className="block text-[11px] text-slate-500">{dtrStatusText(submission)}</span>
                      </span>
                      <button type="button" onClick={() => view(submission)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700"><Eye className="h-3.5 w-3.5" />View DTR</button>
                    </li>
                  ))}
                  {!dtrs.length && <li className="text-[11px] text-slate-500">The DTRs are still loading.</li>}
                </ul>
              )}

              {signing?.id === report.id && (
                <div className="mt-3">
                  <SignedFormStep
                    key={report.id}
                    title="Approve the report and verify its DTRs"
                    description={`One signature for the report and the ${dtrs.filter(item => item.status === DTR_STATUS.checked).length} DTR(s) still to sign: you sign each DTR as the In-charge, verified as to the prescribed office hours.`}
                    signLabel="Sign the Report & DTRs"
                    digitalSign={{
                      getForm: () => coverToSign(report),
                      alsoSign: () => dtrsToSign(report),
                      owner: signerKey,
                      signerName,
                      signerEmail,
                      image: signatureImage,
                      onSaveSignature,
                      reason: `Approved the DTR report for ${monthText(report.month)}`,
                      location: 'DILG Marinduque'
                    }}
                    onSubmit={signed => saveSigned(report, signed)}
                  />
                  <button type="button" onClick={() => setSigning(null)} className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600">Cancel</button>
                </div>
              )}
              {returning?.id === report.id && (
                <form onSubmit={event => act(event, report, { action: 'return', remarks: text }, `The DTR report for ${monthText(report.month)} was returned to HR.`)} className="mt-3 space-y-2 rounded-xl bg-rose-50 p-3">
                  <label className="block text-[11px] font-black text-rose-800">What should HR fix?
                    <textarea required maxLength={500} value={text} onChange={event => setText(event.target.value)} className="mt-1 min-h-16 w-full rounded-lg border border-rose-200 bg-white p-2 text-xs font-semibold" placeholder="For example: Juan's Oct 6 has no Time Out." />
                  </label>
                  <div className="flex gap-2">
                    <button type="submit" disabled={Boolean(busy)} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-black text-white disabled:opacity-60"><MessageSquare className="h-3.5 w-3.5" />{busy ? 'Returning…' : 'Return to HR'}</button>
                    <button type="button" onClick={() => setReturning(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600">Cancel</button>
                  </div>
                </form>
              )}
              {forwarding?.id === report.id && (
                <form onSubmit={event => act(event, report, { action: 'forward', reference: text }, `The DTR report for ${monthText(report.month)} is marked as forwarded to the Regional Office.`)} className="mt-3 space-y-2 rounded-xl bg-emerald-50 p-3">
                  <label className="block text-[11px] font-black text-emerald-900">How it was sent (optional)
                    <input maxLength={200} value={text} onChange={event => setText(event.target.value)} className="mt-1 w-full rounded-lg border border-emerald-200 bg-white p-2 text-xs font-semibold" placeholder="For example: emailed to the Regional Office, or a document tracking number" />
                  </label>
                  <div className="flex gap-2">
                    <button type="submit" disabled={Boolean(busy)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-60"><Send className="h-3.5 w-3.5" />{busy ? 'Saving…' : 'Mark as Forwarded'}</button>
                    <button type="button" onClick={() => setForwarding(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600">Cancel</button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
        {!shown.length && (
          <li className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs font-semibold text-slate-500">
            {tab === DTR_REPORT_STATUS.forPd ? <><Clock className="mx-auto mb-2 h-5 w-5" />No DTR report is waiting for your signature.</> : tab === DTR_REPORT_STATUS.forwarded ? <><CheckCircle2 className="mx-auto mb-2 h-5 w-5" />No report forwarded yet.</> : 'None.'}
          </li>
        )}
      </ul>

      {viewer && <DocumentViewer key={viewer.key} title={viewer.title} load={viewer.load} onClose={() => setViewer(null)} />}
    </section>
  );
}
