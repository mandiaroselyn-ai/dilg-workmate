import React, { useRef, useState } from 'react';
import { ChevronDown, Download, FileSignature, KeyRound, Upload } from 'lucide-react';
import { ADOBE_STEPS } from '../../shared/signedForms';
import { downloadBytes } from '../utils/documentFiles';
import { signedFileProblem } from '../utils/signedForms';

// One signing step on a form WorkMate made. With `digitalSign`, the signer signs it here with
// their digital ID (the .pfx or .p12 file they sign with in Adobe), which is read only in this
// browser; the Adobe way stays below it: download the form, sign it in Adobe Acrobat, and upload
// the signed PDF (see shared/signedForms.js). Either way the signed PDF goes to `onSubmit`.
// `decisions` ([{ value, label }]) adds a choice to record with it; `remarksRequiredFor` is the
// decision that needs remarks. `onDownload` returns { bytes, fileName }; `onSubmit` gets
// { file, decision, remarks }. `digitalSign` is { getForm, image, reason, location }: getForm
// returns { bytes, fileName, spot } with the signature's place ({ center, bottom, width, height }
// on its first page), and image is the signer's saved signature (a data URL, or '').
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
  signLabel = 'Sign',
  digitalSign = null,
  onSubmit,
  disabledReason = ''
}) {
  const inputRef = useRef(null);
  const idInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [idFile, setIdFile] = useState(null);
  const [idPassword, setIdPassword] = useState('');
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
  const remarksProblem = () => (remarksNeeded && !remarks.trim() ? 'Write the reason in the remarks.' : '');
  const done = () => {
    setFile(null);
    setRemarks('');
    setIdPassword('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const submit = async event => {
    event.preventDefault();
    const problem = signedFileProblem(file) || remarksProblem();
    if (problem) {
      setMessage({ text: problem, error: true });
      return;
    }
    setBusy('upload');
    setMessage({ text: '', error: false });
    try {
      await onSubmit({ file, decision: decision || undefined, remarks: remarks.trim() });
      done();
    } catch (error) {
      setMessage({ text: error.message || 'Unable to upload the signed PDF.', error: true });
    } finally {
      setBusy('');
    }
  };

  // Signs the form here with the digital ID, then sends it as the signed PDF.
  const signHere = async () => {
    const problem = (!idFile ? 'Choose your digital ID file (.pfx or .p12).' : '')
      || (!idPassword ? 'Enter the password of your digital ID.' : '')
      || remarksProblem();
    if (problem) {
      setMessage({ text: problem, error: true });
      return;
    }
    setBusy('sign');
    setMessage({ text: '', error: false });
    try {
      const { readDigitalId, rectOfSpot, signPdfWithDigitalId } = await import('../utils/digitalIdSigning');
      const digitalId = readDigitalId(new Uint8Array(await idFile.arrayBuffer()), idPassword);
      const { bytes, fileName, spot } = await digitalSign.getForm();
      const signed = await signPdfWithDigitalId(bytes, {
        digitalId,
        pageIndex: spot.pageIndex || 0,
        rect: rectOfSpot(spot),
        image: digitalSign.image || '',
        reason: digitalSign.reason || '',
        location: digitalSign.location || ''
      });
      const signedFile = new File([signed], fileName.replace(/(_to_sign)?\.pdf$/i, '_signed.pdf'), { type: 'application/pdf' });
      await onSubmit({ file: signedFile, decision: decision || undefined, remarks: remarks.trim() });
      done();
    } catch (error) {
      setMessage({ text: error.message || 'Unable to sign the form.', error: true });
    } finally {
      setBusy('');
    }
  };

  // The Adobe way: the steps, the download, and the signed file to upload; then its button.
  const adobeFile = (
    <>
      <ol className="list-decimal space-y-0.5 pl-5 text-[11px] font-semibold text-slate-600">
        {ADOBE_STEPS.map(step => <li key={step}>{step}</li>)}
      </ol>
      <button type="button" onClick={download} disabled={Boolean(busy) || Boolean(disabledReason)} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-black text-indigo-800 disabled:opacity-50">
        <Download className="h-3.5 w-3.5" />{busy === 'download' ? 'Preparing…' : downloadLabel}
      </button>

      <label className="block text-[11px] font-black text-slate-700">Signed PDF from Adobe
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={event => setFile(event.target.files?.[0] || null)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold" />
      </label>
    </>
  );
  const uploadButton = (
    <button type="submit" disabled={Boolean(busy) || Boolean(disabledReason) || !file} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-700 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
      <Upload className="h-4 w-4" />{busy === 'upload' ? 'Checking the signatures…' : submitLabel}
    </button>
  );
  const notes = (
    <>
      {disabledReason && <p className="text-xs font-bold text-amber-700">{disabledReason}</p>}
      {message.text && <p role={message.error ? 'alert' : 'status'} className={`rounded-lg p-2 text-xs font-bold ${message.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{message.text}</p>}
    </>
  );

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 text-left">
      <div className="flex items-start gap-2">
        <FileSignature className="mt-0.5 h-4 w-4 shrink-0 text-indigo-700" />
        <div>
          <h4 className="text-sm font-black text-indigo-900">{title}</h4>
          {description && <p className="mt-0.5 text-xs font-semibold text-indigo-800/80">{description}</p>}
        </div>
      </div>

      {!digitalSign && adobeFile}

      {decisions && (
        <fieldset className="space-y-1">
          <legend className="text-[11px] font-black text-slate-700">Your decision{digitalSign ? '' : ', as you marked it on the form'}</legend>
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

      {digitalSign ? (
        <>
          <div className="space-y-2 rounded-xl border border-indigo-200 bg-white p-3">
            <p className="flex items-center gap-1.5 text-xs font-black text-indigo-900"><KeyRound className="h-3.5 w-3.5" />Sign here with your digital ID</p>
            <label className="block text-[11px] font-black text-slate-700">Digital ID file (.pfx or .p12)
              <input ref={idInputRef} type="file" accept=".pfx,.p12,application/x-pkcs12" onChange={event => setIdFile(event.target.files?.[0] || null)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold" />
            </label>
            <label className="block text-[11px] font-black text-slate-700">Password of the digital ID
              <input type="password" value={idPassword} onChange={event => setIdPassword(event.target.value)} autoComplete="off" className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold" />
            </label>
            <p className="text-[11px] font-semibold text-slate-500">The digital ID you sign with in Adobe. It is used only on this device and is not uploaded.{digitalSign.image ? ' Your saved signature is shown with it.' : ''}</p>
            <button type="button" onClick={signHere} disabled={Boolean(busy) || Boolean(disabledReason)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-700 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
              <FileSignature className="h-4 w-4" />{busy === 'sign' ? 'Signing…' : signLabel}
            </button>
          </div>
          <details className="group rounded-xl border border-slate-200 bg-white/70 p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-black text-slate-700">
              Or sign in Adobe and upload
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3 space-y-3">{adobeFile}{uploadButton}</div>
          </details>
          {notes}
        </>
      ) : (
        <>
          {notes}
          {uploadButton}
        </>
      )}
    </form>
  );
}
