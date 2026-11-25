import React, { useEffect, useState } from 'react';
import { FileSignature, KeyRound } from 'lucide-react';
import AdobePdfView from './AdobePdfView';
import PdfPreview from './PdfPreview';

// One signing step on a form WorkMate made, as in Adobe: the form is open here (in Adobe's own
// viewer once WorkMate has an Adobe Client ID, see AdobePdfView), and the signer
// signs it with their Adobe digital ID (the .pfx or .p12 file Adobe Acrobat or Reader made) and
// its password. The digital ID is read only in this browser; this device remembers it for the
// signer's account, so after the first time only the password is asked. The signed PDF goes to
// `onSubmit` as the official copy. `decisions` ([{ value, label }]) adds a choice to record with
// it; `remarksRequiredFor` is the decision that needs remarks. `onSubmit` gets { file, decision,
// remarks }. `digitalSign` is { getForm, owner, image, reason, location }: getForm gets
// { decision, remarks } and returns { bytes, fileName } with what the signature shows on the
// first page, `marks` (see utils/digitalIdSigning.js) or one `spot` ({ center, bottom, width,
// height }); owner is the signer's account (email or ID), for remembering their digital ID;
// image is the signer's saved signature (a data URL, or ''); reason is text or a function of
// { decision, remarks }.

// The digital ID this device remembers for `owner`: { name, fileName, data (base64) }, or null.
// The file stays protected by its own password. Browser storage may be unavailable (a private
// window, blocked site data), so every read and write is guarded.
const storageKey = owner => `workmate.digitalId.${String(owner || 'signer').toLowerCase()}`;
const rememberedId = owner => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey(owner)) || 'null');
    return saved?.data ? saved : null;
  } catch {
    return null;
  }
};
const remember = (owner, value) => {
  try {
    if (value) window.localStorage.setItem(storageKey(owner), JSON.stringify(value));
    else window.localStorage.removeItem(storageKey(owner));
  } catch {
    // Not remembered: the file is chosen again next time.
  }
};
const toBase64 = bytes => {
  let text = '';
  for (let index = 0; index < bytes.length; index += 8192) text += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(text);
};
const fromBase64 = base64 => Uint8Array.from(atob(base64), character => character.charCodeAt(0));

