import React, { useState } from 'react';
import { PenLine, X } from 'lucide-react';
import SignaturePad from './SignaturePad';

// Signing a DTR in WorkMate: the statement the signer makes, their signature (the one saved on
// their profile, or a new one drawn or uploaded), and their password to confirm it is them.
// `onConfirm({ signature, password, saveSignature })` resolves when saved, or throws with why not.
export default function SignDtrDialog({ title, statement, savedSignature = '', confirmLabel = 'Sign', onConfirm, onCancel, children }) {
  const [useNew, setUseNew] = useState(!savedSignature);
  const [drawn, setDrawn] = useState('');
  const [password, setPassword] = useState('');
  const [saveSignature, setSaveSignature] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const signature = useNew ? drawn : savedSignature;

  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    if (!signature) {
      setError('Add your signature first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onConfirm({ signature, password, saveSignature: useNew && saveSignature });
    } catch (confirmError) {
      setError(confirmError.message || 'Unable to sign. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-black text-slate-900"><PenLine className="h-5 w-5 text-blue-700" />{title}</h2>
          <button type="button" onClick={onCancel} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        {children}
        <p className="rounded-xl bg-slate-50 p-3 text-xs font-semibold leading-relaxed text-slate-700">{statement}</p>

        <div className="space-y-2">
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Your signature</p>
          {!useNew ? (
            <>
              <div className="flex h-24 items-center justify-center rounded-xl border border-slate-200 bg-white p-2">
                <img src={savedSignature} alt="Your saved signature" className="max-h-full max-w-full object-contain" />
              </div>
              <button type="button" onClick={() => setUseNew(true)} className="text-[11px] font-black text-blue-700 underline">Use a different signature</button>
            </>
          ) : (
            <>
              <SignaturePad onChange={setDrawn} />
              <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                <input type="checkbox" checked={saveSignature} onChange={event => setSaveSignature(event.target.checked)} className="h-4 w-4 accent-blue-700" />
                Save this signature on my profile for next time
              </label>
              {savedSignature && <button type="button" onClick={() => setUseNew(false)} className="text-[11px] font-black text-blue-700 underline">Use my saved signature</button>}
            </>
          )}
        </div>

        <label className="block text-[11px] font-black text-slate-600">Your WorkMate password
          <input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold outline-none focus:border-blue-500" />
          <span className="mt-1 block font-semibold text-slate-500">Your password confirms that you are the one signing (RA 8792). WorkMate keeps who signed and when.</span>
        </label>

        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700">Cancel</button>
          <button type="submit" disabled={busy} className="flex-1 rounded-xl bg-blue-700 px-4 py-3 text-xs font-black text-white disabled:opacity-60">{busy ? 'Signing…' : confirmLabel}</button>
        </div>
      </form>
    </div>
  );
}
