/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useRef, useEffect } from 'react';
import { Bell, Mail, MessageSquare, ShieldAlert, CircleDot, Info, Calendar as CalendarIcon, Clock, Settings, User, Menu } from 'lucide-react';
import logoImage from '../assets/dilg-logo.png';
import MobileNotificationsPanel from './MobileNotificationsPanel';
import MobileSmsPanel from './MobileSmsPanel';

export default function Header({
  currentView,
  user,
  activeRole,
  notifications,
  smsAlerts,
  onMarkNotificationRead,
  onClearNotifications,
  onSendSms,
  onViewChange,
  onToggleSidebar,
  onLogout
}) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSMSLogs, setShowSMSLogs] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(null);
  
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
    hr_profile: 'HR/Admin Profile'
  };

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
        <div className="relative" ref={smsRef}>
          <button
            id="btn-header-sms"
            onClick={() => {
              if (isEmployeeMobileApp) {
                setMobilePanel('sms');
                setShowSMSLogs(false);
                setShowNotifications(false);
                return;
              }
              setShowSMSLogs(previous => !previous);
              setShowNotifications(false);
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:text-white hover:bg-[#facc15] transition-all relative border border-[#facc15] cursor-pointer bg-[#facc15]"
            title="SMS Alerts Activity Feed"
          >
            <Mail className="w-5 h-5 text-white" />
            {smsAlerts.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#f43f5e] text-[9px] text-white font-bold rounded-full flex items-center justify-center shadow-lg">
                {smsAlerts.length}
              </span>
            )}
          </button>

          {/* SMS Dropdown */}
          {showSMSLogs && (
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

        {/* System Notifications Bell Icon */}
        <div className="relative" ref={notificationRef}>
          <button
            id="btn-header-bell"
            onClick={() => {
              if (isEmployeeMobileApp) {
                setMobilePanel('notifications');
                setShowSMSLogs(false);
                setShowNotifications(false);
                return;
              }
              setShowNotifications(previous => !previous);
              setShowSMSLogs(false);
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:text-white hover:bg-[#facc15] transition-all relative border border-[#facc15] cursor-pointer bg-[#facc15]"
            title="System Inbox"
          >
            <Bell className="w-5 h-5 text-white" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#f43f5e] text-[9px] text-white font-bold rounded-full flex items-center justify-center shadow-lg">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-[min(18rem,calc(100vw-1rem))] bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 z-30 animate-in fade-in slide-in-from-top-3 duration-200 text-slate-800">
              <div className="p-4 bg-gradient-to-r from-[#1e40af] to-[#0c348a] text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-indigo-200" />
                  <span className="font-semibold text-[11px]">System Alerts</span>
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={onClearNotifications}
                    className="text-[11px] text-indigo-200 hover:text-white underline font-semibold transition-colors cursor-pointer"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              
              <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs font-semibold">
                    All clear! No pending notifications.
                  </div>
                ) : (
                  notifications.map(notif => (
                    <div
                      key={notif.id}
                      onClick={() => !notif.read && onMarkNotificationRead(notif.id)}
                      className={`p-2.5 hover:bg-slate-50 transition-colors cursor-pointer flex gap-2.5 text-[10px] text-left ${
                        !notif.read ? 'bg-indigo-50/40 border-l-2 border-[#1e40af]' : ''
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {notif.type === 'attendance' && <Clock className="w-4 h-4 text-[#1e40af]" />}
                        {notif.type === 'request' && <CircleDot className="w-4 h-4 text-emerald-600" />}
                        {notif.type === 'announcement' && <Info className="w-4 h-4 text-rose-600" />}
                        {notif.type === 'system' && <Info className="w-4 h-4 text-slate-500" />}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between font-bold text-slate-800">
                          <span>{notif.title}</span>
                          <span className="text-[10px] text-slate-500 font-normal">{notif.time}</span>
                        </div>
                        <p className="text-slate-650 leading-snug font-semibold">{notif.message}</p>
                        {!notif.read && (
                          <div className="text-[10px] text-[#1e40af] font-semibold flex items-center gap-1.5 pt-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#1e40af] animate-ping"></span>
                            Unread - Click to read
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              <div className="p-2 text-center bg-slate-50 text-[9px] text-slate-500 border-t border-slate-100" aria-hidden="true" />
            </div>
          )}
        </div>
        </>

        {/* User Avatar */}
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
      </div>
      {!isWebOnlyRole && isEmployeeMobileApp && mobilePanel === 'sms' && (
        <MobileSmsPanel
          smsAlerts={smsAlerts}
          onClose={() => setMobilePanel(null)}
          onSwitchToNotifications={() => setMobilePanel('notifications')}
        />
      )}
      {!isWebOnlyRole && isEmployeeMobileApp && mobilePanel === 'notifications' && (
        <MobileNotificationsPanel
          notifications={notifications}
          onClose={() => setMobilePanel(null)}
          onSwitchToSms={() => setMobilePanel('sms')}
          onMarkNotificationRead={onMarkNotificationRead}
        />
      )}
    </header>
  );
}
