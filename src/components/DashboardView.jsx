/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useEffect } from 'react';
import { getManilaDateString } from '../../shared/localDate';
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  FileCheck,
  LogIn,
  LogOut,
  MapPin,
  Plane,
  Megaphone,
  ShieldCheck,
  BookOpen,
  Users,
  ChevronRight,
  PhoneCall
} from 'lucide-react';
import backgroundImage from '../assets/login-bg.jpg';
import AttendanceTodayCard from './AttendanceTodayCard';
import { matchesAttendanceEmployee } from '../utils/attendanceIdentity';

const DashboardSection = ({ title, actionLabel, onAction, meta, children }) => (
  <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-slate-900">{title}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-slate-500">
        {meta ? <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.24em]">{meta}</div> : null}
        {actionLabel ? (
          <button
            onClick={onAction}
            className="text-xs font-bold text-[#0B4EA2] hover:text-blue-700 transition-colors"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
    <div className="px-4 pb-4">{children}</div>
  </section>
);

const TileButton = ({ icon: Icon, label, onClick, bgClass = 'bg-slate-50', textClass = 'text-slate-900', borderClass = 'border-slate-200', iconCircleClass = 'bg-white text-[#0B4EA2]' }) => (
  <button
    onClick={onClick}
    className={`rounded-[18px] border ${borderClass} ${bgClass} p-4 text-left transition hover:shadow-md hover:bg-white`}
  >
    <div className={`inline-flex items-center justify-center rounded-2xl shadow-sm w-11 h-11 ${iconCircleClass}`}>
      <Icon className="w-5 h-5" />
    </div>
    <p className={`mt-3 text-sm font-bold ${textClass}`}>{label}</p>
  </button>
);

const ProgressRow = ({ title, value, max, color }) => {
  const percent = Math.round((value / max) * 100);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
        <span>{title}</span>
        <span>{value}.0 days</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`${color} h-full rounded-full`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
};

export default function DashboardView({
  user,
  attendanceHistory = [],
  requests = [],
  announcements = [],
  events = [],
  onViewChange,
  onQuickAction
}) {
  const [elapsedText, setElapsedText] = useState('--');
  const [currentUtcTime, setCurrentUtcTime] = useState('');

  const today = getManilaDateString();
  const todayRecord = attendanceHistory.find(record => record.date === today && matchesAttendanceEmployee(record, user)) || {};
  const isOnDuty = todayRecord?.timeIn && !todayRecord?.timeOut;

  const formatDuration = (startTime, endTime) => {
    try {
      const [start, startPeriod] = startTime.split(' ');
      const [startHourStr, startMinuteStr] = start.split(':');
      const [end, endPeriod] = endTime.split(' ');
      const [endHourStr, endMinuteStr] = end.split(':');

      let startHour = Number(startHourStr);
      const startMinute = Number(startMinuteStr);
      let endHour = Number(endHourStr);
      const endMinute = Number(endMinuteStr);

      if (startPeriod === 'PM' && startHour !== 12) startHour += 12;
      if (startPeriod === 'AM' && startHour === 12) startHour = 0;
      if (endPeriod === 'PM' && endHour !== 12) endHour += 12;
      if (endPeriod === 'AM' && endHour === 12) endHour = 0;

      const startDate = new Date();
      startDate.setHours(startHour, startMinute, 0, 0);
      const endDate = new Date();
      endDate.setHours(endHour, endMinute, 0, 0);

      const diffMs = Math.max(0, endDate - startDate);
      const diffMins = Math.floor(diffMs / 60000);
      const hoursCount = Math.floor(diffMins / 60);
      const minsCount = diffMins % 60;
      return `${hoursCount}h ${minsCount}m`;
    } catch {
      return '--';
    }
  };

  useEffect(() => {
    if (!todayRecord?.timeIn || !todayRecord?.timeOut) {
      setElapsedText('--');
      return;
    }

    setElapsedText(formatDuration(todayRecord.timeIn, todayRecord.timeOut));
  }, [todayRecord?.timeIn, todayRecord?.timeOut]);

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setCurrentUtcTime(
        d.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const currentHour = new Date().getHours();
  const getGreeting = () => {
    if (currentHour < 12) return 'Good Morning';
    if (currentHour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const displayRegion = user?.region ? user.region.replace(/^DILG\s+/i, '') : 'Region IV-B (MIMAROPA)';
  const todayDateString = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const personalRequests = requests.filter((request) => matchesAttendanceEmployee(request, user));
  const pendingRequests = personalRequests.filter((req) => req.status === 'Pending');
  const approvedLeaveRequests = personalRequests.filter((request) => request.type === 'Leave Request' && request.status === 'Approved');
  // The server keeps the balance and deducts approved leave, so it is already the remaining balance.
  const availableVacationCredits = Number(user?.vacationLeaveCredits ?? 15);
  const personalAttendanceHistory = attendanceHistory.filter((record) => matchesAttendanceEmployee(record, user));
  const leaveCredits = [
    { title: 'Vacation Leave', max: 15, available: availableVacationCredits, color: 'bg-[#0B4EA2]' }
  ].map((credit) => {
    const used = approvedLeaveRequests
      .filter((request) => (request.leaveType || '').toLowerCase().includes(credit.title.toLowerCase().replace(' leave', '')))
      .reduce((total, request) => total + Number(request.workingDays || 0), 0);
    return { ...credit, used, remaining: Math.max(0, credit.available) };
  });
  const recentDocs = [
    { id: 'doc-1', title: 'Memorandum Circular 2026-015', subtitle: 'May 29, 2026 • PDF' },
    { id: 'doc-2', title: 'Travel Order - Lucena Seminar', subtitle: 'May 27, 2026 • PDF' },
    { id: 'doc-3', title: 'Service Record Summary', subtitle: 'May 26, 2026 • PDF' }
  ];

  // Upcoming Events lists the next three events from today on; announcements show newest first.
  const upcomingEvents = events
    .filter(event => (event.date || '') >= today)
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''))
    .slice(0, 3);
  const displayEvents = upcomingEvents;
  const newestAnnouncements = [...announcements].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const dashboardAnnouncements = newestAnnouncements;

  const currentAssignment = todayRecord.workAssignment || {
    location: 'Boac, Marinduque',
    barangayLgu: 'Barangay Mand LGU Coordination',
    task: 'Barangay Monitoring and LGU Coordination'
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans">
      <div className="w-full max-w-full mx-0 px-4 pb-16 pt-4 sm:px-5 pb-20 px-6">
        <div className="space-y-5">
          <div className="relative overflow-hidden rounded-[18px] border border-blue-200/60 bg-[radial-gradient(circle_at_85%_12%,rgba(239,68,68,0.55),transparent_30%),radial-gradient(circle_at_15%_85%,rgba(30,64,175,0.65),transparent_32%),linear-gradient(120deg,#133c74_0%,#1d4f9d_50%,#871d1d_100%)] shadow-sm text-white">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_15%,rgba(255,255,255,0.08),transparent_24%)]" />
            <div className="absolute inset-0 bg-cover bg-center opacity-45 mix-blend-multiply" style={{ backgroundImage: `url(${backgroundImage})` }} />
            <div className="absolute inset-0 bg-slate-900/5" />
            <div className="relative px-4 py-4 sm:px-5 sm:py-5">
              <p className="text-sm tracking-[0.35em] text-slate-200/70">{getGreeting()},</p>
              <h1 className="mt-2 text-2xl sm:text-[2.25rem] font-extrabold tracking-tight leading-snug">
                <span className="block">{user?.name || 'Employee'}</span>
              </h1>
              <div className="mt-3 flex flex-col items-start gap-2 text-slate-100">
                <p className="inline-flex items-center gap-2 text-xs font-semibold sm:text-sm"><MapPin className="w-4 h-4" />{displayRegion}</p>
                <p className="inline-flex items-center gap-2 text-xs font-semibold sm:text-sm"><ShieldCheck className="w-4 h-4" />{user?.office || 'Marinduque Provincial Office'}</p>
              </div>
            </div>
          </div>

          <DashboardSection
            title="Attendance Today"
            onAction={() => onViewChange('attendance')}
            meta={
              <>
                <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[8px] font-medium tracking-[0.28em] text-slate-500">{todayDateString}</span>
              </>
            }
          >
            <AttendanceTodayCard
              user={user}
              todayRecord={todayRecord}
              elapsedText={elapsedText}
              currentUtcTime={currentUtcTime}
              onViewDetails={() => onViewChange('attendance')}
            />
          </DashboardSection>

          <DashboardSection title="Quick Actions">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <TileButton
                icon={Clock}
                label="Attendance"
                onClick={() => onQuickAction('attendance')}
                bgClass="bg-[#e7f0ff] border-[#0B4EA2]/25"
                textClass="text-slate-900"
                iconCircleClass="bg-[#0B4EA2] text-white"
              />
              <TileButton
                icon={FileCheck}
                label="Requests"
                onClick={() => onQuickAction('requests')}
                bgClass="bg-[#fde7ec] border-[#dc2626]/25"
                textClass="text-slate-900"
                iconCircleClass="bg-[#dc2626] text-white"
              />
              <TileButton
                icon={CalendarDays}
                label="Calendar"
                onClick={() => onQuickAction('calendar')}
                bgClass="bg-[#e7f9ef] border-[#16a34a]/25"
                textClass="text-slate-900"
                iconCircleClass="bg-[#16a34a] text-white"
              />
              <TileButton
                icon={BookOpen}
                label="Documents"
                onClick={() => onQuickAction('documents')}
                bgClass="bg-[#fff7db] border-[#d97706]/25"
                textClass="text-slate-900"
                iconCircleClass="bg-[#d97706] text-white"
              />
            </div>
          </DashboardSection>

          <DashboardSection title="My Requests" actionLabel="View All" onAction={() => onViewChange('requests')}>
            <div className="space-y-3">
              {personalRequests.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  No requests submitted yet.
                </p>
              ) : personalRequests.slice(0, 3).map((request) => {
                const isLeave = request.type === 'Leave Request';
                const r = {
                  id: request.id,
                  label: isLeave ? 'Leave' : 'Travel Order',
                  status: request.status || 'Pending',
                  color: request.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
                  icon: isLeave ? FileCheck : Plane,
                  iconBg: isLeave ? 'bg-amber-50' : 'bg-emerald-50',
                  iconText: isLeave ? 'text-amber-700' : 'text-emerald-700'
                };
                const Icon = r.icon;
                return (
                  <button
                    key={r.id}
                    onClick={() => onViewChange('requests')}
                    className="w-full rounded-[18px] border border-slate-200 bg-slate-50 p-4 flex items-center justify-between hover:shadow-sm"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`inline-flex items-center justify-center rounded-2xl w-10 h-10 ${r.iconBg} shadow-sm`}>
                        <Icon className={`w-5 h-5 ${r.iconText}`} />
                      </div>
                      <div className="text-sm font-semibold text-slate-900">{r.label}</div>
                    </div>
                    <div className={`inline-flex items-center gap-2 ${r.color} px-3 py-1 rounded-full text-sm font-bold`}>
                      <span>{r.status}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-700" />
                    </div>
                  </button>
                );
              })}
            </div>
          </DashboardSection>

          {/* Removed Pending Requests and Announcements sections per request */}

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <div className="space-y-3">
              <DashboardSection title="Leave Credits" actionLabel="View Details" onAction={() => onViewChange('requests')}>
                <div className="space-y-4">
                  {leaveCredits.map((credit) => (
                    <ProgressRow
                      key={credit.title}
                      title={credit.title}
                      value={credit.remaining}
                      max={credit.max}
                      color={credit.color}
                    />
                  ))}
                </div>
              </DashboardSection>

              <DashboardSection title="Attendance This Month">
                {(() => {
                  const now = new Date();
                  const year = now.getFullYear();
                  const monthIndex = now.getMonth();
                  const ym = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
                  const monthRecords = personalAttendanceHistory.filter((r) => r.date && r.date.startsWith(ym));
                  const todayDate = new Date(year, monthIndex, now.getDate());
                  const elapsedWorkdays = Array.from({ length: todayDate.getDate() }, (_, index) => {
                    const date = new Date(year, monthIndex, index + 1);
                    return date.getDay() !== 0 && date.getDay() !== 6;
                  }).filter(Boolean).length;

                  const wfhCount = monthRecords.filter((r) => /wfh/i.test(r.mode || '') || /wfh/i.test(r.status || '')).length;
                  const fieldCount = monthRecords.filter((r) => /field/i.test(r.mode || '') || /field/i.test(r.status || '')).length;
                  const lateCount = monthRecords.filter((r) => Boolean(r.late) || /late/i.test(r.status || '')).length;
                  const presentCount = monthRecords.filter((r) => {
                    const attended = (r.timeIn && r.timeOut) || /present/i.test(r.status || '');
                    const isWfh = /wfh/i.test(r.mode || '') || /wfh/i.test(r.status || '');
                    const isField = /field/i.test(r.mode || '') || /field/i.test(r.status || '');
                    return attended && !isWfh && !isField && !r.late && !/late/i.test(r.status || '');
                  }).length;
                  const attendedDates = new Set(
                    monthRecords
                      .filter((r) => r.timeIn || r.status || r.mode)
                      .map((r) => r.date)
                  );
                  const absentCount = monthRecords.length > 0
                    ? Math.max(0, elapsedWorkdays - attendedDates.size)
                    : 0;

                  const segments = [
                    { key: 'Present', value: presentCount, color: '#10b981' },
                    { key: 'WFH', value: wfhCount, color: '#2563eb' },
                    { key: 'Field Work', value: fieldCount, color: '#f97316' },
                    { key: 'Late', value: lateCount, color: '#f59e0b' },
                    { key: 'Absent', value: absentCount, color: '#ef4444' }
                  ];

                  const total = Math.max(elapsedWorkdays, segments.reduce((sum, item) => sum + item.value, 0), 1);
                  const presentDegrees = (presentCount / total) * 360;
                  const wfhDegrees = (wfhCount / total) * 360;
                  const fieldDegrees = (fieldCount / total) * 360;
                  const lateDegrees = (lateCount / total) * 360;
                  const absentDegrees = (absentCount / total) * 360;
                  const attendanceRate = elapsedWorkdays ? (
                    ((presentCount + wfhCount + fieldCount + lateCount) / elapsedWorkdays) * 100
                  ).toFixed(0) : '0';

                  return (
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-8 md:justify-start">
                      <div
                        className="relative h-44 w-44 shrink-0 rounded-full"
                        style={{
                          background: `conic-gradient(#10b981 0deg ${presentDegrees}deg, #2563eb ${presentDegrees}deg ${presentDegrees + wfhDegrees}deg, #f97316 ${presentDegrees + wfhDegrees}deg ${presentDegrees + wfhDegrees + fieldDegrees}deg, #f59e0b ${presentDegrees + wfhDegrees + fieldDegrees}deg ${presentDegrees + wfhDegrees + fieldDegrees + lateDegrees}deg, #ef4444 ${presentDegrees + wfhDegrees + fieldDegrees + lateDegrees}deg 360deg)`
                        }}
                      >
                        <div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-white shadow-inner">
                          <strong className="text-2xl font-black text-slate-900">{attendanceRate}%</strong>
                          <span className="text-[10px] font-bold text-slate-500">Monthly Rate</span>
                        </div>
                      </div>

                      <div className="grid min-w-[210px] gap-3 text-sm">
                        {segments.map((segment) => (
                          <div key={segment.key} className="flex items-center justify-between gap-8">
                            <span className="flex items-center gap-2 font-semibold text-slate-600">
                              <i className="h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }} />
                              {segment.key}
                            </span>
                            <strong className="text-lg text-slate-900">{segment.value}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </DashboardSection>
            </div>

            <DashboardSection title="Announcements" actionLabel="View All" onAction={() => onViewChange('announcements')}>
              <div className="space-y-3">
                {dashboardAnnouncements.slice(0, 3).map((ann) => (
                  <button
                    key={ann.id}
                    onClick={() => onViewChange('announcements')}
                    className="w-full rounded-[18px] border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-300"
                  >
                    <p className="text-sm font-semibold text-slate-900">{ann.title}</p>
                    <p className="mt-1 text-[12px] text-slate-600">{ann.content || ann.description}</p>
                  </button>
                ))}
                {dashboardAnnouncements.length === 0 && <p className="text-sm text-slate-500">No announcements available.</p>}
              </div>
            </DashboardSection>

            <DashboardSection title="Upcoming Events" actionLabel="See Calendar" onAction={() => onViewChange('calendar')}>
              <div className="space-y-3">
                {displayEvents.length === 0 && <p className="text-sm text-slate-500">No upcoming events.</p>}
                {displayEvents.map((event) => (
                  <div key={event.id} className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                    <p className="mt-1 text-[12px] text-slate-600">{new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • {event.time}</p>
                    <p className="mt-2 text-[12px] text-slate-500">{event.location}</p>
                  </div>
                ))}
              </div>
            </DashboardSection>

          </div>

          {/* Quick Links and Emergency Contacts removed per request */}
        </div>
      </div>
    </div>
  );
}
