import React, { useRef, useState } from 'react';
import { FileCheck2, Paperclip, Trash2, Upload } from 'lucide-react';
import DocumentViewer from './DocumentViewer';
import { TRAVEL_DOCUMENTS, TRAVEL_DOCUMENT_KIND_REQUIRED, travelDocumentsOpen } from '../../shared/travelDocuments';
import { fetchTravelDocument, removeTravelDocument, uploadTravelDocument } from '../utils/travelDocuments';

const shortDate = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' });
};
const sameId = (a, b) => Boolean(a) && Boolean(b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

// The files the employees on a Travel Order attach once it is approved (shared/travelDocuments.js):
// a Post Activity Report or a Certificate of Appearance. `canUpload`: the viewer is an employee on
// the Travel Order (the filer or one they included), who attaches their own; HR and the
// Supervisor only view them. `onRequestChange(saved)` gets the Travel Order after an upload or a
// removal.
export default function TravelDocumentsPanel({ request, user = {}, canUpload = false, onRequestChange, className = '' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [kind, setKind] = useState('');
  const [viewer, setViewer] = useState(null);
  const inputRef = useRef(null);
  if (!travelDocumentsOpen(request)) return null;

  const documents = Array.isArray(request.travelDocuments) ? request.travelDocuments : [];

  const chooseFile = () => {
    setError('');
    if (!kind) {
      setError(TRAVEL_DOCUMENT_KIND_REQUIRED);
      return;
    }
    inputRef.current?.click();
  };

  const upload = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !kind) return;
    setError('');
    setBusy(true);
    try {
      onRequestChange?.(await uploadTravelDocument({ ref: request.id, file, kind }));
      setKind('');
    } catch (uploadError) {
      setError(uploadError.message || 'Unable to attach the file.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async item => {
    if (!window.confirm(`Remove ${item.fileName}?`)) return;
    setError('');
    setBusy(true);
    try {
      onRequestChange?.(await removeTravelDocument(request.id, item.id));
    } catch (removeError) {
      setError(removeError.message || 'Unable to remove the file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`rounded-xl border border-blue-100 bg-blue-50/40 p-3 text-left ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-blue-800"><FileCheck2 className="h-3.5 w-3.5" />Post Activity Report / Certificate of Appearance</p>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-600">
            {canUpload ? 'Attach your Post Activity Report or Certificate of Appearance for this Travel Order.' : 'Attached by the employees on this Travel Order.'}
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${documents.length ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
          {documents.length ? `${documents.length} file(s) attached` : 'None attached yet'}
        </span>
      </div>

      {documents.length > 0 && (
        <ul className="mt-2 space-y-1">
          {documents.map(item => (
            <li key={item.id} className="flex flex-wrap items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => setViewer({ key: Date.now(), title: item.fileName, load: () => fetchTravelDocument(request.id, item.id) })}
                className="inline-flex min-w-0 items-center gap-1 font-bold text-blue-800 underline decoration-dotted underline-offset-2"
                title={`Open ${item.fileName}`}
              >
                <Paperclip className="h-3 w-3 shrink-0" />
                <span className="truncate">{TRAVEL_DOCUMENTS[item.kind]?.label || 'File'}: {item.fileName}</span>
              </button>
              <span className="font-semibold text-slate-500">by {item.uploadedBy || 'an employee'}{shortDate(item.uploadedAt) ? `, ${shortDate(item.uploadedAt)}` : ''}</span>
              {canUpload && sameId(item.uploadedByEmployeeId, user?.employeeId) && (
                <button type="button" onClick={() => remove(item)} disabled={busy} className="inline-flex items-center gap-0.5 font-bold text-rose-700 disabled:opacity-50" title="Remove this file">
                  <Trash2 className="h-3 w-3" />Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canUpload && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-3 text-[11px] font-bold text-slate-700">
            {Object.entries(TRAVEL_DOCUMENTS).map(([value, item]) => (
              <label key={value} className="inline-flex items-center gap-1.5">
                <input type="radio" name={`travel-document-kind-${request.id}`} checked={kind === value} onChange={() => { setKind(value); setError(''); }} className="h-3.5 w-3.5 accent-blue-700" />
                {item.label}
              </label>
            ))}
          </div>
          <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={upload} className="hidden" />
          <button type="button" onClick={chooseFile} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-[11px] font-black text-white hover:bg-blue-800 disabled:opacity-50">
            <Upload className="h-3.5 w-3.5" />{busy ? 'Attaching…' : 'Attach File'}
          </button>
          <p className="text-[10px] font-semibold text-slate-500">A PDF, JPG, or PNG of 3 MB at most. HR is notified.</p>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-[11px] font-bold text-rose-700">{error}</p>}

      {viewer && (
        <div onClick={event => event.stopPropagation()}>
          <DocumentViewer key={viewer.key} title={viewer.title} load={viewer.load} onClose={() => setViewer(null)} />
        </div>
      )}
    </section>
  );
}
