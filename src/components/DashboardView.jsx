/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { getManilaDateString } from '../../shared/localDate';
import {
  CalendarDays,
  Clock,
  FileCheck,
  MapPin,
  Plane,
  ShieldCheck,
  BookOpen,
  ChevronRight
} from 'lucide-react';
import backgroundImage from '../assets/login-bg.jpg';
import AttendanceTodayCard from './AttendanceTodayCard';
import { matchesAttendanceEmployee } from '../utils/attendanceIdentity';
import { monthAttendanceSummary } from '../utils/hrAttendance';

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

const STATUS_COLORS = {
  Approved: 'bg-emerald-100 text-emerald-700',
  Pending: 'bg-amber-100 text-amber-700',
  Rejected: 'bg-rose-100 text-rose-700',
  Withdrawn: 'bg-slate-200 text-slate-600',
  Draft: 'bg-slate-200 text-slate-600'
};

// A request's dates, such as "Oct 5" or "Oct 5 – Oct 7".
const requestDates = request => {
  const format = value => {
    const day = typeof value === 'string' ? value.slice(0, 10) : '';
    return /^\d{4}-\d{2}-\d{2}$/.test(day)
      ? new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : '';
  };
  const start = format(request.startDate);
  const end = format(request.endDate);
  return end && end !== start ? `${start} – ${end}` : start;
};

// Leave balances accrue in fractions (1.25 days a month), so "15.0" or "16.25", never "16.25.0".
const formatDays = value => (Number.isInteger(value) ? value.toFixed(1) : String(Number(value.toFixed(3))));

const ProgressRow = ({ title, value, max, color }) => {
  const percent = Math.round((value / max) * 100);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
        <span>{title}</span>
        <span>{formatDays(value)} days</span>
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
  const personalAttendanceHistory = attendanceHistory.filter((record) => matchesAttendanceEmployee(record, user));
  // The server keeps each balance and deducts approved leave, so it is already the
  // remaining balance. Balances can exceed one year's 15 days when credits accumulate.
  const leaveCredits = [
    { title: 'Vacation Leave', available: Number(user?.vacationLeaveCredits ?? 15), color: 'bg-[#0B4EA2]' },
    { title: 'Sick Leave', available: Number(user?.sickLeaveCredits ?? 15), color: 'bg-emerald-600' }
  ].map((credit) => {
    const remaining = Math.max(0, credit.available);
    return { ...credit, remaining, max: Math.max(15, remaining) };
  });

  // Upcoming Events lists the next three events from today on; announcements show newest first.
  const upcomingEvents = events
    .filter(event => (event.date || '') >= today)
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''))
    .slice(0, 3);
  const newestAnnouncements = [...announcements].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

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
                const status = request.status || 'Pending';
                const Icon = isLeave ? FileCheck : Plane;
                const details = [
                  isLeave && request.leaveType && request.leaveType !== 'N/A' ? request.leaveType : '',
                  requestDates(request)
                ].filter(Boolean).join(' · ');
                return (
                  <button
                    key={request.id}
                    onClick={() => onViewChange('requests')}
                    className="w-full rounded-[18px] border border-slate-200 bg-slate-50 p-4 flex items-center justify-between gap-3 text-left hover:shadow-sm"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <div className={`inline-flex shrink-0 items-center justify-center rounded-2xl w-10 h-10 ${isLeave ? 'bg-amber-50' : 'bg-emerald-50'} shadow-sm`}>
                        <Icon className={`w-5 h-5 ${isLeave ? 'text-amber-700' : 'text-emerald-700'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">{isLeave ? 'Leave' : 'Travel Order'}</div>
                        {details && <div className="truncate text-xs text-slate-500">{details}</div>}
                      </div>
                    </div>
                    <div className={`inline-flex shrink-0 items-center gap-2 ${STATUS_COLORS[status] || STATUS_COLORS.Pending} px-3 py-1 rounded-full text-sm font-bold`}>
                      <span>{status}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-700" />
                    </div>
                  </button>
                );
              })}
            </div>
          </DashboardSection>

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
                  const summary = monthAttendanceSummary(user, { records: personalAttendanceHistory, requests: personalRequests, today });
                  const segments = [
                    { key: 'Present', value: summary.present, color: '#10b981' },
                    { key: 'WFH', value: summary.wfh, color: '#2563eb' },
                    { key: 'Field Work', value: summary.field, color: '#f97316' },
                    { key: 'Late', value: summary.late, color: '#f59e0b' },
                    { key: 'On Leave / Travel', value: summary.leave, color: '#8b5cf6' },
                    { key: 'Absent', value: summary.absent, color: '#ef4444' }
                  ];

                  // Each kind of day takes its share of the ring; a month with no days yet is gray.
                  const total = segments.reduce((sum, item) => sum + item.value, 0);
                  let start = 0;
                  const slices = segments.filter(item => item.value > 0).map(item => {
                    const end = start + (item.value / total) * 360;
                    const slice = `${item.color} ${start}deg ${end}deg`;
                    start = end;
                    return slice;
                  });

                  return (
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-8 md:justify-start">
                      <div
                        className="relative h-44 w-44 shrink-0 rounded-full"
                        style={{ background: slices.length ? `conic-gradient(${slices.join(', ')})` : '#e2e8f0' }}
                      >
                        <div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-white shadow-inner">
                          <strong className="text-2xl font-black text-slate-900">{summary.rate === null ? '--' : `${summary.rate}%`}</strong>
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
                {newestAnnouncements.slice(0, 3).map((ann) => (
                  <button
                    key={ann.id}
                    onClick={() => onViewChange('announcements')}
                    className="w-full rounded-[18px] border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-300"
                  >
                    <p className="text-sm font-semibold text-slate-900">{ann.title}</p>
                    <p className="mt-1 text-[12px] text-slate-600">{ann.content || ann.description}</p>
                  </button>
                ))}
                {newestAnnouncements.length === 0 && <p className="text-sm text-slate-500">No announcements available.</p>}
              </div>
            </DashboardSection>

            <DashboardSection title="Upcoming Events" actionLabel="See Calendar" onAction={() => onViewChange('calendar')}>
              <div className="space-y-3">
                {upcomingEvents.length === 0 && <p className="text-sm text-slate-500">No upcoming events.</p>}
                {upcomingEvents.map((event) => (
                  <div key={event.id} className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                    <p className="mt-1 text-[12px] text-slate-600">{new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • {event.time}</p>
                    <p className="mt-2 text-[12px] text-slate-500">{event.location}</p>
                  </div>
                ))}
              </div>
            </DashboardSection>

          </div>

        </div>
      </div>
    </div>
  );
}
