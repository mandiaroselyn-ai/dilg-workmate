import React, { useState } from 'react';
import { Clock, ShieldAlert, Info, CircleDot, ChevronLeft } from 'lucide-react';

export default function MobileNotificationsPanel({ notifications = [], onClose, onSwitchToSms, onMarkNotificationRead }) {
  const [selectedNotification, setSelectedNotification] = useState(null);

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-white text-slate-900">
      <header className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-[#1e40af] to-indigo-900 text-white">
        <div className="flex items-center gap-2">
          <button onClick={onClose} aria-label="Close notifications" className="bg-white/12 text-white p-2 rounded hover:bg-white/20">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-base font-semibold">Notifications</h2>
        </div>
      </header>

      {selectedNotification ? (
        <div className="h-[calc(100vh-50px)] overflow-y-auto bg-slate-50">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white">
            <button onClick={() => setSelectedNotification(null)} aria-label="Back to list" className="bg-slate-100 text-slate-700 p-2 rounded-full hover:bg-slate-200">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{selectedNotification.title}</p>
              <p className="text-xs text-slate-500">Full notification view</p>
            </div>
          </div>
          <div className="px-4 py-5 bg-white">
            <p className="text-[11px] text-slate-500">{selectedNotification.time}</p>
            <div className="mt-4 text-sm text-slate-800 leading-7 whitespace-pre-line">{selectedNotification.message}</div>
          </div>
        </div>
      ) : (
        <div className="h-[calc(100vh-50px)] overflow-y-auto bg-slate-50">
          {notifications.length === 0 ? (
            <div className="text-center text-slate-500 mt-6 text-sm">No notifications</div>
          ) : (
            <div className="space-y-0 bg-white">
              {notifications.map((notif, index) => (
                <article
                  key={notif.id}
                  role="button"
                  onClick={() => setSelectedNotification(notif)}
                  className={`w-full px-4 py-4 border-b border-slate-200 text-left hover:bg-slate-50 cursor-pointer ${!notif.read ? 'border-l-4 border-[#1e40af]' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="shrink-0 mt-0.5">
                        {notif.type === 'attendance' && <Clock className="w-4 h-4 text-[#1e40af]" />}
                        {notif.type === 'request' && <CircleDot className="w-4 h-4 text-[#1e40af]" />}
                        {notif.type === 'announcement' && <Info className="w-4 h-4 text-[#1e40af]" />}
                        {notif.type === 'system' && <ShieldAlert className="w-4 h-4 text-[#1e40af]" />}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-medium text-slate-800 text-sm truncate">{notif.title}</h3>
                          <time className="text-[11px] text-slate-500 ml-2">{notif.time}</time>
                        </div>
                        <p className="mt-1 text-sm text-slate-700 leading-snug truncate" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {notif.message}
                        </p>
                      </div>
                    </div>
                    <div className="ml-1 flex-shrink-0">
                      {!notif.read && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onMarkNotificationRead(notif.id); }}
                          className="text-xs text-[#1e40af] font-semibold"
                        >
                          Mark
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
