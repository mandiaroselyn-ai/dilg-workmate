import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Eye, MessageSquare, PenLine, RotateCcw } from 'lucide-react';
import dtrTemplate from '../assets/template/dtr-template.pdf';
import { dtrFilename, fillDTR } from '../utils/dtrForm';
import { dtrSignatures, dtrStatusText } from '../utils/dtrSubmission';
import { fetchSignedForm, signedNoteText, stampForSigning } from '../utils/signedForms';
import DocumentViewer from './DocumentViewer';
import SignedFormStep from './SignedFormStep';

const TABS = [
  { status: 'Submitted', label: 'For Verification' },
  { status: 'Verified', label: 'Verified' },
  { status: 'Returned', label: 'Returned' }
];
const monthText = month => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

// The Supervisor's desk for the DTRs employees signed and submitted through WorkMate: as the
// In-charge of CSC Form No. 48, the Supervisor opens each one, then verifies it by signing it in
// Adobe and uploading it, or returns it to the employee with remarks.
export default function SupervisorDtrDesk({ submissions = [], onReview, onOpen, onReload, onUploadSignedForm }) {
  const [tab, setTab] = useState('Submitted');
  const [viewer, setViewer] = useState(null);
  const [verifying, setVerifying] = useState(null);
  const [returning, setReturning] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState({ text: '', error: false });

  useEffect(() => {
    onReload?.().catch?.(() => {});
    // Only when the desk opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = submissions.filter(item => item.status === tab);
  const count = status => submissions.filter(item => item.status === status).length;

  // The DTR as the employee signed it, built from the records the server sends; once verified,
  // the copy the Supervisor signed in Adobe.
  const makeDtr = async submission => {
    const signed = submission.status === 'Verified' && submission.signedForm ? await fetchSignedForm('dtr-incharge', submission.id) : null;
    if (signed) return { fileName: signed.fileName || `DTR_${submission.id}.pdf`, fileType: 'application/pdf', bytes: signed.bytes };
    const { employee, records, travelOrders } = await onOpen(submission.id);
    const [year, month] = submission.month.split('-').map(Number);
    const template = await (await fetch(dtrTemplate)).arrayBuffer();
    const bytes = await fillDTR(template, employee, year, month, records, { travelOrders, signatures: dtrSignatures(submission) });
    return { fileName: dtrFilename(employee?.name || submission.employeeName, year, month), fileType: 'application/pdf', bytes };
  };
  // The DTR to sign in Adobe as the In-charge, tagged for the upload.
  const dtrToSign = async submission => {
    const made = await makeDtr(submission);
    return { bytes: await stampForSigning(made.bytes, 'dtr-incharge', submission.id), fileName: made.fileName.replace(/\.pdf$/i, '_to_sign.pdf') };
  };
  const view = submission => setViewer({ key: Date.now(), title: `DTR of ${submission.employeeName} – ${monthText(submission.month)}`, load: () => makeDtr(submission) });

  const sendBack = async event => {
    event.preventDefault();
    if (!returning || busy) return;
    setBusy(true);
    try {
      await onReview({ id: returning.id, action: 'return', remarks });
      setNote({ text: `${returning.employeeName}'s DTR for ${monthText(returning.month)} was returned. They were told what to fix.`, error: false });
      setReturning(null);
      setRemarks('');
    } catch (error) {
      setNote({ text: error.message || 'Unable to return the DTR.', error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 text-left">
      <div>
        <h2 className="text-lg font-black text-slate-900">DTR to Verify</h2>
        <p className="text-xs font-semibold text-slate-500">Employees sign their Daily Time Record (CSC Form No. 48) each month. As the In-charge, open each one and verify it as to the prescribed office hours, or return it with what to fix.</p>
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
        {shown.map(submission => (
          <li key={submission.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900">{submission.employeeName || submission.employeeId}</p>
                <p className="text-xs font-semibold text-slate-600">DTR for {monthText(submission.month)}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{dtrStatusText(submission)}</p>
                {submission.signedForm && <p className="mt-0.5 text-[11px] font-bold text-emerald-700">{signedNoteText(submission.signedForm)}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => view(submission)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700"><Eye className="h-3.5 w-3.5" />View DTR</button>
                {submission.status === 'Submitted' && (
                  <>
                    <button type="button" onClick={() => { setNote({ text: '', error: false }); setVerifying(submission); }} className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-2.5 py-1.5 text-[11px] font-bold text-white"><PenLine className="h-3.5 w-3.5" />Verify &amp; Sign in Adobe</button>
                    <button type="button" onClick={() => { setNote({ text: '', error: false }); setReturning(submission); setRemarks(''); }} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700"><RotateCcw className="h-3.5 w-3.5" />Return</button>
                  </>
                )}
              </div>
            </div>
            {verifying?.id === submission.id && (
              <div className="mt-3">
                <SignedFormStep
                  title="Verify and sign as the In-charge in Adobe"
                  description="The DTR carries the employee's signature. Check it, sign it with your digital ID as the In-charge, and upload it."
                  downloadLabel="Download DTR to sign"
                  submitLabel="Upload Signed DTR & Verify"
                  onDownload={() => dtrToSign(submission)}
                  onSubmit={async ({ file }) => {
                    await onUploadSignedForm({ kind: 'dtr-incharge', ref: submission.id, file });
                    setNote({ text: `${submission.employeeName}'s DTR for ${monthText(submission.month)} was verified and signed.`, error: false });
                    setVerifying(null);
                  }}
                />
                <button type="button" onClick={() => setVerifying(null)} className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600">Cancel</button>
              </div>
            )}
            {returning?.id === submission.id && (
              <form onSubmit={sendBack} className="mt-3 space-y-2 rounded-xl bg-rose-50 p-3">
                <label className="block text-[11px] font-black text-rose-800">What should the employee fix?
                  <textarea required maxLength={300} value={remarks} onChange={event => setRemarks(event.target.value)} className="mt-1 min-h-16 w-full rounded-lg border border-rose-200 bg-white p-2 text-xs font-semibold" placeholder="For example: Oct 6 has no Time Out." />
                </label>
                <div className="flex gap-2">
                  <button type="submit" disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-black text-white disabled:opacity-60"><MessageSquare className="h-3.5 w-3.5" />{busy ? 'Returning…' : 'Return to Employee'}</button>
                  <button type="button" onClick={() => setReturning(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600">Cancel</button>
                </div>
              </form>
            )}
          </li>
        ))}
        {!shown.length && (
          <li className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs font-semibold text-slate-500">
            {tab === 'Submitted' ? <><Clock className="mx-auto mb-2 h-5 w-5" />No DTR is waiting for your verification.</> : tab === 'Verified' ? <><CheckCircle2 className="mx-auto mb-2 h-5 w-5" />No verified DTR yet.</> : 'No returned DTR.'}
          </li>
        )}
      </ul>

      {viewer && <DocumentViewer key={viewer.key} title={viewer.title} load={viewer.load} onClose={() => setViewer(null)} />}
    </section>
  );
}
