import React, { useMemo, useState } from 'react';
import { ArrowRight, Download, Search } from 'lucide-react';
import { downloadCsv } from '../utils/csv';
import {
  SMS_CSV_HEADERS,
  SMS_KIND_LABELS,
  matchesSmsFilter,
  matchesSmsSearch,
  smsCsvRows,
  smsFilterCounts,
  smsKind,
  smsPerson,
  smsStatus,
  smsThreads,
  smsTime,
  smsWhen
} from '../utils/smsLog';

const STATUS_STYLES = {
  Sent: 'bg-emerald-100 text-emerald-800',
  Failed: 'bg-rose-100 text-rose-800',
  Received: 'bg-blue-100 text-blue-800'
};

const FILTER_LABELS = { all: 'All', failed: 'Failed', reply: 'Replies', attendance: 'Attendance', account: 'Account approved' };

const initials = name => String(name || '?').split(/\s+/).filter(Boolean).map(word => word[0]).join('').slice(0, 2).toUpperCase();

const StatusChip = ({ status }) => (
  <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-extrabold ${STATUS_STYLES[status] || STATUS_STYLES.Sent}`}>{status}</span>
);

// HR's SMS log: whether SMS is set up, filters (failed texts, replies, attendance, account
// approvals), and either one row per person that opens their messages ('panel', the header
// dropdown) or every message with search and CSV export ('page', the SMS Log page).
export default function SmsCenter({ variant = 'panel', smsAlerts = [], employees = [], smsConfigured, onViewAll }) {
  const isPanel = variant === 'panel';
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [openKey, setOpenKey] = useState(null);

  const counts = useMemo(() => smsFilterCounts(smsAlerts), [smsAlerts]);
  const visible = useMemo(
    () => smsAlerts
      .filter(sms => matchesSmsFilter(sms, filter) && matchesSmsSearch(sms, employees, query))
      .sort((a, b) => (smsTime(b) ?? 0) - (smsTime(a) ?? 0)),
    [smsAlerts, employees, filter, query]
  );
  const threads = useMemo(() => (isPanel ? smsThreads(visible, employees) : []), [isPanel, visible, employees]);

  const exportCsv = () => {
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`sms-log-${date}.csv`, SMS_CSV_HEADERS, smsCsvRows(visible, employees));
  };

  return (
    <section
      aria-label="SMS"
      className={isPanel
        ? 'flex w-[440px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl'
        : 'flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm'}
    >
      <div className="space-y-3 border-b border-slate-200 px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className={`${isPanel ? 'text-base' : 'text-lg'} font-extrabold`}>{isPanel ? 'SMS' : 'SMS Log'}</h3>
          {smsConfigured !== undefined && (
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${smsConfigured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
              <span className={`h-2 w-2 rounded-full ${smsConfigured ? 'bg-emerald-600' : 'bg-amber-600'}`} aria-hidden="true" />
              {smsConfigured ? 'SMS connected' : 'SMS not set up: no texts are sent'}
            </span>
          )}
        </div>
        {!isPanel && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search SMS</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search by name, number, or message"
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#0B4EA2]"
              />
            </label>
            <button type="button" onClick={exportCsv} disabled={visible.length === 0} className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
            </button>
          </div>
        )}
        <div role="tablist" aria-label="Show" className="flex flex-wrap gap-2">
          {Object.entries(FILTER_LABELS).map(([id, label]) => {
            const selected = filter === id;
            const showCount = (id === 'failed' || id === 'reply') && counts[id] > 0;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setFilter(id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold ${selected ? 'border-[#0B4EA2] bg-[#0B4EA2] text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                {label}{showCount ? ` ${counts[id]}` : ''}
              </button>
            );
          })}
        </div>
      </div>

      {isPanel ? (
        <div className="max-h-[min(540px,65vh)] overflow-y-auto">
          {threads.length === 0 && <p className="px-4 py-10 text-center text-[13px] font-semibold text-slate-500">No SMS here.</p>}
          {threads.map(thread => {
            const expanded = openKey === thread.key;
            const status = smsStatus(thread.latest);
            return (
              <div key={thread.key} className="border-b border-slate-100 last:border-0">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpenKey(expanded ? null : thread.key)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 ${expanded ? 'bg-slate-50' : 'bg-white'}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-extrabold text-indigo-800">{initials(thread.name)}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-extrabold text-slate-900">{thread.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-slate-500">{smsWhen(thread.latest)}</span>
                    </span>
                    {thread.employee && <span className="font-mono text-xs text-slate-600">{thread.number}</span>}
                    <span className="mt-0.5 flex min-w-0 items-center gap-2">
                      <StatusChip status={status} />
                      <span className="truncate text-[13px] text-slate-600">{thread.latest.message}</span>
                    </span>
                  </span>
                </button>
                {expanded && (
                  <ol className="space-y-2 bg-slate-50 pb-3.5 pl-16 pr-4 pt-1">
                    {thread.messages.map(sms => {
                      const messageStatus = smsStatus(sms);
                      return (
                        <li key={sms.id} className={`rounded-[10px] border p-3 ${messageStatus === 'Failed' ? 'border-rose-300 bg-white' : messageStatus === 'Received' ? 'border-slate-200 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                          <div className="flex justify-between gap-2 text-[11px] font-bold text-slate-500">
                            <span>{smsWhen(sms)} · {SMS_KIND_LABELS[smsKind(sms)]}</span>
                            <StatusChip status={messageStatus} />
                          </div>
                          <p className="mt-1 break-words text-[13px] leading-snug text-slate-800">{sms.message}</p>
                          {messageStatus === 'Failed' && (
                            <p className="mt-1.5 text-xs font-bold text-rose-800">
                              Not delivered{sms.error ? `: ${sms.error}` : ''}. Contact {thread.employee ? thread.name : 'them'} another way.
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          {visible.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] font-semibold text-slate-500">{query ? 'No SMS match your search.' : 'No SMS here.'}</p>
          ) : (
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Date and time</th>
                  <th scope="col" className="px-4 py-2.5">Name</th>
                  <th scope="col" className="px-4 py-2.5">Type</th>
                  <th scope="col" className="px-4 py-2.5">Status</th>
                  <th scope="col" className="px-4 py-2.5">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map(sms => {
                  const person = smsPerson(sms, employees);
                  const status = smsStatus(sms);
                  return (
                    <tr key={sms.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{smsWhen(sms)}</td>
                      <td className="min-w-[180px] px-4 py-3">
                        <p className="font-bold text-slate-900">{person.name}</p>
                        {person.employee && <p className="whitespace-nowrap font-mono text-xs text-slate-600">{person.number}</p>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate-700">{SMS_KIND_LABELS[smsKind(sms)]}</td>
                      <td className="px-4 py-3"><StatusChip status={status} /></td>
                      <td className="px-4 py-3 text-[13px] leading-snug text-slate-700">
                        {sms.message}
                        {status === 'Failed' && (
                          <span className="mt-1 block text-xs font-bold text-rose-800">Not delivered{sms.error ? `: ${sms.error}` : ''}.</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {isPanel && (
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          {onViewAll ? (
            <button type="button" onClick={onViewAll} className="flex items-center gap-1.5 text-[13px] font-extrabold text-[#0B4EA2] hover:underline">
              View full SMS log <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : <span />}
          <button type="button" onClick={exportCsv} disabled={visible.length === 0} className="flex items-center gap-1.5 rounded-[10px] border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export CSV
          </button>
        </div>
      )}
    </section>
  );
}