export default function SignedFormStep({
  title,
  description = '',
  decisions = null,
  remarksLabel = '',
  remarksPlaceholder = '',
  remarksRequiredFor = null,
  signLabel = 'Sign',
  digitalSign,
  onSubmit,
  disabledReason = ''
}) {
  const owner = digitalSign?.owner || '';
  const [savedId, setSavedId] = useState(() => rememberedId(owner));
  const [idFile, setIdFile] = useState(null);
  const [keepId, setKeepId] = useState(true);
  const [idPassword, setIdPassword] = useState('');
  const [decision, setDecision] = useState(decisions?.[0]?.value || '');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: '', error: false });
  // The form as it is now, shown above the signing (then as signed).
  const [preview, setPreview] = useState(null); // { url, bytes }
  const [previewError, setPreviewError] = useState('');

  // Each shown copy's link is released when the next one replaces it (see the effect below).
  const show = bytes => setPreview({ url: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), bytes });
  useEffect(() => {
    let active = true;
    digitalSign.getForm({ decision: decision || undefined, remarks: '' })
      .then(form => { if (active) show(form.bytes); })
      .catch(error => { if (active) setPreviewError(error.message || 'Unable to open the form.'); });
    return () => { active = false; };
    // The form is opened once; the decision only changes what the signature writes on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);

  const remarksNeeded = remarksRequiredFor && decision === remarksRequiredFor;

  // Signs the form with the digital ID, shows it signed, then sends it as the signed PDF.
  const sign = async event => {
    event.preventDefault();
    const problem = (!savedId && !idFile ? 'Choose your Adobe digital ID file (.pfx or .p12).' : '')
      || (!idPassword ? 'Enter the password of your digital ID.' : '')
      || (remarksNeeded && !remarks.trim() ? 'Write the reason in the remarks.' : '');
    if (problem) {
      setMessage({ text: problem, error: true });
      return;
    }
    setBusy(true);
    setMessage({ text: '', error: false });
    try {
      const { marksOfForm, readDigitalId, signPdfWithDigitalId } = await import('../utils/digitalIdSigning');
      const idBytes = savedId ? fromBase64(savedId.data) : new Uint8Array(await idFile.arrayBuffer());
      const digitalId = readDigitalId(idBytes, idPassword);
      if (!savedId && keepId) {
        const kept = { name: digitalId.name, fileName: idFile.name, data: toBase64(idBytes) };
        remember(owner, kept);
        setSavedId(kept);
        setIdFile(null);
      }
      const choice = { decision: decision || undefined, remarks: remarks.trim() };
      const form = await digitalSign.getForm(choice);
      const signed = await signPdfWithDigitalId(form.bytes, {
        digitalId,
        pageIndex: form.pageIndex || 0,
        marks: marksOfForm(form),
        image: digitalSign.image || '',
        reason: typeof digitalSign.reason === 'function' ? digitalSign.reason(choice) : digitalSign.reason || '',
        location: digitalSign.location || ''
      });
      show(signed);
      const file = new File([signed], form.fileName.replace(/(_to_sign)?\.pdf$/i, '_signed.pdf'), { type: 'application/pdf' });
      await onSubmit({ file, ...choice });
      setRemarks('');
      setIdPassword('');
      setMessage({ text: 'Signed.', error: false });
    } catch (error) {
      setMessage({ text: error.message || 'Unable to sign the form.', error: true });
    } finally {
      setBusy(false);
    }
  };

  const useAnotherId = () => {
    remember(owner, null);
    setSavedId(null);
    setIdPassword('');
    setMessage({ text: '', error: false });
  };

  return (
    <form onSubmit={sign} className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 text-left">
      <div className="flex items-start gap-2">
        <FileSignature className="mt-0.5 h-4 w-4 shrink-0 text-indigo-700" />
        <div>
          <h4 className="text-sm font-black text-indigo-900">{title}</h4>
          {description && <p className="mt-0.5 text-xs font-semibold text-indigo-800/80">{description}</p>}
        </div>
      </div>

      <div className="h-[60vh] min-h-[22rem] overflow-hidden rounded-xl border border-slate-300 bg-slate-700">
        {preview
          ? <AdobePdfView bytes={preview.bytes} fileName={`${title}.pdf`} fallback={<PdfPreview url={preview.url} bytes={preview.bytes} title={title} />} />
          : <p role="status" className={`p-4 text-center text-sm font-semibold ${previewError ? 'text-rose-200' : 'text-white'}`}>{previewError || 'Opening the form…'}</p>}
      </div>

      {decisions && (
        <fieldset className="space-y-1">
          <legend className="text-[11px] font-black text-slate-700">Your decision</legend>
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

      <div className="space-y-2 rounded-xl border border-indigo-200 bg-white p-3">
        <p className="flex items-center gap-1.5 text-xs font-black text-indigo-900"><KeyRound className="h-3.5 w-3.5" />Sign with your Adobe digital ID</p>
        {savedId ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-indigo-50 px-3 py-2">
            <p className="text-xs font-bold text-indigo-900">Signing as <span className="font-black">{savedId.name || savedId.fileName}</span></p>
            <button type="button" onClick={useAnotherId} className="text-[11px] font-black text-indigo-700 underline">Use another digital ID</button>
          </div>
        ) : (
          <>
            <label className="block text-[11px] font-black text-slate-700">Adobe digital ID file (.pfx or .p12)
              <input type="file" accept=".pfx,.p12,application/x-pkcs12" onChange={event => setIdFile(event.target.files?.[0] || null)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold" />
            </label>
            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
              <input type="checkbox" checked={keepId} onChange={event => setKeepId(event.target.checked)} className="h-3.5 w-3.5 accent-indigo-700" />
              Remember it on this device, so next time only the password is asked
            </label>
          </>
        )}
        <label className="block text-[11px] font-black text-slate-700">Password of the digital ID
          <input type="password" value={idPassword} onChange={event => setIdPassword(event.target.value)} autoComplete="off" className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold" />
        </label>
        <p className="text-[11px] font-semibold text-slate-500">Your signature goes on the form above where it belongs{digitalSign?.image ? ', with your saved signature' : ''}. The digital ID is used only on this device and is not uploaded.</p>
        {!savedId && (
          <details className="text-[11px] font-semibold text-slate-500">
            <summary className="cursor-pointer font-black text-indigo-700">No digital ID yet, or cannot find the file?</summary>
            <p className="mt-1">In Adobe Acrobat Reader: Menu › Preferences › Signatures › Identities &amp; Trusted Certificates. To make one: Add ID › A new digital ID › save it as a new PKCS#12 digital ID file (RSA 2048-bit) with a password. Digital ID Files shows where the file is.</p>
          </details>
        )}
      </div>

      {disabledReason && <p className="text-xs font-bold text-amber-700">{disabledReason}</p>}
      {message.text && <p role={message.error ? 'alert' : 'status'} className={`rounded-lg p-2 text-xs font-bold ${message.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{message.text}</p>}

      <button type="submit" disabled={busy || Boolean(disabledReason)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-700 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
        <FileSignature className="h-4 w-4" />{busy ? 'Signing…' : signLabel}
      </button>
    </form>
  );
}
