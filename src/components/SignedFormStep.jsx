import React, { useEffect, useState } from 'react';
import { FileSignature, KeyRound } from 'lucide-react';
import AdobePdfView from './AdobePdfView';
import PdfPreview from './PdfPreview';
import { fetchSigningId, keepSigningId } from '../utils/signingId';

// One signing step on a form WorkMate made, as in Adobe: the form is open here (in Adobe's own
// viewer, see AdobePdfView), and the signer signs it with a digital ID and its password. The
// signature is made in this browser; the signed PDF goes to `onSubmit` as the official copy.
//
// The digital ID is, in order: the one WorkMate made for the signer (kept by WorkMate, locked with
// their signing password, so it works on any device: see utils/signingId.js); or an Adobe digital
// ID file (.pfx or .p12) this device remembers for the account. A signer with neither makes one
// here, with a signing password, the first time they sign.
//
// `decisions` ([{ value, label }]) adds a choice to record with it; `remarksRequiredFor` is the
// decision that needs remarks. `onSubmit` gets { file, decision, remarks }. `digitalSign` is
// { getForm, owner, signerName, signerEmail, image, reason, location }: getForm gets
// { decision, remarks } and returns { bytes, fileName } with what the signature shows on the
// first page, `marks` (see utils/digitalIdSigning.js) or one `spot` ({ center, bottom, width,
// height }); owner is the signer's account (email or ID); signerName and signerEmail go on a
// digital ID made here; image is the signer's saved signature (a data URL, or ''); reason is text
// or a function of { decision, remarks }.

// The Adobe digital ID this device remembers for `owner`: { name, fileName, data (base64) }, or
// null. Browser storage may be unavailable (a private window, blocked site data), so every read
// and write is guarded.
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

