import React, { useState, useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';

export default function MobileSmsPanel({ smsAlerts = [], onClose, onSwitchToNotifications }) {
  const threads = useMemo(() => {
    const map = {};
    smsAlerts.forEach(s => {
      const key = s.recipient || 'Unknown';
      map[key] = map[key] || [];
      map[key].push(s);
    });
    return Object.keys(map).map(k => ({ recipient: k, messages: map[k] }));
  }, [smsAlerts]);

  const [selectedThread, setSelectedThread] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);

  const currentThread = threads.find(t => t.recipient === selectedThread);

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-white text-slate-900">
      <header className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-[#1e40af] to-indigo-900 text-white">
        {selectedThread ? (
          <div className="flex items-center gap-2">
            <button
              onClick={selectedMessage ? () => setSelectedMessage(null) : () => setSelectedThread(null)}
              aria-label="Back"
              className="bg-white/12 text-white p-2 rounded hover:bg-white/20"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h2 className="text-base font-semibold truncate">{currentThread?.recipient}</h2>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={onClose} aria-label="Close messages" className="bg-white/12 text-white p-2 rounded hover:bg-white/20">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="text-base font-semibold">Messages</h2>
          </div>
        )}
      </header>

      {selectedMessage ? (
        <div className="h-[calc(100vh-50px)] overflow-y-auto bg-slate-50">
          <div className="px-4 py-5 bg-white">
            <p className="text-[11px] text-slate-500">{selectedMessage.timestamp}</p>
            <div className="mt-4 text-sm leading-7 text-slate-800 whitespace-pre-line">{selectedMessage.message}</div>
          </div>
        </div>
      ) : selectedThread ? (
        <div className="h-[calc(100vh-50px)] overflow-y-auto bg-slate-50">
          <div className="divide-y divide-slate-200 bg-white">
            {(currentThread?.messages || []).map((message, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setSelectedMessage(message)}
                className="w-full text-left px-4 py-4 hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-slate-500">{message.timestamp}</span>
                  <span className="text-[11px] text-[#1e40af] font-semibold">Open</span>
                </div>
                <p className="mt-2 text-sm text-slate-700 leading-snug truncate" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {message.message}
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="h-[calc(100vh-50px)] overflow-y-auto bg-slate-50">
          {threads.length === 0 ? (
            <div className="text-center text-slate-500 mt-6 text-sm">No messages</div>
          ) : (
            <div className="space-y-0 bg-white">
              {threads.map((thread, index) => {
                const lastMessage = thread.messages[thread.messages.length - 1];
                const avatarColor = ['bg-[#1e40af]', 'bg-[#2563eb]', 'bg-[#0f766e]', 'bg-[#b91c1c]'][index % 4];

                return (
                  <button
                    key={thread.recipient}
                    type="button"
                    onClick={() => {
                      setSelectedThread(thread.recipient);
                      setSelectedMessage(null);
                    }}
                    className="w-full px-4 py-4 flex items-start gap-3 border-b border-slate-200 text-left hover:bg-slate-50"
                  >
                    <div className={`flex items-center justify-center shrink-0 w-12 h-12 rounded-full text-white font-semibold ${avatarColor}`}>
                      {String(thread.recipient).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-slate-900 text-sm truncate">{thread.recipient}</p>
                        <span className="text-[11px] text-slate-500 whitespace-nowrap">{lastMessage?.timestamp}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600 leading-snug truncate" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {lastMessage?.message}
                      </p>
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
