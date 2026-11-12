import React, { useRef, useState } from 'react';
import { Download, FileSignature, Upload } from 'lucide-react';
import { ADOBE_STEPS } from '../../shared/signedForms';
import { downloadBytes } from '../utils/documentFiles';
import { signedFileProblem } from '../utils/signedForms';

// One signing step done in Adobe: download the form WorkMate made, sign it in Adobe Acrobat with
// a digital ID, and upload the signed PDF (see shared/signedForms.js). `decisions` ([{ value,
// label }]) adds a choice to record with the upload; `remarksRequiredFor` is the decision that
// needs remarks. `onDownload` returns { bytes, fileName }; `onSubmit` gets { file, decision, remarks }.
export default function SignedFormStep({
  title,
  description = '',
  downloadLabel = 'Download form to sign',
  onDownload,
  decisions = null,
  remarksLabel = '',
  remarksPlaceholder = '',
  remarksRequiredFor = null,
  submitLabel = 'Upload signed PDF',
  onSubmit,
  disabledReason = ''
}) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [decision, setDecision] = useState(decisions?.[0]?.value || '');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState({ text: '', error: false });

  const download = async () => {
    setBusy('download');
    setMessage({ text: '', error: false });
    try {
      const { bytes, fileName } = await onDownload();
      await downloadBytes(bytes, fileName, 'application/pdf');
    } catch (error) {
      setMessage({ text: error.message || 'Unable to make the form.', error: true });
    } finally {
      setBusy('');
    }
  };

  const remarksNeeded = remarksRequiredFor && decision === remarksRequiredFor;
  const submit = async event => {
    event.preventDefault();
    const problem = signedFileProblem(file) || (remarksNeeded && !remarks.trim() ? 'Write the reason in the remarks.' : '');
    if (problem) {
      setMessage({ text: problem, error: true });
      return;
    }
    setBusy('upload');
    setMessage({ text: '', error: false });
    try {
      await onSubmit({ file, decision: decision || undefined, remarks: remarks.trim() });
      setFile(null);
      setRemarks('');
      if (inputRef.current) inputRef.current.value = '';
    } catch (error) {
      setMessage({ text: error.message || 'Unable to upload the signed PDF.', error: true });
    } finally {
      setBusy('');
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 text-left">
      <div className="flex items-start gap-2">
        <FileSignature className="mt-0.5 h-4 w-4 shrink-0 text-indigo-700" />
        <div>
          <h4 className="text-sm font-black text-indigo-900">{title}</h4>
          {description && <p className="mt-0.5 text-xs font-semibold text-indigo-800/80">{description}</p>}
        </div>
      </div>
      <ol className="list-decimal space-y-0.5 pl-5 text-[11px] font-semibold text-slate-600">
        {ADOBE_STEPS.map(step => <li key={step}>{step}</li>)}
      </ol>
      <button type="button" onClick={download} disabled={Boolean(busy) || Boolean(disabledReason)} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-black text-indigo-800 disabled:opacity-50">
        <Download className="h-3.5 w-3.5" />{busy === 'download' ? 'Preparing…' : downloadLabel}
      </button>

      <label className="block text-[11px] font-black text-slate-700">Signed PDF from Adobe
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={event => setFile(event.target.files?.[0] || null)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold" />
      </label>

      {decisions && (
        <fieldset className="space-y-1">
          <legend className="text-[11px] font-black text-slate-700">Your decision, as you marked it on the form</legend>
          <div className="flex flex-wrap gap-2">
            {decisions.map(option => (
              <label key={option.value} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold ${decision === option.value ? 'border-indigo-500 bg-white text-indigo-800' : 'border-slate-200 bg-white text-slate-600'}`}>
                <input type="radio" name="signed-decision" value={option.value} checked={decision === option.value} onChange={() => setDecision(option.value)} />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {remarksLabel && (
        <label className="block text-[11px] font-black text-slate-700">{remarksLabel}{remarksNeeded ? ' (required)' : ''}
          <textarea value={remarks} onChange={event => setRemarks(event.target.value)} maxLength={1000} placeholder={remarksPlaceholder} className="mt-1 min-h-16 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold" />
        </label>
      )}

      {disabledReason && <p className="text-xs font-bold text-amber-700">{disabledReason}</p>}
      {message.text && <p role={message.error ? 'alert' : 'status'} className={`rounded-lg p-2 text-xs font-bold ${message.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{message.text}</p>}

      <button type="submit" disabled={Boolean(busy) || Boolean(disabledReason) || !file} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-700 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
        <Upload className="h-4 w-4" />{busy === 'upload' ? 'Checking the signatures…' : submitLabel}
      </button>
    </form>
  );
}