const fieldClass = 'mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold';
const linkClass = 'text-[11px] font-black text-indigo-700 underline';

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
  // The digital ID WorkMate keeps for the signer: undefined while loading, then { bytes, name } or null.
  const [workmateId, setWorkmateId] = useState(undefined);
  const [adobeId, setAdobeId] = useState(() => rememberedId(owner));
  // How the signer signs: 'saved' (WorkMate's or the remembered Adobe ID), 'create' (make one
  // now), or 'file' (choose an Adobe digital ID file).
  const [mode, setMode] = useState('saved');
  const [idFile, setIdFile] = useState(null);
  const [keepFile, setKeepFile] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [decision, setDecision] = useState(decisions?.[0]?.value || '');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: '', error: false });
  // The form as it is now, shown above the signing (then as signed).
  const [preview, setPreview] = useState(null); // { url, bytes }
  const [previewError, setPreviewError] = useState('');

  const show = bytes => setPreview({ url: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), bytes });
  useEffect(() => {
    let active = true;
    digitalSign.getForm({ decision: decision || undefined, remarks: '' })
      .then(form => { if (active) show(form.bytes); })
      .catch(error => { if (active) setPreviewError(error.message || 'Unable to open the form.'); });
    fetchSigningId()
      .then(saved => { if (active) setWorkmateId(saved); })
      .catch(() => { if (active) setWorkmateId(null); });
    return () => { active = false; };
    // The form and the digital ID are loaded once; the decision only changes what the signature
    // writes on the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);

  const savedId = workmateId || adobeId;
  // With no digital ID yet, the signer makes one here.
  const shownMode = mode === 'saved' && workmateId !== undefined && !savedId ? 'create' : mode;
  const remarksNeeded = remarksRequiredFor && decision === remarksRequiredFor;
  const switchTo = next => {
    setMode(next);
    setPassword('');
    setConfirmPassword('');
    setMessage({ text: '', error: false });
  };

  // The digital ID to sign with, from the chosen way (making and keeping a new one first).
  const digitalIdToUse = async () => {
    const { createDigitalId, MIN_SIGNING_PASSWORD, readDigitalId } = await import('../utils/digitalIdSigning');
    if (shownMode === 'create') {
      if (password.length < MIN_SIGNING_PASSWORD) throw new Error(`The signing password needs at least ${MIN_SIGNING_PASSWORD} characters.`);
      if (password !== confirmPassword) throw new Error('The two signing passwords do not match.');
      const made = await createDigitalId({ name: digitalSign.signerName, email: digitalSign.signerEmail, password });
      await keepSigningId(made);
      setWorkmateId(made);
      setMode('saved');
      return readDigitalId(made.bytes, password);
    }
    if (shownMode === 'file') {
      if (!idFile) throw new Error('Choose your Adobe digital ID file (.pfx or .p12).');
      const bytes = new Uint8Array(await idFile.arrayBuffer());
      const digitalId = readDigitalId(bytes, password);
      if (keepFile) {
        const kept = { name: digitalId.name, fileName: idFile.name, data: toBase64(bytes) };
        remember(owner, kept);
        setAdobeId(kept);
        if (!workmateId) setMode('saved');
      }
      return digitalId;
    }
    return readDigitalId(workmateId ? workmateId.bytes : fromBase64(adobeId.data), password);
  };

  // Signs the form with the digital ID, shows it signed, then sends it as the signed PDF.
  const sign = async event => {
    event.preventDefault();
    const problem = (!password ? (shownMode === 'create' ? 'Set a signing password for your digital ID.' : 'Enter the password of your digital ID.') : '')
      || (remarksNeeded && !remarks.trim() ? 'Write the reason in the remarks.' : '');
    if (problem) {
      setMessage({ text: problem, error: true });
      return;
    }
    setBusy(true);
    setMessage({ text: '', error: false });
    try {
      const digitalId = await digitalIdToUse();
      const { marksOfForm, signPdfWithDigitalId } = await import('../utils/digitalIdSigning');
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
      setPassword('');
      setConfirmPassword('');
      setMessage({ text: 'Signed.', error: false });
    } catch (error) {
      setMessage({ text: error.message || 'Unable to sign the form.', error: true });
    } finally {
      setBusy(false);
    }
  };

  const forgetAdobeId = () => {
    remember(owner, null);
    setAdobeId(null);
    switchTo(workmateId ? 'saved' : 'file');
  };

  const signingBox = () => {
    if (workmateId === undefined && shownMode === 'saved') {
      return <p role="status" className="text-xs font-semibold text-slate-500">Loading your digital ID…</p>;
    }
    if (shownMode === 'create') {
      return (
        <>
          <p className="text-xs font-semibold text-slate-700">
            {workmateId ? 'Make a new digital ID (the old one cannot be opened without its password; what you signed with it stays valid).' : 'You have no digital ID yet. WorkMate makes one for you now, in your name; it then works on any device.'}
          </p>
          <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-900">Name on the digital ID: <span className="font-black">{digitalSign.signerName || 'Your name'}</span></p>
          <label className="block text-[11px] font-black text-slate-700">Set a signing password (at least 8 characters)
            <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" className={fieldClass} />
          </label>
          <label className="block text-[11px] font-black text-slate-700">Type the signing password again
            <input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" className={fieldClass} />
          </label>
          <p className="text-[11px] font-semibold text-slate-500">Only you know this password. WorkMate keeps your digital ID locked with it and cannot open it, so it cannot be reset; if you forget it, you make a new digital ID.</p>
          <div className="flex flex-wrap gap-3">
            {savedId && <button type="button" onClick={() => switchTo('saved')} className={linkClass}>Back</button>}
            <button type="button" onClick={() => switchTo('file')} className={linkClass}>I have an Adobe digital ID file (.pfx)</button>
          </div>
        </>
      );
    }
    if (shownMode === 'file') {
      return (
        <>
          <label className="block text-[11px] font-black text-slate-700">Adobe digital ID file (.pfx or .p12)
            <input type="file" accept=".pfx,.p12,application/x-pkcs12" onChange={event => setIdFile(event.target.files?.[0] || null)} className={fieldClass} />
          </label>
          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
            <input type="checkbox" checked={keepFile} onChange={event => setKeepFile(event.target.checked)} className="h-3.5 w-3.5 accent-indigo-700" />
            Remember it on this device, so next time only the password is asked
          </label>
          <label className="block text-[11px] font-black text-slate-700">Password of the digital ID
            <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="off" className={fieldClass} />
          </label>
          <button type="button" onClick={() => switchTo(savedId ? 'saved' : 'create')} className={linkClass}>{savedId ? 'Back' : 'Make my digital ID in WorkMate instead'}</button>
        </>
      );
    }
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-indigo-50 px-3 py-2">
          <p className="text-xs font-bold text-indigo-900">Signing as <span className="font-black">{savedId.name || savedId.fileName}</span>{workmateId ? '' : ' (Adobe digital ID on this device)'}</p>
          {!workmateId && <button type="button" onClick={forgetAdobeId} className={linkClass}>Use another digital ID</button>}
        </div>
        <label className="block text-[11px] font-black text-slate-700">{workmateId ? 'Your signing password' : 'Password of the digital ID'}
          <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="off" className={fieldClass} />
        </label>
        {workmateId && (
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => switchTo('create')} className={linkClass}>Forgot your signing password? Make a new digital ID</button>
            <button type="button" onClick={() => switchTo('file')} className={linkClass}>Use an Adobe digital ID file instead</button>
          </div>
        )}
      </>
    );
  };

  const buttonLabel = busy ? 'Signing…' : shownMode === 'create' ? 'Create my digital ID and sign' : signLabel;

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
        <p className="flex items-center gap-1.5 text-xs font-black text-indigo-900"><KeyRound className="h-3.5 w-3.5" />Sign with your digital ID</p>
        {signingBox()}
        <p className="text-[11px] font-semibold text-slate-500">Your signature goes on the form above where it belongs{digitalSign?.image ? ', with your saved signature' : ''}. Adobe Reader shows it as signed by you.</p>
      </div>

      {disabledReason && <p className="text-xs font-bold text-amber-700">{disabledReason}</p>}
      {message.text && <p role={message.error ? 'alert' : 'status'} className={`rounded-lg p-2 text-xs font-bold ${message.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{message.text}</p>}

      <button type="submit" disabled={busy || Boolean(disabledReason) || (workmateId === undefined && shownMode === 'saved')} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-700 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
        <FileSignature className="h-4 w-4" />{buttonLabel}
      </button>
    </form>
  );
}
