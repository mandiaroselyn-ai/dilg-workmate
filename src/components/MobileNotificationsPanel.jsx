import React, { useState, useMemo } from 'react';
import { Clock, ShieldAlert, Info, CircleDot, ChevronLeft, CheckCheck, ArrowRight } from 'lucide-react';
import { employeeNotificationView, notificationWhen } from '../utils/notifications';

const TYPE_CONFIG = {
  attendance:   { label: 'Attendance',   chip: 'bg-blue-50 text-blue-700',   icon: <Clock    className="w-4 h-4 text-blue-600" />,   dot: 'bg-blue-100' },
  request:      { label: 'Request',      chip: 'bg-amber-50 text-amber-700', icon: <CircleDot className="w-4 h-4 text-amber-600" />, dot: 'bg-amber-100' },
  announcement: { label: 'Announcement', chip: 'bg-green-50 text-green-700', icon: <Info      className="w-4 h-4 text-green-600" />,  dot: 'bg-green-100' },
  system:       { label: 'Account',      chip: 'bg-red-50 text-red-700',     icon: <ShieldAlert className="w-4 h-4 text-red-600" />, dot: 'bg-red-100' },
};

const FILTERS = [
  { id: 'all',          label: 'All' },
  { id: 'unread',       label: 'Unread' },
  { id: 'attendance',   label: 'Attendance' },
  { id: 'request',      label: 'Requests' },
  { id: 'announcement', label: 'Announcements' },
  { id: 'account',      label: 'Account' },
];

// Account notices (approval, leave credits, biometric review, password, profile changes)
// are the ones of no other kind.
const isAccountNotice = n => !['attendance', 'request', 'announcement'].includes(n.type);

const VIEW_LABELS = {
  dashboard: 'Dashboard',
  attendance: 'Attendance',
  requests: 'My Requests',
  announcements: 'Announcements',
  calendar: 'Calendar',
  profile: 'Profile',
  settings: 'Settings'
};

const GROUP_ORDER = ['Today', 'Yesterday', 'This Week', 'Older'];

function getDateGroup(createdAt) {
  if (!createdAt) return 'Older';
  const notifDate = new Date(createdAt);
  if (isNaN(notifDate)) return 'Older';
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  if (notifDate >= todayStart)     return 'Today';
  if (notifDate >= yesterdayStart) return 'Yesterday';
  if (notifDate >= weekStart)      return 'This Week';
  return 'Older';
}

export default function MobileNotificationsPanel({ notifications = [], onClose, onMarkNotificationRead, onMarkAllRead, onOpenView }) {
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  const filtered = useMemo(() => {
    if (activeFilter === 'all')    return notifications;
    if (activeFilter === 'unread') return notifications.filter(n => !n.read);
    if (activeFilter === 'account') return notifications.filter(isAccountNotice);
    return notifications.filter(n => n.type === activeFilter);
  }, [notifications, activeFilter]);

  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(n => {
      const g = getDateGroup(n.createdAt);
      if (!map[g]) map[g] = [];
      map[g].push(n);
    });
    return GROUP_ORDER.filter(g => map[g]?.length).map(g => ({ label: g, items: map[g] }));
  }, [filtered]);

  // One request marks them all read.
  function handleMarkAll() {
    if (onMarkAllRead) onMarkAllRead();
    else notifications.filter(n => !n.read).forEach(n => onMarkNotificationRead(n.id));
  }

  const selectedView = selectedNotification ? employeeNotificationView(selectedNotification) : '';
  function openView() {
    onOpenView?.(selectedView);
    onClose();
  }

  function openNotif(notif) {
    setSelectedNotification(notif);
    if (!notif.read) onMarkNotificationRead(notif.id);
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex flex-col bg-slate-50 text-slate-900">

      {/* Header */}
      <header className="flex-shrink-0 bg-gradient-to-r from-[#1e40af] to-indigo-900 text-white">
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={selectedNotification ? () => setSelectedNotification(null) : onClose}
              aria-label="Back"
              className="bg-white/15 p-1.5 rounded-lg hover:bg-white/25 active:bg-white/30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="text-[15px] font-bold tracking-tight">Notifications</h2>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                {unreadCount}
              </span>
            )}
          </div>
          {!selectedNotification && unreadCount > 0 && (
            <button
              onClick={handleMarkAll}
              className="flex items-center gap-1 bg-white/15 hover:bg-white/25 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg"
            >
              <CheckCheck className="w-3 h-3" />
              Mark all read
            </button>
          )}
        </div>

        {/* Filter tabs — hidden on detail view */}
        {!selectedNotification && (
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

      {/* Detail view */}
      {selectedNotification ? (
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 pt-5 pb-2 bg-white border-b border-slate-100">
            {(() => {
              const cfg = TYPE_CONFIG[selectedNotification.type] || TYPE_CONFIG.system;
              return (
                <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md ${cfg.chip}`}>
                  {cfg.label}
                </span>
              );
            })()}
            <h3 className="mt-2 text-[15px] font-bold text-slate-900">{selectedNotification.title}</h3>
            <time className="text-[11px] text-slate-400 mt-0.5 block">{notificationWhen(selectedNotification)}</time>
          </div>
          <div className="px-4 py-5 bg-white mt-2 mx-0">
            <p className="text-sm text-slate-800 leading-7 whitespace-pre-line">{selectedNotification.message}</p>
            {selectedView && VIEW_LABELS[selectedView] && onOpenView && (
              <button
                type="button"
                onClick={openView}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#1e40af] px-4 py-2.5 text-[13px] font-semibold text-white active:bg-blue-900"
              >
                Open {VIEW_LABELS[selectedView]} <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ) : (
        /* List view */
        <div className="flex-1 overflow-y-auto">
          {grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400">
              <Info className="w-8 h-8 opacity-30" />
              <p className="text-sm font-medium">No notifications here</p>
            </div>
          ) : (
            grouped.map(group => (
              <div key={group.label}>
                <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                  {group.label}
                </div>
                <div className="bg-white divide-y divide-slate-100">
                  {group.items.map(notif => {
                    const cfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.system;
                    return (
                      <article
                        key={notif.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openNotif(notif)}
                        onKeyDown={e => e.key === 'Enter' && openNotif(notif)}
                        className={`flex items-start gap-3 px-4 py-3.5 cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors ${
                          !notif.read ? 'border-l-[3px] border-[#1e40af]' : 'border-l-[3px] border-transparent'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${cfg.dot}`}>
                          {cfg.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cfg.chip}`}>
                                  {cfg.label}
                                </span>
                              </div>
                              <p className="text-[13px] font-semibold text-slate-900 leading-snug">{notif.title}</p>
                              <p className="text-[12px] text-slate-500 mt-0.5 leading-snug line-clamp-2">{notif.message}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                              <time className="text-[10px] text-slate-400 whitespace-nowrap">{notificationWhen(notif)}</time>
                              {!notif.read && (
                                <span className="w-2 h-2 rounded-full bg-[#1e40af]" />
                              )}
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
