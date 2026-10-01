import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clock, FileText, Info, KeyRound, Megaphone, MessageSquare, ScanFace, Search, Undo2, UserPlus, Users } from 'lucide-react';
import { actionLabel, notificationCounts, notificationKind, notificationSections, notificationWhen } from '../utils/notifications';

const KIND_STYLES = {
  account: { Icon: UserPlus, tone: 'bg-indigo-50 text-indigo-700' },
  password: { Icon: KeyRound, tone: 'bg-amber-100 text-amber-800' },
  biometric: { Icon: ScanFace, tone: 'bg-blue-100 text-blue-700' },
  request: { Icon: FileText, tone: 'bg-emerald-100 text-emerald-700' },
  withdrawn: { Icon: Undo2, tone: 'bg-slate-100 text-slate-600' },
  announcement: { Icon: Megaphone, tone: 'bg-rose-100 text-rose-700' },
  attendance: { Icon: Clock, tone: 'bg-sky-100 text-sky-700' },
  sms: { Icon: MessageSquare, tone: 'bg-blue-100 text-blue-700' },
  people: { Icon: Users, tone: 'bg-slate-100 text-slate-600' },
  system: { Icon: Info, tone: 'bg-slate-100 text-slate-600' }
};

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'action', label: 'Needs action' }
];

// HR/Admin and Supervisor notifications: tabs, the ones needing action first, then by
// day, each with an icon and, where there is something to do, a button that opens it.
// `variant` is 'panel' (the header dropdown) or 'page' (the Notifications page, with search).
// `context` ({ role, employees, requests }) decides which notifications still need action.
export default function NotificationCenter({
  variant = 'panel',
  notifications = [],
  context = {},
  onMarkRead,
  onMarkAllRead,
  onClearAll,
  onAction,
  onViewAll
}) {
  const isPanel = variant === 'panel';
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  // Times such as "5 min ago" stay current while the list is open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const counts = useMemo(() => notificationCounts(notifications, context), [notifications, context]);
  const sections = useMemo(
    () => notificationSections(notifications, { tab, query, context, now }),
    [notifications, tab, query, context, now]
  );

  return (
    <section
      aria-label="Notifications"
      className={isPanel
        ? 'flex w-[400px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl'
        : 'flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm'}
    >
      <div className="space-y-3 border-b border-slate-200 px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className={`${isPanel ? 'text-base' : 'text-lg'} font-extrabold`}>Notifications</h3>
          <div className="flex items-center gap-3">
            {counts.unread > 0 && (
              <button type="button" onClick={onMarkAllRead} className="text-[13px] font-bold text-[#0B4EA2] hover:underline">Mark all read</button>
            )}
            {notifications.length > 0 && onClearAll && (
              <button type="button" onClick={onClearAll} title="Hide these notifications. Only new ones will show." className="text-[13px] font-bold text-slate-500 hover:underline">Clear all</button>
            )}
          </div>
        </div>
        {!isPanel && (
          <label className="relative block">
            <span className="sr-only">Search notifications</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search notifications"
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#0B4EA2]"
            />
          </label>
        )}
        <div role="tablist" aria-label="Show" className="flex flex-wrap gap-2">
          {TABS.map(item => {
            const selected = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(item.id)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${selected ? 'border-[#0B4EA2] bg-[#0B4EA2] text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                {item.label} <span className="font-extrabold">{counts[item.id]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={isPanel ? 'max-h-[min(560px,70vh)] overflow-y-auto' : ''}>
        {sections.length === 0 && (
          <p className="px-4 py-10 text-center text-[13px] font-semibold text-slate-500">
            {query ? 'No notifications match your search.' : tab === 'all' ? 'No notifications yet.' : "You're all caught up."}
          </p>
        )}
        {sections.map(section => (
          <div key={section.label}>
            <p className="px-4 pb-1 pt-3 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{section.label}</p>
            <ul>
              {section.items.map(({ notification, target, pending }) => {
                const { Icon, tone } = KIND_STYLES[notificationKind(notification)] || KIND_STYLES.system;
                const unread = !notification.read;
                const label = target ? actionLabel(target.action, pending) : '';
                return (
                  <li key={notification.id} className={`flex items-start gap-3 px-4 py-3 ${unread ? 'bg-slate-50' : 'bg-white'}`}>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${tone}`}>
                      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => unread && onMarkRead?.(notification.id)}
                          title={unread ? 'Mark as read' : undefined}
                          className={`text-left text-sm text-slate-900 ${unread ? 'font-extrabold' : 'font-semibold'}`}
                        >
                          {notification.title}
                        </button>
                        <span className="ml-auto shrink-0 whitespace-nowrap pt-0.5 text-xs text-slate-500">{notificationWhen(notification, now)}</span>
                        {unread && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600"><span className="sr-only">Unread</span></span>
                        )}
                      </div>
                      <p className={`mt-1 break-words text-[13px] leading-snug text-slate-600 ${isPanel ? 'line-clamp-3' : ''}`}>{notification.message}</p>
                      {label && (
                        <button
                          type="button"
                          onClick={() => onAction?.(notification, target)}
                          className={pending
                            ? 'mt-2.5 rounded-[10px] bg-[#0B4EA2] px-3.5 py-2 text-xs font-extrabold text-white hover:bg-[#083b7a]'
                            : 'mt-2.5 rounded-[10px] border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50'}
                        >
                          {label}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {isPanel && onViewAll && (
        <div className="flex justify-center border-t border-slate-200 px-4 py-3">
          <button type="button" onClick={onViewAll} className="flex items-center gap-1.5 text-[13px] font-extrabold text-[#0B4EA2] hover:underline">
            View all notifications <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}
