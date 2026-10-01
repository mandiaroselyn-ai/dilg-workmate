import React, { useState } from 'react';
import {
  BriefcaseBusiness,
  CheckCircle2,
  Download,
  Eye,
  FileBadge,
  FolderOpen,
  GraduationCap,
  Search,
  Trash2,
  Upload,
  XCircle
} from 'lucide-react';
import { DOCUMENT_CATEGORIES, HR_UPLOAD_CATEGORIES } from '../../shared/documentCatalog';
import { getManilaDateString } from '../../shared/localDate';
import { documentFileProblem, downloadBytes, formatFileSize, loadDocumentFile, readFileAsDataUrl } from '../utils/documentFiles';
import DocumentViewer from './DocumentViewer';

// Documents are filed under the employee's ID or email, like the server matches them.
const belongsTo = (doc, employee) => Boolean(
  (employee?.employeeId && doc.employeeId === employee.employeeId)
  || (employee?.email && doc.employeeEmail === employee.email.toLowerCase())
);

const formatDate = value => {
  if (!value) return '';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const FILE_GROUPS = [
  { id: '201', title: '201 File', icon: BriefcaseBusiness },
  { id: 'performance', title: 'Performance Ratings', icon: FileBadge },
  { id: 'training', title: 'Training Certificates', icon: GraduationCap },
  { id: 'certificate', title: 'Released Certificates', icon: FileBadge }
];

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block space-y-1 text-[10px] font-black uppercase text-slate-500';
const buttonClass = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-wait disabled:opacity-60';
const primaryButtonClass = 'inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-2 text-[11px] font-black text-white transition hover:bg-indigo-800 disabled:cursor-wait disabled:opacity-60';

const Notice = ({ message }) => (message?.text
  ? <p className={`rounded-lg px-3 py-2 text-xs font-bold ${message.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{message.text}</p>
  : null);

const FileInput = ({ onChange }) => (
  <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={event => onChange(event.target.files?.[0] || null)} className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-indigo-700" />
);

function CertificateRequestCard({ doc, onAnswer, onView }) {
  const [mode, setMode] = useState(null); // 'release' or 'decline'
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const submit = async event => {
    event.preventDefault();
    const problem = mode === 'release' ? documentFileProblem(file) : !reason.trim() && 'Give the reason for declining, so the employee knows what to do next.';
    if (problem) {
      setMessage({ error: true, text: problem });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await onAnswer(doc.id, mode === 'release'
        ? { action: 'release', notes: notes.trim(), file: { name: file.name, dataUrl: await readFileAsDataUrl(file) } }
        : { action: 'decline', reason: reason.trim() });
    } catch (error) {
      setMessage({ error: true, text: error.message || 'Unable to save. Please try again.' });
      setSaving(false);
    }
  };

  const answered = doc.status !== 'Requested';
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-900">{doc.docType}</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-600">{doc.employeeName || 'Employee'}{doc.employeeId ? ` · ${doc.employeeId}` : ''}</p>
          <p className="mt-1 text-xs text-slate-500">Purpose: {doc.purpose || 'Not given'} · Requested {formatDate(doc.createdAt)}</p>
          {answered && (
            <p className="mt-1 text-xs text-slate-500">
              {doc.status === 'Released' ? 'Released' : 'Declined'} by {doc.answeredBy || 'HR'} on {formatDate(doc.answeredAt)}
              {doc.status === 'Declined' && doc.declineReason ? `: ${doc.declineReason}` : ''}
            </p>
          )}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${doc.status === 'Released' ? 'bg-emerald-100 text-emerald-700' : doc.status === 'Declined' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
          {doc.status === 'Requested' ? 'Waiting' : doc.status}
        </span>
      </div>

      {doc.status === 'Released' && doc.hasFile && (
        <button type="button" onClick={() => onView(doc)} className={`${buttonClass} mt-3`}><Eye className="h-3.5 w-3.5" />View released copy</button>
      )}

      {!answered && !mode && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode('release')} className={primaryButtonClass}><CheckCircle2 className="h-3.5 w-3.5" />Release signed copy</button>
          <button type="button" onClick={() => setMode('decline')} className={buttonClass}><XCircle className="h-3.5 w-3.5" />Decline</button>
        </div>
      )}

      {!answered && mode && (
        <form onSubmit={submit} className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          {mode === 'release' ? (
            <>
              <label className={labelClass}>Signed certificate (PDF, JPEG, or PNG, up to 3 MB)<FileInput onChange={setFile} /></label>
              <label className={labelClass}>Note to the employee (optional)
                <input type="text" value={notes} maxLength={500} onChange={event => setNotes(event.target.value)} placeholder="e.g. The original is ready for pickup at the HR office." className={inputClass} />
              </label>
            </>
          ) : (
            <label className={labelClass}>Reason for declining
              <textarea value={reason} maxLength={500} rows={2} onChange={event => setReason(event.target.value)} className={inputClass} />
            </label>
          )}
          <Notice message={message} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className={primaryButtonClass}>{saving ? 'Saving...' : mode === 'release' ? 'Release to employee' : 'Decline request'}</button>
            <button type="button" disabled={saving} onClick={() => { setMode(null); setMessage(null); }} className={buttonClass}>Cancel</button>
          </div>
        </form>
      )}
    </li>
  );
}

function UploadForm({ employee, onUpload }) {
  const [category, setCategory] = useState('201');
  const [docType, setDocType] = useState(DOCUMENT_CATEGORIES['201'].types[0]);
  const [title, setTitle] = useState('');
  const [documentDate, setDocumentDate] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [formKey, setFormKey] = useState(0);

  const changeCategory = value => {
    setCategory(value);
    setDocType(DOCUMENT_CATEGORIES[value].types[0]);
  };

  const submit = async event => {
    event.preventDefault();
    const problem = documentFileProblem(file);
    if (problem) {
      setMessage({ error: true, text: problem });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const saved = await onUpload({
        employeeId: employee.employeeId,
        category,
        docType,
        title: title.trim(),
        documentDate,
        notes: notes.trim(),
        file: { name: file.name, dataUrl: await readFileAsDataUrl(file) }
      });
      setTitle('');
      setDocumentDate('');
      setNotes('');
      setFile(null);
      setFormKey(key => key + 1);
      setMessage({ text: `"${saved.title}" was filed. ${employee.name || 'The employee'} was notified.` });
    } catch (error) {
      setMessage({ error: true, text: error.message || 'Unable to upload the document.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form key={formKey} onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-black text-slate-900">File a document for {employee.name || 'this employee'}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className={labelClass}>Category
          <select value={category} onChange={event => changeCategory(event.target.value)} className={inputClass}>
            {HR_UPLOAD_CATEGORIES.map(id => <option key={id} value={id}>{DOCUMENT_CATEGORIES[id].label}</option>)}
          </select>
        </label>
        <label className={labelClass}>Document type
          <select value={docType} onChange={event => setDocType(event.target.value)} className={inputClass}>
            {DOCUMENT_CATEGORIES[category].types.map(type => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label className={labelClass}>Title (optional)
          <input type="text" value={title} maxLength={120} onChange={event => setTitle(event.target.value)} placeholder={category === 'performance' ? 'e.g. IPCR January–June 2026' : `e.g. ${docType}`} className={inputClass} />
        </label>
        <label className={labelClass}>Date of the document
          <input type="date" value={documentDate} max={getManilaDateString()} onChange={event => setDocumentDate(event.target.value)} className={inputClass} />
        </label>
      </div>
      <label className={labelClass}>Notes (optional)
        <input type="text" value={notes} maxLength={500} onChange={event => setNotes(event.target.value)} className={inputClass} />
      </label>
      <label className={labelClass}>File (PDF, JPEG, or PNG, up to 3 MB)<FileInput onChange={setFile} /></label>
      <Notice message={message} />
      <button type="submit" disabled={saving} className={primaryButtonClass}><Upload className="h-3.5 w-3.5" />{saving ? 'Uploading...' : 'Upload and notify employee'}</button>
    </form>
  );
}

export default function HRAdminDocumentsView({ employees = [], documents = [], onUploadDocument, onAnswerCertificate, onDeleteDocument }) {
  const [activeTab, setActiveTab] = useState('requests');
  const [requestFilter, setRequestFilter] = useState('waiting');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [viewer, setViewer] = useState(null); // { key, title, load }
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);

  const certificateRequests = documents.filter(doc => doc.category === 'certificate');
  const waiting = certificateRequests.filter(doc => doc.status === 'Requested');
  const shownRequests = requestFilter === 'waiting' ? waiting : certificateRequests.filter(doc => doc.status !== 'Requested');

  const query = search.trim().toLowerCase();
  const employeeList = employees.filter(employee => !query
    || [employee.name, employee.employeeId, employee.email, employee.office].some(value => String(value || '').toLowerCase().includes(query)));
  const selected = employees.find(employee => (employee.employeeId || employee.email) === selectedId);
  const selectedDocs = selected ? documents.filter(doc => belongsTo(doc, selected)) : [];

  const view = doc => setViewer({ key: Date.now(), title: `${doc.title} – ${doc.employeeName || 'Employee'}`, load: () => loadDocumentFile(doc.id) });
  const run = async (key, action) => {
    setBusy(key);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage({ error: true, text: error.message || 'Something went wrong. Please try again.' });
    } finally {
      setBusy('');
    }
  };
  const download = doc => run(`download-${doc.id}`, async () => {
    const file = await loadDocumentFile(doc.id);
    downloadBytes(file.bytes, file.fileName, file.fileType);
  });
  const remove = doc => {
    if (!window.confirm(`Remove "${doc.title}" from ${doc.employeeName || 'this employee'}'s records? This cannot be undone.`)) return;
    run(`delete-${doc.id}`, async () => {
      await onDeleteDocument(doc.id);
      setMessage({ text: `"${doc.title}" was removed.` });
    });
  };

  const tabs = [
    { id: 'requests', label: `Certificate Requests${waiting.length ? ` (${waiting.length})` : ''}` },
    { id: 'files', label: 'Employee Files' }
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4">
        <p className="text-sm text-slate-500">
          File employees' 201, performance, and training documents, and release the certificates they request. Employees see their own documents in their Documents page.
        </p>
        <div className="flex flex-wrap gap-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => { setActiveTab(tab.id); setMessage(null); }}
              className={`rounded-xl border px-3 py-2 text-[11px] font-black transition ${activeTab === tab.id ? 'border-indigo-700 bg-indigo-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <Notice message={message} />

      {activeTab === 'requests' && (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {[['waiting', `Waiting (${waiting.length})`], ['answered', 'Answered']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setRequestFilter(id)} className={`rounded-full px-3 py-1 text-[11px] font-black ${requestFilter === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{label}</button>
            ))}
          </div>
          {shownRequests.length ? (
            <ul className="grid gap-3 xl:grid-cols-2">
              {shownRequests.map(doc => (
                <CertificateRequestCard key={doc.id} doc={doc} onAnswer={onAnswerCertificate} onView={view} />
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm font-semibold text-slate-500">
              {requestFilter === 'waiting' ? 'No certificate requests are waiting.' : 'No answered requests yet.'}
            </p>
          )}
        </section>
      )}

      {activeTab === 'files' && (
        <section className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or employee ID..." className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </div>
            <ul className="max-h-[60vh] space-y-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              {employeeList.map(employee => {
                const key = employee.employeeId || employee.email;
                const count = documents.filter(doc => doc.category !== 'certificate' && belongsTo(doc, employee)).length;
                const inactive = (employee.accountStatus || 'Active').toLowerCase() !== 'active';
                return (
                  <li key={key}>
                    <button type="button" onClick={() => { setSelectedId(key); setMessage(null); }} className={`w-full rounded-xl px-3 py-2 text-left transition ${selectedId === key ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50'}`}>
                      <span className="block truncate text-xs font-black text-slate-900">{employee.name || employee.email}</span>
                      <span className="block truncate text-[10px] font-semibold text-slate-500">{employee.employeeId || 'No employee ID'} · {count ? `${count} document${count === 1 ? '' : 's'}` : 'No documents'}{inactive ? ` · ${employee.accountStatus}` : ''}</span>
                    </button>
                  </li>
                );
              })}
              {!employeeList.length && <li className="p-3 text-center text-xs font-semibold text-slate-500">No employees match.</li>}
            </ul>
          </div>

          <div className="min-w-0 space-y-4">
            {!selected && (
              <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
                <FolderOpen className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-semibold text-slate-500">Choose an employee to see and file their documents.</p>
              </div>
            )}
            {selected && (
              <>
                {selected.employeeId
                  ? <UploadForm key={selectedId} employee={selected} onUpload={onUploadDocument} />
                  : <p className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">Give this employee an employee ID in Employees before filing documents for them.</p>}
                {FILE_GROUPS.map(group => {
                  const groupDocs = selectedDocs.filter(doc => doc.category === group.id && (group.id !== 'certificate' || doc.status === 'Released'));
                  return (
                    <div key={group.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-600"><group.icon className="h-4 w-4 text-indigo-600" />{group.title} ({groupDocs.length})</h3>
                      {groupDocs.length ? (
                        <ul className="mt-3 divide-y divide-slate-100">
                          {groupDocs.map(doc => (
                            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-bold text-slate-900">{doc.title}</p>
                                <p className="text-[11px] text-slate-500">
                                  {[doc.docType !== doc.title && doc.docType, doc.documentDate && formatDate(doc.documentDate), doc.uploadedByRole === 'employee' ? 'Added by the employee' : doc.uploadedBy && `Filed by ${doc.uploadedBy}`, formatFileSize(doc.fileSize)].filter(Boolean).join(' · ')}
                                </p>
                                {doc.notes && <p className="text-[11px] text-slate-500">Note: {doc.notes}</p>}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {doc.hasFile && <button type="button" onClick={() => view(doc)} className={buttonClass}><Eye className="h-3.5 w-3.5" />View</button>}
                                {doc.hasFile && <button type="button" disabled={busy === `download-${doc.id}`} onClick={() => download(doc)} className={buttonClass}><Download className="h-3.5 w-3.5" />Download</button>}
                                <button type="button" disabled={busy === `delete-${doc.id}`} onClick={() => remove(doc)} className={`${buttonClass} text-rose-700 hover:border-rose-300 hover:text-rose-800`}><Trash2 className="h-3.5 w-3.5" />Remove</button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="mt-2 text-xs text-slate-400">None yet.</p>}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </section>
      )}

      {viewer && <DocumentViewer key={viewer.key} title={viewer.title} load={viewer.load} onClose={() => setViewer(null)} />}
    </div>
  );
}
