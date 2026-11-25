import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, FileSignature, KeyRound } from 'lucide-react';
import AdobePdfView from './AdobePdfView';
import PdfPreview from './PdfPreview';
import SignaturePad from './SignaturePad';
import { fetchSigningId, keepSigningId } from '../utils/signingId';

// One signing step on a form WorkMate made, as in Adobe: the form is open here (in Adobe's own
// viewer, see AdobePdfView), and the signer signs it with a digital ID and its password. The
// signature is made in this browser; the signed PDF goes to `onSubmit` as the official copy.
//
// The digital ID is, in order: the one WorkMate made for the signer (kept by WorkMate, locked with
// their WorkMate password, so it works on any device: see utils/signingId.js); or an Adobe or
// PNPKI digital ID file (.pfx or .p12) this device remembers for the account. A signer with
// neither makes one here, with their WorkMate password, the first time they sign.
//
// `decisions` ([{ value, label }]) adds a choice to record with it; `remarksRequiredFor` is the
// decision that needs remarks. `onSubmit` gets { file, decision, remarks }. `digitalSign` is
// { getForm, owner, signerName, signerEmail, image, onSaveSignature, reason, location }: getForm
// gets { decision, remarks } and returns { bytes, fileName } with what the signature shows on the
// first page, `marks` (see utils/digitalIdSigning.js) or one `spot` ({ center, bottom, width,
// height }); owner is the signer's account (email or ID); signerName and signerEmail go on a
// digital ID made here; image is the signer's saved signature (a data URL, or ''), and
// onSaveSignature(image) saves a new one on their profile; reason is text or a function of
// { decision, remarks }.
//
// As in Adobe's "Add signature", the signer puts their own signature on the form: the one saved on
// their profile, or one they draw or upload now. It shows over their name with "Digitally signed
// by" and the date under it.

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
  // The signer's own signature on the form: the saved one, or a new one drawn or uploaded.
  const savedSignature = digitalSign?.image || '';
  const [useNewSignature, setUseNewSignature] = useState(!savedSignature);
  const [drawnSignature, setDrawnSignature] = useState('');
  const [saveSignature, setSaveSignature] = useState(true);
  const signatureImage = useNewSignature ? drawnSignature : savedSignature;
  // Show the passwords as typed (as Change Password does).
  const [showPasswords, setShowPasswords] = useState(false);
  const passwordInputProps = { type: showPasswords ? 'text' : 'password', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false };
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
  // WorkMate's digital ID is locked with the WorkMate password; an Adobe or PNPKI file, with its own.
  const usesWorkmatePassword = shownMode === 'create' || (shownMode === 'saved' && Boolean(workmateId));
  const remarksNeeded = remarksRequiredFor && decision === remarksRequiredFor;
  const switchTo = next => {
    setMode(next);
    setPassword('');
    setMessage({ text: '', error: false });
  };

  // The digital ID to sign with, from the chosen way (making and keeping a new one first).
  const digitalIdToUse = async () => {
    const { createDigitalId, readDigitalId } = await import('../utils/digitalIdSigning');
    // A new digital ID in the signer's name, locked with their WorkMate password, which the server
    // checks before it keeps the ID.
    const makeAndKeep = async () => {
      const made = await createDigitalId({ name: digitalSign.signerName, email: digitalSign.signerEmail, password });
      await keepSigningId(made, password);
      setWorkmateId(made);
      setMode('saved');
      return readDigitalId(made.bytes, password);
    };
    if (shownMode === 'create') return makeAndKeep();
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
    if (workmateId) {
      try {
        return readDigitalId(workmateId.bytes, password);
      } catch (error) {
        // Locked with another password: a signing password from before, or the WorkMate password
        // changed since. When this is the WorkMate password (the server checks it), a new digital
        // ID takes the old one's place; what was signed with the old one stays valid.
        if (/password/i.test(error.message || '')) return makeAndKeep();
        throw error;
      }
    }
    return readDigitalId(fromBase64(adobeId.data), password);
  };

  // Signs the form with the digital ID, shows it signed, then sends it as the signed PDF.
  const sign = async event => {
    event.preventDefault();
    const problem = (!signatureImage ? 'Add your signature first: draw it, or upload a picture of it.' : '')
      || (!password ? (usesWorkmatePassword ? 'Enter your WorkMate password.' : 'Enter the password of your digital ID.') : '')
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
        image: signatureImage,
        reason: typeof digitalSign.reason === 'function' ? digitalSign.reason(choice) : digitalSign.reason || '',
        location: digitalSign.location || ''
      });
      show(signed);
      const file = new File([signed], form.fileName.replace(/(_to_sign)?\.pdf$/i, '_signed.pdf'), { type: 'application/pdf' });
      await onSubmit({ file, ...choice });
      // A new signature is kept on the profile for next time, when the signer chose to.
      if (useNewSignature && saveSignature && digitalSign.onSaveSignature) {
        await Promise.resolve(digitalSign.onSaveSignature(drawnSignature)).catch(() => {});
      }
      setRemarks('');
      setPassword('');
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
          <p className="text-xs font-semibold text-slate-700">You have no digital ID yet. WorkMate makes one in your name now, locked with your WorkMate password, so it works on any device.</p>
          <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-900">Name on the digital ID: <span className="font-black">{digitalSign.signerName || 'Your name'}</span></p>
          <label className="block text-[11px] font-black text-slate-700">Your WorkMate password
            <input {...passwordInputProps} value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" className={fieldClass} />
          </label>
          <p className="text-[11px] font-semibold text-slate-500">The password you log in with. WorkMate keeps your digital ID locked with it and cannot open it.</p>
          <div className="flex flex-wrap gap-3">
            {savedId && <button type="button" onClick={() => switchTo('saved')} className={linkClass}>Back</button>}
            <button type="button" onClick={() => switchTo('file')} className={linkClass}>Use an Adobe or PNPKI digital ID file instead</button>
          </div>
        </>
      );
    }
    if (shownMode === 'file') {
      return (
        <>
          <label className="block text-[11px] font-black text-slate-700">Adobe or PNPKI digital ID file (.pfx or .p12)
            <input type="file" accept=".pfx,.p12,application/x-pkcs12" onChange={event => setIdFile(event.target.files?.[0] || null)} className={fieldClass} />
          </label>
          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
            <input type="checkbox" checked={keepFile} onChange={event => setKeepFile(event.target.checked)} className="h-3.5 w-3.5 accent-indigo-700" />
            Remember it on this device, so next time only the password is asked
          </label>
          <label className="block text-[11px] font-black text-slate-700">Password of the digital ID
            <input {...passwordInputProps} value={password} onChange={event => setPassword(event.target.value)} autoComplete="off" className={fieldClass} />
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
        <label className="block text-[11px] font-black text-slate-700">{workmateId ? 'Your WorkMate password' : 'Password of the digital ID'}
          <input {...passwordInputProps} value={password} onChange={event => setPassword(event.target.value)} autoComplete={workmateId ? 'current-password' : 'off'} className={fieldClass} />
        </label>
        {workmateId && (
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => switchTo('file')} className={linkClass}>Use an Adobe or PNPKI digital ID file instead</button>
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
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-black text-indigo-900"><KeyRound className="h-3.5 w-3.5" />Sign with your digital ID</p>
          <button type="button" onClick={() => setShowPasswords(value => !value)} className="inline-flex items-center gap-1 text-[10px] font-black text-slate-500">
            {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {showPasswords ? 'Hide' : 'Show'} password
          </button>
        </div>
        <div className="space-y-2">
          <p className="text-[11px] font-black text-slate-700">Your signature</p>
          {!useNewSignature ? (
            <>
              <div className="flex h-24 items-center justify-center rounded-xl border border-slate-200 bg-white p-2">
                <img src={savedSignature} alt="Your saved signature" className="max-h-full max-w-full object-contain" />
              </div>
              <button type="button" onClick={() => setUseNewSignature(true)} className={linkClass}>Use a different signature</button>
            </>
          ) : (
            <>
              <SignaturePad onChange={setDrawnSignature} />
              {digitalSign?.onSaveSignature && (
                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                  <input type="checkbox" checked={saveSignature} onChange={event => setSaveSignature(event.target.checked)} className="h-3.5 w-3.5 accent-indigo-700" />
                  Save this signature on my profile for next time
                </label>
              )}
              {savedSignature && <button type="button" onClick={() => setUseNewSignature(false)} className={linkClass}>Use my saved signature</button>}
            </>
          )}
        </div>
        {signingBox()}
        <p className="text-[11px] font-semibold text-slate-500">Your signature goes on the form above where it belongs, with "Digitally signed by" your name and the date under it. Adobe Reader shows the form as signed by you.</p>
      </div>

      {disabledReason && <p className="text-xs font-bold text-amber-700">{disabledReason}</p>}
      {message.text && <p role={message.error ? 'alert' : 'status'} className={`rounded-lg p-2 text-xs font-bold ${message.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{message.text}</p>}

      <button type="submit" disabled={busy || Boolean(disabledReason) || (workmateId === undefined && shownMode === 'saved')} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-700 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
        <FileSignature className="h-4 w-4" />{buttonLabel}
      </button>
    </form>
  );
}
