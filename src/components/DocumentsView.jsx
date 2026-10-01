/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState } from 'react';
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  Clock,
  Download,
  Eye,
  FileArchive,
  FileBadge,
  FileText,
  FolderOpen,
  GraduationCap,
  Paperclip,
  Plane,
  Send,
  Trash2,
  Upload
} from 'lucide-react';
import { CERTIFICATE_TYPES, DOCUMENT_CATEGORIES } from '../../shared/documentCatalog';
import { getManilaDateString } from '../../shared/localDate';
import cscForm6Template from '../assets/template/csc-form-6-template.pdf';
import dtrTemplate from '../assets/template/dtr-template.pdf';
import { dtrFilename, fillDTR } from '../utils/dtrForm';
import { dataUrlToFile, documentFileProblem, downloadBytes, formatFileSize, loadDocumentFile, readFileAsDataUrl } from '../utils/documentFiles';
import CSCForm6Preview from './CSCForm6Preview';
import TravelOrderPreview from './TravelOrderPreview';
import DocumentViewer from './DocumentViewer';

const categories = [
  { id: 'leave', title: 'My Leave Applications', description: 'CSC Form 6 for each leave you filed, with the documents you attached.', icon: CalendarDays, color: 'bg-rose-50 text-rose-700' },
  { id: 'travel', title: 'My Travel Orders', description: 'The travel order for each travel request you filed.', icon: Plane, color: 'bg-amber-50 text-amber-700' },
  { id: 'dtr', title: 'My Daily Time Records', description: 'CSC Form 48 for each month you have attendance.', icon: Clock, color: 'bg-blue-50 text-blue-700' },
  { id: '201', title: '201 File', description: 'PDS, appointment, oath of office, NOSA/NOSI, service record, and SALN filed by HR.', icon: BriefcaseBusiness, color: 'bg-indigo-50 text-indigo-700' },
  { id: 'performance', title: 'Performance and Trainings', description: 'Your IPCR ratings and training certificates.', icon: GraduationCap, color: 'bg-emerald-50 text-emerald-700' },
  { id: 'certificates', title: 'Certificates and Forms', description: 'Request a COE, certified service record, or leave credits statement, and get blank forms.', icon: FileBadge, color: 'bg-violet-50 text-violet-700' }
];

// Requests the employee never sent or took back have no document.
const CLOSED_STATUSES = ['Draft', 'Cancelled', 'Withdrawn'];

const statusTone = status => ({
  Approved: 'bg-emerald-100 text-emerald-700',
  Released: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-rose-100 text-rose-700',
  Declined: 'bg-rose-100 text-rose-700',
  Returned: 'bg-orange-100 text-orange-700'
}[status] || 'bg-amber-100 text-amber-700');
const statusLabel = status => (status === 'Requested' ? 'Waiting for HR' : status);

const formatDate = value => {
  if (!value) return '';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const formatMonth = month => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// The date a list item is filed under, for the year filter.
const itemDate = (categoryId, item) => {
  if (categoryId === 'leave' || categoryId === 'travel') return item.startDate || item.submissionDate;
  if (categoryId === 'dtr') return item.month;
  return item.documentDate || item.createdAt;
};

const ActionButton = ({ icon: Icon, children, onClick, disabled, tone = 'default', type = 'button' }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition disabled:cursor-wait disabled:opacity-60 ${
      tone === 'primary' ? 'bg-[#1e40af] text-white hover:bg-blue-800'
        : tone === 'danger' ? 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50'
          : 'border border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700'
    }`}
  >
    <Icon className="h-3.5 w-3.5" />
    {children}
  </button>
);

const Row = ({ icon: Icon, title, meta, status, children }) => (
  <li className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 break-words text-xs font-extrabold text-slate-900">{title}</p>
          {status && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${statusTone(status)}`}>{statusLabel(status)}</span>}
        </div>
        {meta && <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{meta}</p>}
        {children && <div className="mt-2 flex flex-wrap gap-2">{children}</div>}
      </div>
    </div>
  </li>
);

const Empty = ({ children }) => (
  <p className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center text-xs font-semibold text-slate-500">{children}</p>
);

