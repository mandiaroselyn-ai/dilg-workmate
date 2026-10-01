import React, { useState, useMemo } from 'react';
import { ChevronLeft, Search, MessageSquare, X } from 'lucide-react';

const KIND_CONFIG = {
  attendance: { label: 'Attendance', chip: 'bg-blue-50 text-blue-700' },
  account:    { label: 'Account',    chip: 'bg-red-50 text-red-700' },
  manual:     { label: 'HR Manual',  chip: 'bg-green-50 text-green-700' },
};

const STATUS_CONFIG = {
  Failed:    { label: '✗ Failed',    cls: 'bg-red-50 text-red-700' },
  Sent:      { label: '✓ Sent',      cls: 'bg-slate-100 text-slate-500' },
  Delivered: { label: '✓✓ Delivered', cls: 'bg-green-50 text-green-700' },
};

const AVATAR_COLORS = [
  'from-[#1e40af] to-[#2563eb]',
  'from-[#4f46e5] to-[#7c3aed]',
  'from-[#0d9488] to-[#0891b2]',
  'from-[#be185d] to-[#e11d48]',
];

const FILTERS = [
  { id: 'all',        label: 'All' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'account',    label: 'Account' },
  { id: 'manual',     label: 'HR Manual' },
  { id: 'failed',     label: 'Failed' },
];

export default function MobileSmsPanel({ smsAlerts = [], onClose, onSwitchToNotifications }) {
  const [selectedThread, setSelectedThread] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');

  const threads = useMemo(() => {
    const map = {};
    smsAlerts.forEach(s => {
      const key = s.recipient || 'Unknown';
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return Object.keys(map).map(k => ({ recipient: k, messages: map[k] }));
  }, [smsAlerts]);

  const filteredThreads = useMemo(() => {
    return threads.filter(thread => {
      const msgs = thread.messages;
      const matchesFilter =
        activeFilter === 'all'        ? true :
        activeFilter === 'failed'     ? msgs.some(m => m.status === 'Failed') :
        msgs.some(m => m.kind === activeFilter);
      const q = search.trim().toLowerCase();
      const matchesSearch = !q || msgs.some(m =>
        (m.message || '').toLowerCase().includes(q) ||
        (thread.recipient || '').toLowerCase().includes(q)
      );
      return matchesFilter && matchesSearch;
    });
  }, [threads, activeFilter, search]);

  const currentThread = threads.find(t => t.recipient === selectedThread);

  function goBack() {
    if (selectedMessage) { setSelectedMessage(null); return; }
    if (selectedThread)  { setSelectedThread(null);  return; }
    onClose();
  }

  const headerTitle = selectedThread
    ? (currentThread?.recipient || 'Messages')
    : 'Messages';

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
          <h2 className="text-[15px] font-bold tracking-tight flex-1 truncate">{headerTitle}</h2>
        </div>

        {/* Filter tabs — only on thread list */}
        {!selectedThread && (
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

      {/* Search bar — only on thread list */}
      {!selectedThread && (
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

      {/* Full message detail */}
      {selectedMessage ? (
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 pt-5 pb-3 bg-white border-b border-slate-100">
            {selectedMessage.kind && KIND_CONFIG[selectedMessage.kind] && (
              <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded ${KIND_CONFIG[selectedMessage.kind].chip}`}>
                {KIND_CONFIG[selectedMessage.kind].label}
              </span>
            )}
            <time className="block text-[11px] text-slate-400 mt-1">{selectedMessage.timestamp}</time>
            {selectedMessage.status && STATUS_CONFIG[selectedMessage.status] && (
              <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded mt-1 ${STATUS_CONFIG[selectedMessage.status].cls}`}>
                {STATUS_CONFIG[selectedMessage.status].label}
              </span>
            )}
          </div>
          <div className="px-4 py-5 bg-white mt-2">
            <p className="text-sm text-slate-800 leading-7 whitespace-pre-line">{selectedMessage.message}</p>
          </div>
        </div>

      /* Thread message list */
      ) : selectedThread ? (
        <div className="flex-1 overflow-y-auto">
          {(currentThread?.messages || []).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-400">
              <MessageSquare className="w-8 h-8 opacity-30" />
              <p className="text-sm font-medium">No messages</p>
            </div>
          ) : (
            <div className="bg-white divide-y divide-slate-100">
              {(currentThread.messages).map((msg, i) => {
                const statusCfg = msg.status ? STATUS_CONFIG[msg.status] : null;
                const kindCfg   = msg.kind   ? KIND_CONFIG[msg.kind]     : null;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedMessage(msg)}
                    className="w-full text-left px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <div className="flex items-center gap-1.5">
                        {kindCfg && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${kindCfg.chip}`}>
                            {kindCfg.label}
                          </span>
                        )}
                        {statusCfg && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusCfg.cls}`}>
                            {statusCfg.label}
                          </span>
                        )}
                      </div>
                      <time className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">{msg.timestamp}</time>
                    </div>
                    <p className="text-[13px] text-slate-700 leading-snug line-clamp-2">{msg.message}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

      /* Thread list */
      ) : (
        <div className="flex-1 overflow-y-auto">
          {filteredThreads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400">
              <MessageSquare className="w-8 h-8 opacity-30" />
              <p className="text-sm font-medium">
                {search ? 'No messages match your search' : 'No messages here'}
              </p>
            </div>
          ) : (
            <div className="bg-white divide-y divide-slate-100">
              {filteredThreads.map((thread, index) => {
                const lastMsg    = thread.messages[thread.messages.length - 1];
                const hasFailed  = thread.messages.some(m => m.status === 'Failed');
                const statusCfg  = lastMsg?.status ? STATUS_CONFIG[lastMsg.status] : null;
                const kindCfg    = lastMsg?.kind   ? KIND_CONFIG[lastMsg.kind]     : null;
                const avatarGrad = AVATAR_COLORS[index % AVATAR_COLORS.length];
                return (
                  <button
                    key={thread.recipient}
                    type="button"
                    onClick={() => { setSelectedThread(thread.recipient); setSelectedMessage(null); }}
                    className="w-full px-4 py-3.5 flex items-start gap-3 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
                  >
                    <div className={`flex items-center justify-center shrink-0 w-11 h-11 rounded-2xl bg-gradient-to-br ${avatarGrad} text-white text-base font-bold`}>
                      {String(thread.recipient).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-[13px] font-bold text-slate-900 truncate">{thread.recipient}</p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {hasFailed && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-50 text-red-700">
                              ✗ Failed
                            </span>
                          )}
                          <time className="text-[10px] text-slate-400 whitespace-nowrap">{lastMsg?.timestamp}</time>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mb-1">
                        {kindCfg && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${kindCfg.chip}`}>
                            {kindCfg.label}
                          </span>
                        )}
                        {statusCfg && !hasFailed && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusCfg.cls}`}>
                            {statusCfg.label}
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-slate-500 leading-snug line-clamp-2">{lastMsg?.message}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
