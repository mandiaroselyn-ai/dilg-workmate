import React, { useMemo, useState } from 'react';
import { ArrowRight, ChevronLeft, Download, MessageSquare, Search, SquarePen } from 'lucide-react';
import { downloadCsv } from '../utils/csv';
import {
  SMS_CSV_HEADERS,
  formatMobile,
  isMobileNumber,
  matchesSmsFilter,
  matchesSmsSearch,
  smsCsvRows,
  smsFilterCounts,
  smsPerson,
  smsStatus,
  smsThreads,
  smsTime,
  smsWhen
} from '../utils/smsLog';
import { SmsBubbles, SmsReplyBar } from './SmsChat';

const STATUS_STYLES = {
  Sent: 'bg-emerald-100 text-emerald-800',
  Failed: 'bg-rose-100 text-rose-800',
  Received: 'bg-blue-100 text-blue-800'
};

const FILTER_LABELS = { all: 'All', failed: 'Failed', reply: 'Replies', attendance: 'Attendance', account: 'Account' };

const initials = name => String(name || '?').split(/\s+/).filter(Boolean).map(word => word[0]).join('').slice(0, 2).toUpperCase();

const StatusChip = ({ status }) => (
  <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-extrabold ${STATUS_STYLES[status] || STATUS_STYLES.Sent}`}>{status}</span>
);

const Avatar = ({ name }) => (
  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-extrabold text-indigo-800">{initials(name)}</span>
);

const personKey = person => String(person.employeeId || person.email || '');

// "New text": HR finds a person with a mobile number by name or number, like a phone's
// To: field, and their conversation opens.
const PeoplePicker = ({ employees = [], onPick, onBack, listClassName }) => {
  const [query, setQuery] = useState('');
  const people = useMemo(
    () => employees
      .filter(person => isMobileNumber(person.phoneNumber) && personKey(person))
      .sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email))),
    [employees]
  );
  const search = query.trim().toLowerCase();
  const shown = search
    ? people.filter(person => `${person.name || ''} ${person.email || ''} ${formatMobile(person.phoneNumber)} ${String(person.phoneNumber).replace(/\D/g, '')}`.toLowerCase().includes(search))
    : people;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
        <button type="button" onClick={onBack} aria-label="Back" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <h3 className="text-base font-extrabold">New text</h3>
      </div>
      <label className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5">
        <span className="text-sm font-bold text-slate-600">To:</span>
        <input
          autoFocus
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Name or mobile number"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </label>
      <ul className={`overflow-y-auto ${listClassName}`}>
        {shown.length === 0 && (
          <li className="px-4 py-10 text-center text-[13px] font-semibold text-slate-500">
            {people.length ? 'No one matches.' : 'No one has a mobile number yet.'}
          </li>
        )}
        {shown.map(person => (
          <li key={personKey(person)}>
            <button type="button" onClick={() => onPick(person)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
              <Avatar name={person.name || person.email} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-slate-900">{person.name || person.email}</span>
                <span className="block font-mono text-xs text-slate-600">{formatMobile(person.phoneNumber)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

// HR's SMS, laid out like a phone's Messages app: a list of conversations, one per person,
// that opens into chat bubbles with a box to text back. In the header dropdown ('panel')
// one shows at a time; on the SMS Log page ('page') the list and the open conversation sit
// side by side, with search and CSV export. Filters (failed texts, replies, attendance,
// account approvals) choose which conversations are listed. A text that was not delivered
// can be sent again with `onResend`, and with `onSend` HR can text anyone with a number.
export default function SmsCenter({ variant = 'panel', smsAlerts = [], employees = [], smsConfigured, onViewAll, onResend, onSend }) {
  const isPanel = variant === 'panel';
  const canText = Boolean(onSend) && smsConfigured !== false;
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [openKey, setOpenKey] = useState(null);
  const [picking, setPicking] = useState(false);
  // A person HR chose under New text who has no texts yet.
  const [draft, setDraft] = useState(null);
  // Each resent text: 'sending', 'sent', or why it could not be sent.
  const [resends, setResends] = useState({});

  const resend = async sms => {
    setResends(current => ({ ...current, [sms.id]: 'sending' }));
    try {
      await onResend(sms.id);
      setResends(current => ({ ...current, [sms.id]: 'sent' }));
    } catch (error) {
      setResends(current => ({ ...current, [sms.id]: error.message || 'The text could not be sent again.' }));
    }
  };

  const resendControl = sms => {
    if (!onResend || sms.direction === 'inbound') return null;
    const state = resends[sms.id];
    if (state === 'sent') return <span className="mt-1 block text-xs font-bold text-emerald-700">Sent again.</span>;
    return (
      <span className="mt-1 inline-flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => resend(sms)} disabled={state === 'sending'} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-[#0B4EA2] hover:bg-slate-50 disabled:opacity-50">
          {state === 'sending' ? 'Sending...' : 'Resend'}
        </button>
        {state && state !== 'sending' && <span className="text-xs font-bold text-rose-800">{state}</span>}
      </span>
    );
  };

  const failedNote = sms => (
    <>
      {sms.error && <p className="text-[11px] text-rose-700">{sms.error}</p>}
      {resendControl(sms)}
    </>
  );

  const counts = useMemo(() => smsFilterCounts(smsAlerts), [smsAlerts]);
  const visible = useMemo(
    () => smsAlerts
      .filter(sms => matchesSmsFilter(sms, filter) && matchesSmsSearch(sms, employees, query))
      .sort((a, b) => (smsTime(b) ?? 0) - (smsTime(a) ?? 0)),
    [smsAlerts, employees, filter, query]
  );
  // Every conversation holds all of that person's texts; the filters and search only
  // choose which conversations are listed.
  const allThreads = useMemo(() => smsThreads(smsAlerts, employees), [smsAlerts, employees]);
  const threads = useMemo(() => {
    const shown = new Set(visible.map(sms => smsPerson(sms, employees).key));
    return allThreads.filter(thread => shown.has(thread.key));
  }, [allThreads, visible, employees]);
  const openThread = openKey
    ? allThreads.find(thread => thread.key === openKey) || (draft?.key === openKey ? draft : null)
    : null;

  const exportCsv = () => {
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`sms-log-${date}.csv`, SMS_CSV_HEADERS, smsCsvRows(visible, employees));
  };

  const openConversation = key => {
    setOpenKey(key);
    setPicking(false);
  };

  const startText = person => {
    const who = smsPerson({ recipient: person.phoneNumber, employeeId: person.employeeId, employeeEmail: person.email }, employees);
    setDraft({ ...who, messages: [], latest: null });
    openConversation(who.key);
  };

  const closeConversation = () => {
    setOpenKey(null);
    setDraft(null);
  };

  const sendTo = thread => message => onSend({
    recipient: thread.number,
    employeeId: thread.employee?.employeeId || '',
    employeeEmail: thread.employee?.email || '',
    message
  });

  const listHeader = (
    <div className="space-y-3 border-b border-slate-200 px-4 pb-3 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className={`${isPanel ? 'text-base' : 'text-lg'} mr-auto font-extrabold`}>{isPanel ? 'SMS' : 'SMS Log'}</h3>
        {smsConfigured !== undefined && (
          <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${smsConfigured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
            <span className={`h-2 w-2 rounded-full ${smsConfigured ? 'bg-emerald-600' : 'bg-amber-600'}`} aria-hidden="true" />
            {smsConfigured ? 'SMS connected' : 'SMS not set up: no texts are sent'}
          </span>
        )}
        {canText && (
          <button type="button" onClick={() => { setPicking(true); setOpenKey(null); }} className="flex items-center gap-1.5 rounded-lg bg-[#0B4EA2] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#093f84]">
            <SquarePen className="h-3.5 w-3.5" aria-hidden="true" /> New text
          </button>
        )}
      </div>
      {!isPanel && (
        <div className="flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search SMS</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search name, number, or text"
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#0B4EA2]"
            />
          </label>
          <button type="button" onClick={exportCsv} disabled={visible.length === 0} aria-label="Export CSV" title="Export CSV" className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Download className="h-4 w-4" aria-hidden="true" /> CSV
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
  );

  const threadList = (
    <ul className={`overflow-y-auto ${isPanel ? 'max-h-[min(460px,58vh)]' : 'min-h-0 flex-1'}`}>
      {threads.length === 0 && (
        <li className="px-4 py-10 text-center text-[13px] font-semibold text-slate-500">{query ? 'No SMS match your search.' : 'No SMS here.'}</li>
      )}
      {threads.map(thread => {
        const status = smsStatus(thread.latest);
        const selected = thread.key === openKey;
        return (
          <li key={thread.key} className="border-b border-slate-100 last:border-0">
            <button
              type="button"
              aria-current={selected ? 'true' : undefined}
              onClick={() => openConversation(thread.key)}
              className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 ${selected ? 'bg-blue-50' : 'bg-white'}`}
            >
              <Avatar name={thread.name} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-extrabold text-slate-900">{thread.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-slate-500">{smsWhen(thread.latest)}</span>
                </span>
                {thread.employee && <span className="font-mono text-xs text-slate-600">{thread.number}</span>}
                <span className="mt-0.5 flex min-w-0 items-center gap-2">
                  {status !== 'Sent' && <StatusChip status={status} />}
                  <span className="truncate text-[13px] text-slate-600">{thread.latest.message}</span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const conversation = openThread && (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2.5 border-b border-slate-200 px-3 py-2.5">
        <button type="button" onClick={closeConversation} aria-label="Back to conversations" className={`rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 ${isPanel ? '' : 'md:hidden'}`}>
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <Avatar name={openThread.name} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-extrabold text-slate-900">{openThread.name}</span>
          {openThread.employee && <span className="block font-mono text-xs text-slate-600">{openThread.number}</span>}
        </span>
      </div>
      <SmsBubbles
        messages={openThread.messages}
        isMine={sms => sms.direction !== 'inbound'}
        failedNote={failedNote}
        emptyText={`No texts with ${openThread.name} yet.`}
        className={isPanel ? 'h-[min(420px,55vh)]' : 'min-h-0 flex-1'}
      />
      {canText && isMobileNumber(openThread.number)
        ? <SmsReplyBar key={openThread.key} name={openThread.name} onSend={sendTo(openThread)} />
        : <p className="border-t border-slate-200 px-4 py-2.5 text-center text-xs text-slate-500">{canText ? 'This number cannot be texted.' : 'SMS is not set up, so texts cannot be sent.'}</p>}
    </div>
  );

  const picker = picking && (
    <PeoplePicker
      employees={employees}
      onPick={startText}
      onBack={() => setPicking(false)}
      listClassName={isPanel ? 'max-h-[min(420px,55vh)]' : 'min-h-0 flex-1'}
    />
  );

  if (isPanel) {
    return (
      <section aria-label="SMS" className="flex w-[440px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
        {conversation || picker || (
          <>
            {listHeader}
            {threadList}
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
          </>
        )}
      </section>
    );
  }

  const rightOpen = Boolean(conversation || picker);
  return (
    <section aria-label="SMS" className="flex h-[calc(100vh-9rem)] min-h-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm">
      <div className={`${rightOpen ? 'hidden md:flex' : 'flex'} w-full min-w-0 flex-col border-slate-200 md:w-[360px] md:shrink-0 md:border-r`}>
        {listHeader}
        {threadList}
      </div>
      <div className={`${rightOpen ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
        {conversation || picker || (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-slate-500">
            <MessageSquare className="h-10 w-10 opacity-30" aria-hidden="true" />
            <p className="text-sm font-semibold">Choose a conversation{canText ? ', or tap New text.' : '.'}</p>
          </div>
        )}
      </div>
    </section>
  );
}
