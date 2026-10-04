import React, { useState, useMemo } from 'react';
import { ChevronLeft, Search, MessageSquare, X } from 'lucide-react';
import { smsKind, smsStatus, smsTime, smsWhen } from '../utils/smsLog';

// What each text is about. A text the employee sent back comes in as a reply.
const KIND_CONFIG = {
  attendance: { label: 'Attendance', chip: 'bg-blue-50 text-blue-700' },
  request:    { label: 'Request',    chip: 'bg-amber-50 text-amber-700' },
  account:    { label: 'Account',    chip: 'bg-red-50 text-red-700' },
  manual:     { label: 'HR Message', chip: 'bg-green-50 text-green-700' },
  reply:      { label: 'Your Reply', chip: 'bg-indigo-50 text-indigo-700' },
};

const STATUS_CONFIG = {
  Failed:    { label: '✗ Not delivered', cls: 'bg-red-50 text-red-700' },
  Sent:      { label: '✓ Sent',          cls: 'bg-slate-100 text-slate-500' },
  Delivered: { label: '✓✓ Delivered',    cls: 'bg-green-50 text-green-700' },
};

const FILTERS = [
  { id: 'all',        label: 'All' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'request',    label: 'Requests' },
  { id: 'account',    label: 'Account' },
  { id: 'manual',     label: 'HR Messages' },
  { id: 'failed',     label: 'Not delivered' },
];

const Chips = ({ sms }) => {
  const kindCfg = KIND_CONFIG[smsKind(sms)];
  const statusCfg = STATUS_CONFIG[smsStatus(sms)];
  return (
    <div className="flex items-center gap-1.5">
      {kindCfg && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${kindCfg.chip}`}>{kindCfg.label}</span>}
      {statusCfg && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusCfg.cls}`}>{statusCfg.label}</span>}
    </div>
  );
};

// The employee's texts from DILG WorkMate (and their replies), newest first.
export default function MobileSmsPanel({ smsAlerts = [], onClose }) {
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');

  const messages = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...smsAlerts]
      .sort((a, b) => (smsTime(b) ?? 0) - (smsTime(a) ?? 0))
      .filter(sms => activeFilter === 'all'
        || (activeFilter === 'failed' ? smsStatus(sms) === 'Failed' : smsKind(sms) === activeFilter))
      .filter(sms => !q || (sms.message || '').toLowerCase().includes(q));
  }, [smsAlerts, activeFilter, search]);

  function goBack() {
    if (selectedMessage) { setSelectedMessage(null); return; }
    onClose();
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex flex-col bg-slate-50 text-slate-900">

      {/* Header */}
      <header className="flex-shrink-0 bg-gradient-to-r from-[#1e40af] to-indigo-900 text-white">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button
            onClick={goBack}
            aria-label="Back"
            className="bg-white/15 p-1.5 rounded-lg hover:bg-white/25 active:bg-white/30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold tracking-tight truncate">Messages</h2>
            <p className="text-[10px] text-white/70 truncate">Texts from DILG WorkMate</p>
          </div>
        </div>

        {/* Filter tabs — only on the list */}
        {!selectedMessage && (
          <div className="flex overflow-x-auto scrollbar-none px-1 pb-0">
            {FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id)}
                className={`flex-shrink-0 text-[12px] font-semibold px-3 py-2 border-b-2 transition-colors ${
                  activeFilter === f.id
                    ? 'text-white border-white'
                    : 'text-white/60 border-transparent hover:text-white/85'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Search bar — only on the list */}
      {!selectedMessage && (
        <div className="px-4 py-2.5 bg-white border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Search messages…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 text-[13px] bg-transparent outline-none text-slate-800 placeholder:text-slate-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {selectedMessage ? (
        /* Full message */
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 pt-5 pb-3 bg-white border-b border-slate-100 space-y-1">
            <Chips sms={selectedMessage} />
            <time className="block text-[11px] text-slate-400">{smsWhen(selectedMessage)}</time>
            {selectedMessage.recipient && smsStatus(selectedMessage) !== 'Received' && (
              <p className="text-[11px] text-slate-500">To {selectedMessage.recipient}</p>
            )}
          </div>
          <div className="px-4 py-5 bg-white mt-2">
            <p className="text-sm text-slate-800 leading-7 whitespace-pre-line">{selectedMessage.message}</p>
            {smsStatus(selectedMessage) === 'Failed' && (
              <p className="mt-4 rounded-xl bg-red-50 p-3 text-[12px] text-red-700">
                This text could not be sent to your phone, so it is shown here. Check that your mobile number in Profile is correct.
              </p>
            )}
          </div>
        </div>
      ) : (
        /* Message list */
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400">
              <MessageSquare className="w-8 h-8 opacity-30" />
              <p className="text-sm font-medium">
                {search ? 'No messages match your search' : 'No messages here'}
              </p>
            </div>
          ) : (
            <div className="bg-white divide-y divide-slate-100">
              {messages.map(sms => (
                <button
                  key={sms.id || `${sms.timestamp}-${sms.message}`}
                  type="button"
                  onClick={() => setSelectedMessage(sms)}
                  className="w-full text-left px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <Chips sms={sms} />
                    <time className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">{smsWhen(sms)}</time>
                  </div>
                  <p className="text-[13px] text-slate-700 leading-snug line-clamp-2">{sms.message}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