const Notice = ({ message }) => (message?.text
  ? <p className={`rounded-lg px-3 py-2 text-xs font-bold ${message.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{message.text}</p>
  : null);

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold text-slate-800 focus:border-[#1e40af] focus:outline-none focus:ring-2 focus:ring-blue-500/10';

function TrainingUploadForm({ onUpload }) {
  const [docType, setDocType] = useState(DOCUMENT_CATEGORIES.training.types[0]);
  const [title, setTitle] = useState('');
  const [documentDate, setDocumentDate] = useState('');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const submit = async event => {
    event.preventDefault();
    const problem = !title.trim() ? 'Enter the name of the training.' : documentFileProblem(file);
    if (problem) {
      setMessage({ error: true, text: problem });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await onUpload({ category: 'training', docType, title: title.trim(), documentDate, file: { name: file.name, dataUrl: await readFileAsDataUrl(file) } });
      setTitle('');
      setDocumentDate('');
      setFile(null);
      event.target.reset();
      setMessage({ text: 'Certificate added.' });
    } catch (error) {
      setMessage({ error: true, text: error.message || 'Unable to add the certificate.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-extrabold text-slate-900">Add a training certificate</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-[10px] font-black uppercase text-slate-500">Type
          <select value={docType} onChange={event => setDocType(event.target.value)} className={inputClass}>
            {DOCUMENT_CATEGORIES.training.types.map(type => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-[10px] font-black uppercase text-slate-500">Date completed
          <input type="date" value={documentDate} max={getManilaDateString()} onChange={event => setDocumentDate(event.target.value)} className={inputClass} />
        </label>
      </div>
      <label className="block space-y-1 text-[10px] font-black uppercase text-slate-500">Training name
        <input type="text" value={title} maxLength={120} onChange={event => setTitle(event.target.value)} placeholder="e.g. Data Privacy Act Orientation" className={inputClass} />
      </label>
      <label className="block space-y-1 text-[10px] font-black uppercase text-slate-500">Certificate (PDF, JPEG, or PNG, up to 3 MB)
        <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={event => setFile(event.target.files?.[0] || null)} className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-blue-700" />
      </label>
      <Notice message={message} />
      <ActionButton icon={Upload} tone="primary" disabled={saving} type="submit">{saving ? 'Uploading...' : 'Upload certificate'}</ActionButton>
    </form>
  );
}

function CertificateRequestForm({ onRequest }) {
  const [docType, setDocType] = useState(CERTIFICATE_TYPES[0]);
  const [purpose, setPurpose] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const submit = async event => {
    event.preventDefault();
    if (!purpose.trim()) {
      setMessage({ error: true, text: 'Say what the certificate is for (for example, a loan or a scholarship).' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await onRequest({ docType, purpose: purpose.trim() });
      setPurpose('');
      setMessage({ text: 'Request sent. HR will upload the signed certificate here.' });
    } catch (error) {
      setMessage({ error: true, text: error.message || 'Unable to send the request.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-extrabold text-slate-900">Request a certificate</p>
      <label className="block space-y-1 text-[10px] font-black uppercase text-slate-500">Certificate
        <select value={docType} onChange={event => setDocType(event.target.value)} className={inputClass}>
          {CERTIFICATE_TYPES.map(type => <option key={type}>{type}</option>)}
        </select>
      </label>
      <label className="block space-y-1 text-[10px] font-black uppercase text-slate-500">Purpose
        <textarea value={purpose} maxLength={500} rows={2} onChange={event => setPurpose(event.target.value)} placeholder="e.g. Pag-IBIG housing loan application" className={inputClass} />
      </label>
      <Notice message={message} />
      <ActionButton icon={Send} tone="primary" disabled={saving} type="submit">{saving ? 'Sending...' : 'Send request'}</ActionButton>
    </form>
  );
}

export default function DocumentsView({ user, requests = [], attendanceHistory = [], documents = [], onUploadDocument, onRequestCertificate, onDeleteDocument }) {
  const [openCategory, setOpenCategory] = useState(null);
  const [year, setYear] = useState('all');
  const [viewer, setViewer] = useState(null); // { key, title, load }
  const [formPreview, setFormPreview] = useState(null); // a leave or travel request
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);

  const leaveItems = requests.filter(request => request.type === 'Leave Request' && !CLOSED_STATUSES.includes(request.status));
  const travelItems = requests.filter(request => request.type === 'Travel Order' && !CLOSED_STATUSES.includes(request.status));
  const daysByMonth = attendanceHistory.reduce((months, record) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(record.date || '')) {
      const month = record.date.slice(0, 7);
      months[month] = (months[month] || new Set()).add(record.date);
    }
    return months;
  }, {});
  const dtrMonths = Object.keys(daysByMonth).sort().reverse().map(month => ({ month, days: daysByMonth[month].size }));
  const files201 = documents.filter(doc => doc.category === '201');
  const performanceDocs = documents.filter(doc => doc.category === 'performance' || doc.category === 'training');
  const certificateDocs = documents.filter(doc => doc.category === 'certificate');

  const itemsByCategory = { leave: leaveItems, travel: travelItems, dtr: dtrMonths, '201': files201, performance: performanceDocs, certificates: certificateDocs };
  const cardNote = id => {
    if (id === 'certificates') {
      const ready = certificateDocs.filter(doc => doc.status === 'Released').length;
      const waiting = certificateDocs.filter(doc => doc.status === 'Requested').length;
      const parts = [ready && `${ready} ready`, waiting && `${waiting} waiting for HR`].filter(Boolean);
      return parts.length ? parts.join(' · ') : 'Request a certificate';
    }
    const count = itemsByCategory[id].length;
    if (id === 'dtr') return count ? plural(count, 'month') : 'No attendance yet';
    return count ? plural(count, 'document') : 'No documents yet';
  };

  const openList = id => {
    setOpenCategory(id);
    setYear('all');
    setMessage(null);
  };

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

  const makeDtr = async (month, records = attendanceHistory) => {
    const [dtrYear, dtrMonth] = month.split('-').map(Number);
    const response = await fetch(dtrTemplate);
    const bytes = await fillDTR(await response.arrayBuffer(), user || {}, dtrYear, dtrMonth, records);
    return { fileName: dtrFilename(user?.name, dtrYear, dtrMonth), fileType: 'application/pdf', bytes };
  };
  const view = (title, load) => setViewer({ key: Date.now(), title, load });
  const download = (key, load) => run(key, async () => {
    const file = await load();
    downloadBytes(file.bytes, file.fileName, file.fileType);
  });
  const remove = (doc, question) => {
    if (!window.confirm(question)) return;
    run(`delete-${doc.id}`, async () => {
      await onDeleteDocument(doc.id);
      setMessage({ text: doc.status === 'Requested' ? 'Request cancelled.' : 'Document removed.' });
    });
  };

  const storedDocumentActions = doc => (doc.hasFile ? (
    <>
      <ActionButton icon={Eye} onClick={() => view(doc.title, () => loadDocumentFile(doc.id))}>View</ActionButton>
      <ActionButton icon={Download} disabled={busy === `download-${doc.id}`} onClick={() => download(`download-${doc.id}`, () => loadDocumentFile(doc.id))}>Download</ActionButton>
    </>
  ) : null);
  const storedDocumentMeta = doc => [
    doc.docType !== doc.title && doc.docType,
    doc.documentDate && formatDate(doc.documentDate),
    doc.uploadedByRole === 'employee' ? 'Added by you' : doc.uploadedBy && `Filed by ${doc.uploadedBy}`,
    formatFileSize(doc.fileSize)
  ].filter(Boolean).join(' · ');

  const category = categories.find(item => item.id === openCategory);
  const items = category ? itemsByCategory[category.id] : [];
  const years = [...new Set(items.map(item => String(itemDate(category.id, item) || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const shown = year === 'all' ? items : items.filter(item => String(itemDate(category.id, item) || '').startsWith(year));
  const thisMonth = getManilaDateString().slice(0, 7);

  return (
    <div className="h-full min-h-0 w-full overflow-y-auto bg-slate-50 p-4 pb-24 font-sans sm:p-5 sm:pb-5 lg:p-6">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1e40af] text-white shadow-sm">
          <FileArchive className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-extrabold text-slate-900">Documents</h1>
      </div>

      {!category && (
        <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {categories.map(({ id, title, description, icon: Icon, color }) => (
            <button
              key={id}
              type="button"
              onClick={() => openList(id)}
              className="group rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <FolderOpen className="h-3.5 w-3.5 text-slate-300 transition group-hover:text-blue-500" />
              </div>
              <h2 className="mt-2 text-xs font-extrabold text-slate-900">{title}</h2>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">{description}</p>
              <p className="mt-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">{cardNote(id)}</p>
            </button>
          ))}
        </div>
      )}

      {category && (
        <div className="w-full max-w-3xl space-y-3">
          <button type="button" onClick={() => setOpenCategory(null)} className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:text-blue-900">
            <ArrowLeft className="h-4 w-4" /> All documents
          </button>
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex min-w-0 items-start gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${category.color}`}>
                <category.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-extrabold text-slate-900">{category.title}</h2>
                <p className="text-xs text-slate-500">{category.description}</p>
              </div>
            </div>
            {years.length > 1 && (
              <select value={year} onChange={event => setYear(event.target.value)} aria-label="Filter by year" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-700">
                <option value="all">All years</option>
                {years.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            )}
          </div>
          <Notice message={message} />

          {category.id === 'leave' && (shown.length ? (
            <ul className="space-y-2">
              {shown.map(request => (
                <Row
                  key={request.id}
                  icon={CalendarDays}
                  title={request.leaveType || 'Leave application'}
                  status={request.status}
                  meta={[`${formatDate(request.startDate)}${request.endDate && request.endDate !== request.startDate ? ` – ${formatDate(request.endDate)}` : ''}`, request.workingDays && plural(Number(request.workingDays), 'working day'), `Filed ${formatDate(request.submissionDate)}`].filter(Boolean).join(' · ')}
                >
                  <ActionButton icon={FileText} tone="primary" onClick={() => setFormPreview(request)}>CSC Form 6</ActionButton>
                  {(request.attachments || []).filter(file => file?.dataUrl).map(file => (
                    <ActionButton key={file.id || file.name} icon={Paperclip} onClick={() => view(file.name, () => {
                      const { type, bytes } = dataUrlToFile(file.dataUrl);
                      return { fileName: file.name, fileType: type, bytes };
                    })}>{file.type ? `${file.type}: ` : ''}{file.name}</ActionButton>
                  ))}
                </Row>
              ))}
            </ul>
          ) : <Empty>Leave applications you file in Requests appear here.</Empty>)}

          {category.id === 'travel' && (shown.length ? (
            <ul className="space-y-2">
              {shown.map(request => (
                <Row
                  key={request.id}
                  icon={Plane}
                  title={request.travelActivity || request.purpose || 'Travel order'}
                  status={request.status}
                  meta={[`${formatDate(request.startDate)}${request.endDate && request.endDate !== request.startDate ? ` – ${formatDate(request.endDate)}` : ''}`, request.travelVenue, `Filed ${formatDate(request.submissionDate)}`].filter(Boolean).join(' · ')}
                >
                  <ActionButton icon={FileText} tone="primary" onClick={() => setFormPreview(request)}>Travel Order</ActionButton>
                </Row>
              ))}
            </ul>
          ) : <Empty>Travel requests you file in Requests appear here.</Empty>)}

          {category.id === 'dtr' && (shown.length ? (
            <ul className="space-y-2">
              {shown.map(({ month, days }) => (
                <Row key={month} icon={Clock} title={`Daily Time Record – ${formatMonth(month)}`} meta={`${plural(days, 'day')} with attendance${month === thisMonth ? ' · This month so far' : ''}`}>
                  <ActionButton icon={Eye} onClick={() => view(`Daily Time Record – ${formatMonth(month)}`, () => makeDtr(month))}>View</ActionButton>
                  <ActionButton icon={Download} disabled={busy === `dtr-${month}`} onClick={() => download(`dtr-${month}`, () => makeDtr(month))}>{busy === `dtr-${month}` ? 'Preparing...' : 'Download'}</ActionButton>
                </Row>
              ))}
            </ul>
          ) : <Empty>Your DTR appears here once you have Time In records.</Empty>)}

          {category.id === '201' && (
            <>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm sm:grid-cols-3">
                {[
                  ['Position', user?.role],
                  ['Office', user?.office],
                  ['Employee ID', user?.employeeId],
                  ['Employment Status', user?.employmentStatus],
                  ['Date Hired', formatDate(user?.dateHired)],
                  ['Assigned Station', user?.assignedStation]
                ].map(([label, value]) => (
                  <div key={label} className="bg-white p-3">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                    <p className="mt-0.5 break-words text-xs font-bold text-slate-800">{value || 'Not recorded'}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] font-semibold text-slate-500">HR keeps your 201 File. To add or correct a document, contact HR.</p>
              {shown.length ? (
                <ul className="space-y-2">
                  {shown.map(doc => (
                    <Row key={doc.id} icon={BriefcaseBusiness} title={doc.title} meta={storedDocumentMeta(doc)}>
                      {storedDocumentActions(doc)}
                    </Row>
                  ))}
                </ul>
              ) : <Empty>HR has not filed any 201 documents for you yet.</Empty>}
            </>
          )}

          {category.id === 'performance' && (
            <>
              <TrainingUploadForm onUpload={onUploadDocument} />
              {shown.length ? (
                <ul className="space-y-2">
                  {shown.map(doc => (
                    <Row key={doc.id} icon={doc.category === 'performance' ? FileBadge : GraduationCap} title={doc.title} meta={storedDocumentMeta(doc)}>
                      {storedDocumentActions(doc)}
                      {doc.uploadedByRole === 'employee' && (
                        <ActionButton icon={Trash2} tone="danger" disabled={busy === `delete-${doc.id}`} onClick={() => remove(doc, `Remove "${doc.title}"?`)}>Remove</ActionButton>
                      )}
                    </Row>
                  ))}
                </ul>
              ) : <Empty>No IPCR ratings or training certificates yet.</Empty>}
            </>
          )}

          {category.id === 'certificates' && (
            <>
              <CertificateRequestForm onRequest={onRequestCertificate} />
              {shown.length ? (
                <ul className="space-y-2">
                  {shown.map(doc => (
                    <Row
                      key={doc.id}
                      icon={FileBadge}
                      title={doc.docType}
                      status={doc.status}
                      meta={[`Requested ${formatDate(doc.createdAt)}`, doc.purpose && `For: ${doc.purpose}`, doc.status === 'Released' && doc.answeredBy && `Released by ${doc.answeredBy}`].filter(Boolean).join(' · ')}
                    >
                      {doc.status === 'Released' && storedDocumentActions(doc)}
                      {doc.status === 'Requested' && (
                        <ActionButton icon={Trash2} tone="danger" disabled={busy === `delete-${doc.id}`} onClick={() => remove(doc, `Cancel your ${doc.docType} request?`)}>Cancel request</ActionButton>
                      )}
                      {doc.status === 'Declined' && <p className="w-full rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700">HR: {doc.declineReason}</p>}
                      {doc.notes && doc.status === 'Released' && <p className="w-full text-[11px] text-slate-500">HR: {doc.notes}</p>}
                    </Row>
                  ))}
                </ul>
              ) : <Empty>Certificates you request appear here, and HR uploads the signed copy when it is ready.</Empty>}

              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-xs font-extrabold text-slate-900">Blank forms</p>
                <ul className="mt-2 space-y-2">
                  <li className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-600">CSC Form No. 6 – Application for Leave</span>
                    <a href={cscForm6Template} download="CSC_Form_6_Application_for_Leave.pdf" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:border-blue-200 hover:text-blue-700"><Download className="h-3.5 w-3.5" />Download</a>
                  </li>
                  <li className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-600">CSC Form No. 48 – Daily Time Record for {formatMonth(thisMonth)} (with your name, no time entries)</span>
                    <ActionButton icon={Download} disabled={busy === 'blank-dtr'} onClick={() => download('blank-dtr', () => makeDtr(thisMonth, []))}>{busy === 'blank-dtr' ? 'Preparing...' : 'Download'}</ActionButton>
                  </li>
                </ul>
              </div>
            </>
          )}
        </div>
      )}

      {viewer && <DocumentViewer key={viewer.key} title={viewer.title} load={viewer.load} onClose={() => setViewer(null)} />}
      {formPreview?.type === 'Leave Request' && <CSCForm6Preview request={formPreview} user={user} onClose={() => setFormPreview(null)} />}
      {formPreview?.type === 'Travel Order' && <TravelOrderPreview request={formPreview} user={user} onClose={() => setFormPreview(null)} />}
    </div>
  );
}
