/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Bell, Mail, MessageSquare, ShieldAlert, CircleDot, Info, Calendar as CalendarIcon, Clock, Settings, User, Menu } from 'lucide-react';
import logoImage from '../assets/dilg-logo.png';
import MobileNotificationsPanel from './MobileNotificationsPanel';
import MobileSmsPanel from './MobileSmsPanel';
import NotificationCenter from './NotificationCenter';
import SmsCenter from './SmsCenter';
import { unseenSmsCount } from '../utils/smsLog';
import { employeeNotificationView, notificationWhen } from '../utils/notifications';
import { getManilaDateString } from '../../shared/localDate';
import { requestCoversDate } from '../utils/hrAttendance';

// When HR last opened the SMS list, remembered per account in this browser. The first
// visit starts from now, so the badge counts only what arrives afterwards.
const readSmsSeenAt = key => {
  try {
    const saved = Number(window.localStorage.getItem(key));
    if (saved > 0) return saved;
    const now = Date.now();
    window.localStorage.setItem(key, String(now));
    return now;
  } catch {
    return Date.now();
  }
};

export default function Header({
  currentView,
  user,
  activeRole,
  notifications,
  smsAlerts,
  employees = [],
  requests = [],
  smsConfigured,
  onMarkNotificationRead,
  onClearNotifications,
  onDismissNotifications,
  onNotificationAction,
  onSendSms,
  onViewChange,
  onToggleSidebar,
  onLogout
}) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSMSLogs, setShowSMSLogs] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(null);
  const smsSeenKey = `dilg_sms_seen:${String(user?.email || '').trim().toLowerCase()}`;
  const [smsSeenAt, setSmsSeenAt] = useState(() => readSmsSeenAt(smsSeenKey));
  useEffect(() => setSmsSeenAt(readSmsSeenAt(smsSeenKey)), [smsSeenKey]);
  const [isMobileBrowser, setIsMobileBrowser] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );
  useEffect(() => {
    const check = () => setIsMobileBrowser(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const markSmsSeen = () => {
    const now = Date.now();
    setSmsSeenAt(now);
    try {
      window.localStorage.setItem(smsSeenKey, String(now));
    } catch {
      // Not remembered when storage is blocked.
    }
  };
  const notificationContext = useMemo(() => ({ role: activeRole, employees, requests }), [activeRole, employees, requests]);
  
  const notificationRef = useRef(null);
  const smsRef = useRef(null);

  // Close dropdowns on outer click
  useEffect(() => {
    function handleClickOutside(event) {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (smsRef.current && !smsRef.current.contains(event.target)) {
        setShowSMSLogs(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;
  const smsThreads = Object.values(smsAlerts.reduce((groups, sms) => {
    const recipient = sms.recipient || 'Unknown';
    if (!groups[recipient]) groups[recipient] = { recipient, messages: [] };
    groups[recipient].messages.push(sms);
    return groups;
  }, {}));
  const isWebOnlyRole = [activeRole, user?.accessLevel]
    .map(role => role?.toString().trim().toLowerCase())
    .some(role => role === 'supervisor' || role === 'hr_admin');
  const isEmployeeMobileApp = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('platform') === 'mobile'
    && new URLSearchParams(window.location.search).get('role') === 'employee'
    && activeRole === 'employee'
    && user?.accessLevel !== 'supervisor'
    && user?.accessLevel !== 'hr_admin';
  const showFullScreenPanels = !isWebOnlyRole && activeRole === 'employee'
    && (isEmployeeMobileApp || isMobileBrowser);

  useEffect(() => {
    if (isWebOnlyRole) {
      setShowSMSLogs(false);
      setShowNotifications(false);
      setMobilePanel(null);
    }
  }, [isWebOnlyRole]);

  useEffect(() => {
    setShowSMSLogs(false);
    setShowNotifications(false);
    setMobilePanel(null);
  }, [currentView]);

  const viewTitles = {
    dashboard: 'Dashboard',
    attendance: 'Attendance',
    requests: 'Requests',
    announcements: 'Announcements',
    documents: 'Documents',
    service_records: 'Service Records',
    office_directory: 'Office Directory',
    calendar: 'Calendar',
    profile: activeRole === 'supervisor' ? 'Supervisor Profile' : 'Profile',
    settings: 'Settings',
    help: 'Help Center',
    supervisor: 'Supervisor Review',
    hr_admin: 'HR / Admin Desk',
    hr_dashboard: 'HR Dashboard',
    hr_dtr: 'DTR Management',
    dtr_records: 'DTR Records',
    attendance_history: 'Attendance History',
    hr_employees: 'Employee Management',
    hr_service_records: 'Service Records',
    hr_leave_records: 'Request Management',
    hr_records: 'Record Management System',
    hr_announcements: 'Announcements',
    hr_directory: 'Employee Records',
    hr_profile: 'HR/Admin Profile',
    notifications: 'Notifications',
    sms_log: 'SMS Log'
  };
  // HR/Admins and Supervisors use the web panels; supervisors only decide requests, so
  // they have no SMS list.
  const showSmsButton = !isWebOnlyRole || activeRole === 'hr_admin';
  const smsBadgeCount = isWebOnlyRole ? unseenSmsCount(smsAlerts, smsSeenAt) : smsAlerts.length;
  const goTo = view => {
    setShowNotifications(false);
    setShowSMSLogs(false);
    onViewChange(view);
  };

  const today = getManilaDateString();
  const approvedToday = type => activeRole === 'employee' && requests.some(r =>
    /approved/i.test(r?.status || '') && r?.type === type && requestCoversDate(r, today)
  );
  const todayStatus = approvedToday('Leave Request') ? 'on-leave'
    : approvedToday('Travel Order') ? 'on-travel'
    : null;
  const avatarDotClass = todayStatus === 'on-leave' ? 'bg-amber-400'
    : todayStatus === 'on-travel' ? 'bg-sky-400'
    : 'bg-emerald-400';

  return (
    <header className="h-[5.5rem] sm:h-20 bg-[#0B4EA2] border-b border-[#0B4EA2] px-3 sm:px-4 flex items-center justify-between sticky top-0 z-45 id-header shrink-0 font-sans">
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile: menu button + logo + app name */}
        <div className="sm:hidden flex items-center gap-3 min-w-0">
          {/* Mobile Menu Icon Button - hide for HR/Admin and Supervisor web-only roles */}
          {activeRole !== 'hr_admin' && activeRole !== 'supervisor' && (
            <button
              id="btn-mobile-menu"
              onClick={() => {
                setShowSMSLogs(false);
                setShowNotifications(false);
                onToggleSidebar();
              }}
              className="flex items-center justify-center text-white hover:text-white/80 transition-all cursor-pointer flex-shrink-0"
              title="Toggle Navigation Menu"
            >
              <Menu className="w-6 h-6" />
            </button>
          )}
          
          <div className="overflow-hidden flex items-center justify-center">
            <img src={logoImage} alt="DILG WorkMate" className="w-10 h-10 object-contain" />
          </div>
          <div className="min-w-0 leading-none">
            <p className="text-[10px] uppercase tracking-[0.28em] font-black text-white leading-none">DILG</p>
            <p className="text-[9px] uppercase tracking-[0.28em] font-bold text-white/90 mt-1 leading-none">WORKMATE</p>
          </div>
        </div>

        {/* Desktop/Web: blue marker + title */}
        <div className="hidden sm:flex items-center gap-3 min-w-0">
          <div className="w-1.5 h-5 rounded bg-white/90"></div>
          <h2 className="text-lg sm:text-2xl font-semibold text-white truncate">{viewTitles[currentView] || 'Dashboard'}</h2>
        </div>
      </div>

      {/* Header Tools */}
      <div className="flex items-center gap-2">
        <>
        {/* SMS Alerts Log Icon */}
        {showSmsButton && (
        <div className="relative" ref={smsRef}>
          <button
            id="btn-header-sms"
            onClick={() => {
              if (showFullScreenPanels) {
                setMobilePanel('sms');
                setShowSMSLogs(false);
                setShowNotifications(false);
                return;
              }
              if (isWebOnlyRole && !showSMSLogs) markSmsSeen();
              setShowSMSLogs(previous => !previous);
              setShowNotifications(false);
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white transition-all relative border border-white/30 bg-white/10 hover:bg-white/20 cursor-pointer"
            title={isWebOnlyRole ? 'SMS' : 'SMS Alerts Activity Feed'}
            aria-label={isWebOnlyRole && smsBadgeCount > 0 ? `SMS, ${smsBadgeCount} new failed text${smsBadgeCount === 1 ? '' : 's'} or replies` : 'SMS'}
          >
            <Mail className="w-5 h-5 text-white" />
            {smsBadgeCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#f43f5e] text-[9px] text-white font-bold rounded-full flex items-center justify-center shadow-lg">
                {smsBadgeCount}
              </span>
            )}
          </button>

          {showSMSLogs && isWebOnlyRole && (
            <div className="absolute right-0 mt-2 z-30 animate-in fade-in slide-in-from-top-3 duration-200">
              <SmsCenter
                variant="panel"
                smsAlerts={smsAlerts}
                employees={employees}
                smsConfigured={smsConfigured}
                onViewAll={() => goTo('sms_log')}
              />
            </div>
          )}

          {/* SMS Dropdown */}
          {showSMSLogs && !isWebOnlyRole && (
            <div className="absolute right-0 mt-2 w-[min(18rem,calc(100vw-1rem))] bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 z-30 animate-in fade-in slide-in-from-top-3 duration-200 text-slate-800">
              <div className="p-4 bg-gradient-to-r from-[#1e40af] to-indigo-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-sky-200" />
                  <span className="font-semibold text-[11px] col-auto">System SMS Logs</span>
                </div>
              </div>
              
              <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                {smsThreads.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs font-semibold">
                    No SMS alerts sent recently
                  </div>
                ) : (
                  smsThreads.map(thread => (
                    <div key={thread.recipient} className="border-b border-slate-100 p-2.5 text-left last:border-0">
                      <div className="flex items-center justify-between gap-2 font-bold text-slate-800">
                        <span className="truncate text-[#155e75] font-mono">{thread.recipient}</span>
                        <span className="shrink-0 text-[9px] font-normal text-slate-400">{thread.messages.length} message{thread.messages.length === 1 ? '' : 's'}</span>
                      </div>
                      <div className="mt-1 space-y-1.5">
                        {thread.messages.map((sms, index) => (
                            <div key={sms.id || `${thread.recipient}-${index}`} className={`rounded-md p-1.5 text-[10px] ${sms.direction === 'inbound' ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                            <div className="flex items-center justify-between gap-2 text-[9px] text-slate-400"><span>{sms.timestamp}</span><span className={`font-bold ${sms.direction === 'inbound' ? 'text-blue-600' : 'text-emerald-600'}`}>{sms.direction === 'inbound' ? 'Received' : 'Sent'}</span></div>
                            <p className="mt-0.5 leading-snug font-semibold text-slate-600">{sms.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="p-2 text-center bg-slate-50">
                <span className="text-[9px] text-slate-500 font-semibold">Attendance SMS logs</span>
              </div>
            </div>
          )}
        </div>
        )}

        {/* System Notifications Bell Icon */}
        <div className="relative" ref={notificationRef}>
          <button
            id="btn-header-bell"
            onClick={() => {
              if (showFullScreenPanels) {
                setMobilePanel('notifications');
                setShowSMSLogs(false);
                setShowNotifications(false);
                return;
              }
              setShowNotifications(previous => !previous);
              setShowSMSLogs(false);
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white transition-all relative border border-white/30 bg-white/10 hover:bg-white/20 cursor-pointer"
            title={isWebOnlyRole ? 'Notifications' : 'System Inbox'}
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          >
            <Bell className="w-5 h-5 text-white" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#f43f5e] text-[9px] text-white font-bold rounded-full flex items-center justify-center shadow-lg">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && isWebOnlyRole && (
            <div className="absolute right-0 mt-2 z-30 animate-in fade-in slide-in-from-top-3 duration-200">
              <NotificationCenter
                variant="panel"
                notifications={notifications}
                context={notificationContext}
                onMarkRead={onMarkNotificationRead}
                onMarkAllRead={onClearNotifications}
                onClearAll={onDismissNotifications}
                onAction={(notification, target) => {
                  setShowNotifications(false);
                  onNotificationAction?.(notification, target);
                }}
                onViewAll={() => goTo('notifications')}
              />
            </div>
          )}

          {/* Notifications Dropdown — desktop employees only */}
          {showNotifications && !isWebOnlyRole && (
            <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-1rem))] bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-30 animate-in fade-in slide-in-from-top-3 duration-200 text-slate-800">
              <div className="px-3.5 py-3 bg-gradient-to-r from-[#1e40af] to-[#0c348a] text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-indigo-200" />
                  <span className="font-semibold text-[12px]">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center leading-none">
                      {unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2.5">
                  {unreadCount > 0 && (
                    <button onClick={onClearNotifications} className="text-[10px] text-indigo-200 hover:text-white font-semibold transition-colors cursor-pointer">
                      Mark all read
                    </button>
                  )}
                  {notifications.length > 0 && onDismissNotifications && (
                    <button onClick={onDismissNotifications} title="Hide these notifications. Only new ones will show." className="text-[10px] text-indigo-200 hover:text-white font-semibold transition-colors cursor-pointer">
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs font-medium">
                    All clear! No pending notifications.
                  </div>
                ) : (
                  notifications.map(notif => {
                    const typeInfo = {
                      attendance:   { label: 'Attendance',   bg: 'bg-blue-100',  icon: <Clock className="w-3.5 h-3.5 text-blue-600" />,       chip: 'bg-blue-50 text-blue-700' },
                      request:      { label: 'Request',      bg: 'bg-amber-100', icon: <CircleDot className="w-3.5 h-3.5 text-amber-600" />,   chip: 'bg-amber-50 text-amber-700' },
                      announcement: { label: 'Announcement', bg: 'bg-green-100', icon: <Info className="w-3.5 h-3.5 text-green-600" />,         chip: 'bg-green-50 text-green-700' },
                      system:       { label: 'Account',      bg: 'bg-slate-100', icon: <ShieldAlert className="w-3.5 h-3.5 text-slate-500" />, chip: 'bg-slate-100 text-slate-600' },
                    }[notif.type] || { label: 'Account', bg: 'bg-slate-100', icon: <Info className="w-3.5 h-3.5 text-slate-500" />, chip: 'bg-slate-100 text-slate-600' };
                    // Opening a notification marks it read and goes to the page it is about.
                    const view = employeeNotificationView(notif);
                    return (
                      <div
                        key={notif.id}
                        onClick={() => {
                          if (!notif.read) onMarkNotificationRead(notif.id);
                          if (view) {
                            setShowNotifications(false);
                            onViewChange(view);
                          }
                        }}
                        className={`px-3 py-3 hover:bg-slate-50 transition-colors cursor-pointer flex gap-2.5 ${
                          !notif.read ? 'border-l-[3px] border-[#1e40af] bg-indigo-50/25' : 'border-l-[3px] border-transparent'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${typeInfo.bg}`}>
                          {typeInfo.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${typeInfo.chip}`}>
                              {typeInfo.label}
                            </span>
                            <time className="text-[9px] text-slate-400 whitespace-nowrap shrink-0">{notificationWhen(notif)}</time>
                          </div>
                          <p className="text-[12px] font-semibold text-slate-800 leading-snug">{notif.title}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug line-clamp-2">{notif.message}</p>
                          {!notif.read && (
                            <div className="mt-1 flex items-center gap-1 text-[9px] text-[#1e40af] font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#1e40af] animate-ping" />
                              {view ? 'Click to open' : 'Click to mark read'}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="px-3 py-2 text-center bg-slate-50 text-[9px] text-slate-400 border-t border-slate-100">
                Your notifications
              </div>
            </div>
          )}
        </div>
        </>

        {/* User Avatar */}
        <div className="relative">
          <button
            type="button"
            onClick={() => onViewChange('profile')}
            className="w-10 h-10 rounded-full border border-white/25 bg-white/10 flex items-center justify-center text-white shadow-sm hover:bg-white/15 transition-all"
            aria-label="Open profile"
          >
            {user.profilePicture ? (
              <img src={user.profilePicture} alt="Profile" className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <span className="text-[11px] font-black uppercase">{user.name.split(' ').map((n) => n[0]).join('').substring(0, 2)}</span>
            )}
          </button>
          {todayStatus && (
            <span className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[#0B4EA2] shadow-sm z-10 animate-pulse ${avatarDotClass}`} />
          )}
        </div>
      </div>
      {showFullScreenPanels && mobilePanel === 'sms' && (
        <MobileSmsPanel
          smsAlerts={smsAlerts}
          onClose={() => setMobilePanel(null)}
        />
      )}
      {showFullScreenPanels && mobilePanel === 'notifications' && (
        <MobileNotificationsPanel
          notifications={notifications}
          onClose={() => setMobilePanel(null)}
          onMarkNotificationRead={onMarkNotificationRead}
          onMarkAllRead={onClearNotifications}
          onOpenView={onViewChange}
        />
      )}
    </header>
  );
}
