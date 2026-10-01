/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Download,
  Eye,
  FileArchive,
  FileText,
  FolderOpen,
  Paperclip,
  Plane
} from 'lucide-react';
import { getManilaDateString } from '../../shared/localDate';
import dtrTemplate from '../assets/template/dtr-template.pdf';
import { dtrFilename, fillDTR } from '../utils/dtrForm';
import { dataUrlToFile, downloadBytes } from '../utils/documentFiles';
import CSCForm6Preview from './CSCForm6Preview';
import TravelOrderPreview from './TravelOrderPreview';
import DocumentViewer from './DocumentViewer';

// Only documents the system makes from the employee's own requests and attendance.
const categories = [
  { id: 'leave', title: 'My Leave Applications', description: 'CSC Form 6 for each leave you filed, with the documents you attached.', icon: CalendarDays, color: 'bg-rose-50 text-rose-700' },
  { id: 'travel', title: 'My Travel Orders', description: 'The travel order for each travel request you filed.', icon: Plane, color: 'bg-amber-50 text-amber-700' },
  { id: 'dtr', title: 'My Daily Time Records', description: 'CSC Form 48 for each month you have attendance.', icon: Clock, color: 'bg-blue-50 text-blue-700' }
];

// Requests the employee never sent or took back have no document.
const CLOSED_STATUSES = ['Draft', 'Cancelled', 'Withdrawn'];

const statusTone = status => ({
  Approved: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-rose-100 text-rose-700',
  Returned: 'bg-orange-100 text-orange-700'
}[status] || 'bg-amber-100 text-amber-700');

const formatDate = value => {
  if (!value) return '';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const formatMonth = month => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const dateRange = request => `${formatDate(request.startDate)}${request.endDate && request.endDate !== request.startDate ? ` – ${formatDate(request.endDate)}` : ''}`;

// The date a list item is filed under, for the year filter.
const itemDate = (categoryId, item) => (categoryId === 'dtr' ? item.month : item.startDate || item.submissionDate);

const ActionButton = ({ icon: Icon, children, onClick, disabled, primary = false }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition disabled:cursor-wait disabled:opacity-60 ${
      primary ? 'bg-[#1e40af] text-white hover:bg-blue-800' : 'border border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700'
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
          {status && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${statusTone(status)}`}>{status}</span>}
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

export default function DocumentsView({ user, requests = [], attendanceHistory = [] }) {
  const [openCategory, setOpenCategory] = useState(null);
  const [year, setYear] = useState('all');
  const [viewer, setViewer] = useState(null); // { key, title, load }
  const [formPreview, setFormPreview] = useState(null); // a leave or travel request
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

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

  const itemsByCategory = { leave: leaveItems, travel: travelItems, dtr: dtrMonths };
  const cardNote = id => {
    const count = itemsByCategory[id].length;
    if (id === 'dtr') return count ? plural(count, 'month') : 'No attendance yet';
    return count ? plural(count, 'document') : 'No documents yet';
  };

  const openList = id => {
    setOpenCategory(id);
    setYear('all');
    setError('');
  };

  const makeDtr = async month => {
    const [dtrYear, dtrMonth] = month.split('-').map(Number);
    const response = await fetch(dtrTemplate);
    const bytes = await fillDTR(await response.arrayBuffer(), user || {}, dtrYear, dtrMonth, attendanceHistory);
    return { fileName: dtrFilename(user?.name, dtrYear, dtrMonth), fileType: 'application/pdf', bytes };
  };
  const view = (title, load) => setViewer({ key: Date.now(), title, load });
  const downloadDtr = async month => {
    setBusy(month);
    setError('');
    try {
      const file = await makeDtr(month);
      downloadBytes(file.bytes, file.fileName, file.fileType);
    } catch (errorValue) {
      setError(errorValue.message || 'Unable to prepare the DTR. Please try again.');
    } finally {
      setBusy('');
    }
  };

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
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}

          {category.id === 'leave' && (shown.length ? (
            <ul className="space-y-2">
              {shown.map(request => (
                <Row
                  key={request.id}
                  icon={CalendarDays}
                  title={request.leaveType || 'Leave application'}
                  status={request.status}
                  meta={[dateRange(request), request.workingDays && plural(Number(request.workingDays), 'working day'), `Filed ${formatDate(request.submissionDate)}`].filter(Boolean).join(' · ')}
                >
                  <ActionButton icon={FileText} primary onClick={() => setFormPreview(request)}>CSC Form 6</ActionButton>
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
                  meta={[dateRange(request), request.travelVenue, `Filed ${formatDate(request.submissionDate)}`].filter(Boolean).join(' · ')}
                >
                  <ActionButton icon={FileText} primary onClick={() => setFormPreview(request)}>Travel Order</ActionButton>
                </Row>
              ))}
            </ul>
          ) : <Empty>Travel requests you file in Requests appear here.</Empty>)}

          {category.id === 'dtr' && (shown.length ? (
            <ul className="space-y-2">
              {shown.map(({ month, days }) => (
                <Row key={month} icon={Clock} title={`Daily Time Record – ${formatMonth(month)}`} meta={`${plural(days, 'day')} with attendance${month === thisMonth ? ' · This month so far' : ''}`}>
                  <ActionButton icon={Eye} onClick={() => view(`Daily Time Record – ${formatMonth(month)}`, () => makeDtr(month))}>View</ActionButton>
                  <ActionButton icon={Download} disabled={busy === month} onClick={() => downloadDtr(month)}>{busy === month ? 'Preparing...' : 'Download'}</ActionButton>
                </Row>
              ))}
            </ul>
          ) : <Empty>Your DTR appears here once you have Time In records.</Empty>)}
        </div>
      )}

      {viewer && <DocumentViewer key={viewer.key} title={viewer.title} load={viewer.load} onClose={() => setViewer(null)} />}
      {formPreview?.type === 'Leave Request' && <CSCForm6Preview request={formPreview} user={user} onClose={() => setFormPreview(null)} />}
      {formPreview?.type === 'Travel Order' && <TravelOrderPreview request={formPreview} user={user} onClose={() => setFormPreview(null)} />}
    </div>
  );
}
