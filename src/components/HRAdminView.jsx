/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState } from 'react';
import { getManilaDateString } from '../../shared/localDate';
import {
  Activity,
  ArrowRight,
  Clock,
  MapPin,
  Plane,
  ShieldAlert,
  Edit2,
  CheckCircle,
  FileCheck,
  Search,
  Sliders,
  Download,
  AlertCircle,
  Printer,
  FileText,
  CheckCircle2,
  XCircle,
  Eye,
  Users,
  UserPlus,
  FolderKanban,
  CalendarDays,
  ContactRound,
  UserCircle,
  LockKeyhole,
  Bell,
  Settings
} from 'lucide-react';
import CSCForm6Preview from './CSCForm6Preview';
import TravelOrderPreview from './TravelOrderPreview';
import HRAdminDashboard from './HRAdminDashboard';
import HRAdminAttendanceView from './HRAdminAttendanceView';
import HRAdminDTRRecordsView from './HRAdminDTRRecordsView';
import HRAdminAttendanceHistoryView from './HRAdminAttendanceHistoryView';
import HRAdminRequestsView from './HRAdminRequestsView';
import HRAdminEmployeesView from './HRAdminEmployeesView';
import HRAdminProfileView from './HRAdminProfileView';
import HRAnnouncementsManager from './HRAnnouncementsManager';
import HRStaffAccountsView from './HRStaffAccountsView';
import HRAdminRecordsView from './HRAdminRecordsView';
import { matchesAttendanceEmployee } from '../utils/attendanceIdentity';
import HRFaceComparison from './HRFaceComparison';
import { describeFingerprintCheck } from '../utils/fingerprintMessages';
import { hasSelfie } from '../utils/hrAttendance';

export default function HRAdminView({
  section = 'hr_dashboard',
  user = {},
  employees = [],
  attendanceHistory = [],
  attendanceFrom,
  loadedAttendanceMonths = [],
  onLoadAttendanceMonth,
  onUpdateAttendance,
  requests = [],
  onUpdateRequests,
  onUpdateRequestStatus,
  onViewChange,
  onEmployeesChange,
  onUpdateUser,
  onAdminNotification,
  announcements = [],
  events = [],
  onCreateAnnouncement,
  onUpdateAnnouncement,
  onDeleteAnnouncement,
  onCreateEvent,
  onUpdateEvent,
  onDeleteEvent
}) {
  const sectionTabs = {
    hr_dashboard: 'dashboard',
    hr_dtr: 'dtr',
    dtr_records: 'dtr_records',
    hr_employees: 'directory',
    hr_leave_records: 'requests',
    hr_announcements: 'announcements',
    hr_directory: 'directory',
    hr_records: 'records',
    hr_profile: 'profile'
  };
  const [activeTab, setActiveTab] = useState(sectionTabs[section] || 'dashboard');
  const [directoryView, setDirectoryView] = useState('employees');
  const [dtrSearch, setDtrSearch] = useState('');
  const [dtrFilterDate, setDtrFilterDate] = useState('');
  const [dtrMode, setDtrMode] = useState('all');
  const [requestsSearch, setRequestsSearch] = useState('');
  const [requestsFilterStatus, setRequestsFilterStatus] = useState('All');
  const [selectedFormRequest, setSelectedFormRequest] = useState(null);
  const [selectedDtrRecord, setSelectedDtrRecord] = useState(null);
  const [selectedVerificationPhoto, setSelectedVerificationPhoto] = useState(null);
  const [editTimeIn, setEditTimeIn] = useState('');
  const [editTimeOut, setEditTimeOut] = useState('');
  const [editStatus, setEditStatus] = useState('Present');
  const [editLocation, setEditLocation] = useState('');
  const [editTask, setEditTask] = useState('');
  const [baseVacationCredit, setBaseVacationCredit] = useState(78.75);
  const [baseSickCredit, setBaseSickCredit] = useState(86.75);
  const [watermarkText, setWatermarkText] = useState('OFFICIAL DILG WORKMATE');
  const [officialOICName, setOfficialOICName] = useState('JOHN ERICK J. MATINING');
  const [officialDirectorName, setOfficialDirectorName] = useState('GERMAN F. YAP, CESO V');
  const [toastMsg, setToastMsg] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [generatedReportUrl, setGeneratedReportUrl] = useState(null);

  React.useEffect(() => {
    setActiveTab(sectionTabs[section] || 'dashboard');
  }, [section]);

  const triggerToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg('');
    }, 4000);
  };

  const handleOpenDtrEdit = (record) => {
    setSelectedDtrRecord(record);
    setEditTimeIn(record.timeIn || '');
    setEditTimeOut(record.timeOut || '');
    setEditStatus(record.status || 'Present');
    setEditLocation(record.location || record.workAssignment?.location || '');
    setEditTask(record.workAssignment?.task || '');
  };

  const handleCloseDtrEdit = () => {
    setSelectedDtrRecord(null);
  };

  const saveAttendanceUpdate = async (updatedHistory, notification, successMessage) => {
    try {
      if (!onUpdateAttendance) throw new Error('Attendance saving is unavailable. Please refresh and try again.');
      await onUpdateAttendance(updatedHistory);
      onAdminNotification?.(notification);
      triggerToast(successMessage);
      return true;
    } catch (error) {
      triggerToast(error.message || 'Unable to save attendance changes. Please try again.');
      return false;
    }
  };

  // DTR saves send only the changed records and fields ({ id, ...changes }), so records
  // updated elsewhere since this page loaded (for example, a new Time Out) are not overwritten.
  const handleSaveDTRCorrection = async () => {
    if (!selectedDtrRecord) return;
    const rec = attendanceHistory.find(record => record.id === selectedDtrRecord.id) || selectedDtrRecord;

    const saved = await saveAttendanceUpdate([{
      id: rec.id,
      timeIn: editTimeIn,
      timeOut: editTimeOut || null,
      status: editStatus,
      location: editLocation,
      workAssignment: {
        ...rec.workAssignment,
        location: editLocation,
        task: editTask
      },
      verificationAudit: {
        verifiedBy: 'DILG HR Admin Desk',
        verifiedAt: getManilaDateString(),
        originalTimeIn: rec.timeIn,
        originalTimeOut: rec.timeOut
      },
      gpsStatus: 'In Range'
    }], {
      title: 'DTR Correction Verified',
      message: `Attendance record ${selectedDtrRecord.id} was corrected and verified by HR/Admin.`,
      time: 'Just now',
      type: 'attendance'
    }, `Successfully corrected record ID: ${selectedDtrRecord.id}. Marked as Verified.`);
    if (saved) setSelectedDtrRecord(null);
  };

  const handleQuickVerifyDTR = async (id) => {
    await saveAttendanceUpdate([{
      id,
      verificationAudit: {
        verifiedBy: 'DILG HR Admin Desk',
        verifiedAt: getManilaDateString()
      }
    }], {
      title: 'DTR Verification Applied',
      message: `Attendance record ${id} was verified by HR/Admin.`,
      time: 'Just now',
      type: 'attendance'
    }, 'DTR row verified successfully. Certification status stamp applied.');
  };

  const handleValidateDTR = async () => {
    const updates = attendanceHistory
      .filter(record => !record.verificationAudit?.verifiedAt)
      .map(record => ({
        id: record.id,
        verificationAudit: {
          ...(record.verificationAudit || {}),
          verifiedBy: 'DILG HR Admin Desk',
          verifiedAt: getManilaDateString()
        }
      }));
    if (updates.length === 0) {
      triggerToast('All visible records are already verified.');
      setDtrMode('verified');
      return;
    }
    const saved = await saveAttendanceUpdate(updates, {
      title: 'DTR Batch Verification',
      message: 'All visible attendance records were validated and marked as verified by HR/Admin.',
      time: 'Just now',
      type: 'attendance'
    }, 'DTR validation completed. All visible records are marked verified.');
    if (!saved) return;
    setDtrMode('verified');
  };

  // Saves one request's review decision. Other requests are not sent or changed.
  const handleUpdateRequestStatusByAdmin = async (requestId, newStatus, updatePayload = {}) => {
    const today = getManilaDateString();
    const req = requests.find(item => item.id === requestId);
    if (!req) return;

    try {
      await onUpdateRequestStatus(requestId, {
        status: newStatus,
        approver: 'DILG HR Admin Desk',
        remarks: updatePayload.remarks || req.remarks || 'Reviewed by HR Admin Desk.',
        directorSignature: req.directorSignature || req.signatureData || '',
        directorRemarks: req.directorRemarks || updatePayload.remarks || req.remarks || 'Reviewed by HR Admin Desk.',
        directorApprovedAt: today,
        directorName: officialDirectorName || 'GERMAN F. YAP, CESO V'
      });
    } catch (error) {
      triggerToast(error.message || 'Unable to save the request status. Please try again.');
      return;
    }
    onAdminNotification?.({
      title: 'Request Status Updated',
      message: `Service Request ${requestId} has been marked as ${newStatus} by HR/Admin.`,
      time: 'Just now',
      type: 'request'
    });
    triggerToast(`Service Request ID ${requestId} has been marked as ${newStatus}.`);
  };

  const handleSaveTemplateControls = () => {
    triggerToast('DILG official document templates & approval names settings applied globally.');
  };

  const handleGeneratePDFReports = () => {
    setGeneratingReport(true);
    setGeneratedReportUrl(null);

    setTimeout(() => {
      setGeneratingReport(false);
      const randomID = Math.floor(100000 + Math.random() * 900000);
      // Report generation is not built yet; this produces a clearly labelled sample file.
      setGeneratedReportUrl(`DILG_REPORT_SAMPLE_${randomID}.txt`);
      triggerToast('Sample report ready. Report generation is not available yet, so this file contains no records.');
    }, 2000);
  };

  const handleDownloadArchive = () => {
    if (!generatedReportUrl) return;

    const content = `SAMPLE ONLY - NOT AN OFFICIAL DILG RECORD\n` +
      `Generated on: ${new Date().toLocaleString()}\n\n` +
      `Report generation is not available yet. This file does not contain any DTR, CSC Form 6, or travel order records.`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = generatedReportUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    triggerToast(`Successfully downloaded official archive: ${generatedReportUrl}`);
  };

  const filteredDTRHistory = attendanceHistory.filter((rec) => {
    const matchesDate = dtrFilterDate ? rec.date === dtrFilterDate : true;
    const hasIssue = !rec.timeIn || !rec.timeOut || !hasSelfie(rec) || !rec.fingerprintVerified;
    const matchesMode = dtrMode === 'issues' ? hasIssue : dtrMode === 'verified' ? !hasIssue : true;
    const matchesText = `${rec.location || rec.workAssignment?.location || ''} ${rec.workAssignment?.task || ''} ${rec.id}`
      .toLowerCase()
      .includes(dtrSearch.toLowerCase());
    return matchesDate && matchesText && matchesMode;
  });

  const getEmployeeForRecord = record => employees.find(employee => matchesAttendanceEmployee(record, employee));

  const filteredRequests = requests.filter((req) => {
    const matchesStatus = requestsFilterStatus === 'All' ? true : req.status === requestsFilterStatus;
    const searchLower = requestsSearch.toLowerCase();
    const matchesText = (
      req.id.toLowerCase().includes(searchLower) ||
      (req.employeeName || '').toLowerCase().includes(searchLower) ||
      (req.type || '').toLowerCase().includes(searchLower) ||
      (req.purpose || '').toLowerCase().includes(searchLower)
    );
    return matchesStatus && matchesText;
  });

  const presentCount = attendanceHistory.filter(record => record.status !== 'Absent').length;
  const absentCount = attendanceHistory.filter(record => record.status === 'Absent').length;
  const dtrIssueRecords = attendanceHistory.filter(record => !record.timeIn || !record.timeOut || !hasSelfie(record) || !record.fingerprintVerified);
  const pendingRequests = requests.filter(request => request.status === 'Pending');
  const leaveRecords = requests.filter(request => request.type === 'Leave Request');
  const today = getManilaDateString();
  const todayAttendance = attendanceHistory.filter(record => record.date === today);
  const presentToday = employees.filter(employee => {
    const record = todayAttendance.find(item => matchesAttendanceEmployee(item, employee));
    return record?.status !== 'Absent' && Boolean(record?.timeIn);
  }).length;
  const absentToday = Math.max(0, employees.length - presentToday);
  const lateToday = todayAttendance.filter(record => record.late || /late/i.test(record.status || '')).length;
  const onLeave = requests.filter(request => request.status === 'Approved' && request.type === 'Leave Request').length;
  const onTravel = requests.filter(request => request.status === 'Approved' && request.type === 'Travel Order').length;
  const geofenceAlerts = attendanceHistory.filter(record => record.gpsStatus && !/in range/i.test(record.gpsStatus)).length;
  const recentActivities = [
    { label: 'New employee added', detail: employees[employees.length - 1]?.name || 'No recent record', Icon: UserPlus },
    { label: 'Leave request submitted', detail: leaveRecords[leaveRecords.length - 1]?.id || 'No recent record', Icon: CalendarDays },
    { label: 'Travel order submitted', detail: requests.filter(request => request.type === 'Travel Order').slice(-1)[0]?.id || 'No recent record', Icon: FileText },
    { label: 'DTR issue detected', detail: dtrIssueRecords[0]?.id || 'No recent record', Icon: AlertCircle },
    { label: 'Geofence alert', detail: geofenceAlerts ? `${geofenceAlerts} alert(s)` : 'No recent alert', Icon: ShieldAlert }
  ];
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? 'Good Morning' : currentHour < 18 ? 'Good Afternoon' : 'Good Evening';
  const totalEmployees = employees.length;
  const attendanceRate = totalEmployees ? Math.round((presentToday / totalEmployees) * 1000) / 10 : 0;
  const missingTimeOut = todayAttendance.filter(record => record.timeIn && !record.timeOut).length;
  const missingTimeIn = todayAttendance.filter(record => !record.timeIn && record.status !== 'Absent').length;
  const incompleteRecords = Math.max(0, dtrIssueRecords.length - missingTimeOut - missingTimeIn);
  const geofenceRecords = attendanceHistory.filter(record => record.gpsStatus && !/in range/i.test(record.gpsStatus));
  const returnedRequests = requests.filter(request => request.status === 'Rejected' || request.status === 'Returned');
  const pendingLeave = requests.filter(request => request.status === 'Pending' && request.type === 'Leave Request').length;
  const pendingTravel = requests.filter(request => request.status === 'Pending' && request.type === 'Travel Order').length;
  const formatEmployeeName = (record) => getEmployeeForRecord(record)?.name || record.employeeName || 'Registered employee';

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 pb-24 font-sans sm:p-8 sm:pb-8 id-hradmin-system-view">
      {toastMsg && (
        <div className="bg-blue-50 border border-blue-200 text-blue-850 p-4 rounded-xl flex items-center gap-3 shadow-sm animate-fadeIn">
          <CheckCircle className="w-5 h-5 text-blue-600 shrink-0" />
          <span className="font-bold text-xs">{toastMsg}</span>
        </div>
      )}

      {activeTab === 'dashboard' && <HRAdminDashboard
        user={user}
        employees={employees}
        attendanceHistory={attendanceHistory}
        requests={requests}
        onOpenTab={(tab) => {
          const route = tab === 'directory' ? 'hr_employees' : tab === 'dtr' ? 'hr_dtr' : tab === 'requests' ? 'hr_leave_records' : tab;
          onViewChange?.(route);
        }}
      />}

      {false && activeTab === 'dashboard' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
            <div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Official HR workspace</p><h2 className="mt-1 text-2xl font-black text-slate-900">{greeting}, {user?.name || 'Admin'}</h2><p className="mt-1 text-sm text-slate-500">Here's your office attendance and request overview for today.</p></div>
            <p className="text-xs font-bold text-slate-400">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              ['Total Employees', totalEmployees, Users, `${employees.filter(employee => employee.createdAt && new Date(employee.createdAt).getMonth() === new Date().getMonth()).length} new this month`, 'hr_directory', 'Employee Directory'],
              ['Present Today', presentToday, CheckCircle, `${attendanceRate}% of employees`, 'hr_dtr', 'View Attendance'],
              ['Absent Today', absentToday, XCircle, `${totalEmployees ? Math.round((absentToday / totalEmployees) * 1000) / 10 : 0}% of employees`, 'hr_dtr', 'View Records'],
              ['Late Today', lateToday, AlertCircle, `${totalEmployees ? Math.round((lateToday / totalEmployees) * 1000) / 10 : 0}% of employees`, 'hr_dtr', 'View Late Records']
            ].map(([label, value, Icon, hint, target, action]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between"><Icon className="h-5 w-5 text-indigo-600" /><span className="text-2xl font-black text-slate-900">{value}</span></div><p className="mt-4 text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-[10px] text-slate-400">{hint}</p><button onClick={() => setActiveTab(sectionTabs[target] || 'directory')} className="mt-3 inline-flex items-center gap-1 text-[10px] font-black text-indigo-700">{action}<ArrowRight className="h-3 w-3" /></button></div>)}
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              ['On Leave', onLeave, CalendarDays, 'Employees currently on approved leave', 'requests', 'View Leave Records'],
              ['On Official Travel', onTravel, Plane, 'Employees currently assigned outside office', 'requests', 'View Travel Records'],
              ['DTR Issues', dtrIssueRecords.length, AlertCircle, 'Missing or incomplete attendance logs', 'dtr', 'Review DTR'],
              ['Geofence Alerts', geofenceAlerts, MapPin, 'Employees outside assigned location', 'dtr', 'View Alerts']
            ].map(([label, value, Icon, hint, target, action]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between"><Icon className="h-5 w-5 text-indigo-600" /><span className="text-2xl font-black text-slate-900">{value}</span></div><p className="mt-4 text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-[10px] text-slate-400">{hint}</p><button onClick={() => setActiveTab(target)} className="mt-3 inline-flex items-center gap-1 text-[10px] font-black text-indigo-700">{action}<ArrowRight className="h-3 w-3" /></button></div>)}
          </div>

          <div className="grid gap-6 xl:grid-cols-5">
            <div className="space-y-6 xl:col-span-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 pb-3"><div><p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Attendance overview</p><h3 className="mt-1 text-lg font-black text-slate-900">Today's Attendance</h3></div><button onClick={() => setActiveTab('dtr')} className="text-xs font-black text-indigo-700">View All <ArrowRight className="inline h-3 w-3" /></button></div><div className="mt-5 grid grid-cols-4 gap-2 text-center">{[['Present', presentToday, 'text-emerald-700', 'bg-emerald-500'], ['Absent', absentToday, 'text-rose-700', 'bg-rose-500'], ['Late', lateToday, 'text-amber-700', 'bg-amber-500'], ['On Leave', onLeave, 'text-blue-700', 'bg-blue-500']].map(([label, value, text, bar]) => <div key={label}><p className={`text-2xl font-black ${text}`}>{value}</p><p className="mt-1 text-[10px] font-bold text-slate-500">{label}</p><div className="mx-auto mt-3 h-24 w-5 rounded-full bg-slate-100"><div className={`w-full rounded-full ${bar}`} style={{ height: `${totalEmployees ? Math.max(8, Math.min(100, (value / totalEmployees) * 100)) : 8}%`, marginTop: `${100 - (totalEmployees ? Math.max(8, Math.min(100, (value / totalEmployees) * 100)) : 8)}%` }} /></div></div>)}</div><div className="mt-5 border-t border-slate-100 pt-4 text-sm font-black text-slate-700">Attendance Rate: <span className="text-indigo-700">{attendanceRate}%</span></div></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 pb-3"><div><p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Request overview</p><h3 className="mt-1 text-lg font-black text-slate-900">Requests</h3></div><button onClick={() => setActiveTab('requests')} className="text-xs font-black text-indigo-700">View All <ArrowRight className="inline h-3 w-3" /></button></div><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><span>Leave Applications</span><strong>{pendingLeave}</strong></div><div className="flex justify-between"><span>Travel Orders</span><strong>{pendingTravel}</strong></div><div className="flex justify-between"><span>Returned Requests</span><strong>{returnedRequests.length}</strong></div><div className="border-t border-slate-100 pt-3 font-black">Total for Supervisor Review <strong className="float-right text-indigo-700">{pendingLeave + pendingTravel}</strong></div></div></div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2"><div className="flex items-center justify-between border-b border-slate-100 pb-3"><div><p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Live monitoring</p><h3 className="mt-1 text-lg font-black text-slate-900">Live Attendance</h3></div><button onClick={() => setActiveTab('dtr')} className="text-xs font-black text-indigo-700">View All <ArrowRight className="inline h-3 w-3" /></button></div><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[430px] text-left text-xs"><thead className="text-[10px] uppercase text-slate-400"><tr><th className="py-2">Employee</th><th>Time In</th><th>Location</th><th>Status</th></tr></thead><tbody className="divide-y divide-slate-100">{(todayAttendance.slice(0, 5)).map(record => <tr key={record.id || `${record.employeeName}-${record.timeIn}`}><td className="py-3 font-bold text-slate-700">{formatEmployeeName(record)}</td><td>{record.timeIn || '-'}</td><td>{record.location || '-'}</td><td><span className={`font-bold ${record.status === 'Absent' ? 'text-rose-600' : record.late ? 'text-amber-600' : 'text-emerald-600'}`}>● {record.status === 'Absent' ? 'Absent' : record.late ? 'Late' : 'In'}</span></td></tr>)}{todayAttendance.length === 0 && <tr><td colSpan="4" className="py-8 text-center text-slate-400">No attendance records for today.</td></tr>}</tbody></table></div></div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2"><div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h3 className="font-black text-slate-900">DTR Issues</h3><AlertCircle className="h-5 w-5 text-amber-600" /></div><p className="mt-4 text-sm font-bold text-slate-600">{dtrIssueRecords.length} records need attention</p><div className="mt-3 space-y-2 text-xs text-slate-600"><div className="flex justify-between"><span>Missing Time Out</span><strong>{missingTimeOut}</strong></div><div className="flex justify-between"><span>Missing Time In</span><strong>{missingTimeIn}</strong></div><div className="flex justify-between"><span>Incomplete Record</span><strong>{incompleteRecords}</strong></div></div><button onClick={() => setActiveTab('dtr')} className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">Review DTR</button></div><div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h3 className="font-black text-slate-900">Geofence Alerts</h3><MapPin className="h-5 w-5 text-blue-600" /></div><p className="mt-4 text-sm font-bold text-slate-600">{geofenceAlerts} employees outside area</p><div className="mt-3 space-y-2 text-xs text-slate-600">{geofenceRecords.slice(0, 3).map(record => <div key={record.id || record.employeeName} className="flex justify-between gap-3"><span className="truncate">{formatEmployeeName(record)}</span><strong>{record.distanceToAssignmentMeters || 0}m away</strong></div>)}{geofenceRecords.length === 0 && <p className="text-slate-400">No active geofence alerts.</p>}</div><button onClick={() => setActiveTab('dtr')} className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">View Alerts</button></div></div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 pb-3"><div><p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Admin activity feed</p><h3 className="mt-1 text-lg font-black text-slate-900">Recent Activities</h3></div><Activity className="h-6 w-6 text-indigo-600" /></div><div className="mt-3 divide-y divide-slate-100">{recentActivities.map(({ label, detail, Icon }, index) => <div key={label} className="flex items-center gap-3 py-3"><Icon className="h-4 w-4 text-indigo-600" /><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-700">{label}</p><p className="truncate text-[10px] text-slate-500">{detail}</p></div><span className="text-[10px] text-slate-400">{index + 1} recent</span></div>)}</div><button onClick={() => triggerToast('All admin activities opened.')} className="mt-3 inline-flex items-center gap-1 text-xs font-black text-indigo-700">View All Activities <ArrowRight className="h-3 w-3" /></button></div>
        </div>
      )}

      {/* Employees tab removed per request */}

      {activeTab === 'directory' && (
        <div className="space-y-4">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-xs font-black">
            {[['employees', 'Employees'], ['staff', 'Supervisors & HR/Admin']].map(([value, label]) => (
              <button key={value} type="button" onClick={() => setDirectoryView(value)} className={`flex-1 rounded-lg px-3 py-2 ${directoryView === value ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>
                {label}
              </button>
            ))}
          </div>
          {directoryView === 'staff' ? (
            <HRStaffAccountsView currentUser={user} onToast={triggerToast} />
          ) : (
            <HRAdminEmployeesView
              employees={employees}
              currentUser={user}
              onEmployeesChange={onEmployeesChange}
              onAdminNotification={onAdminNotification}
            />
          )}
        </div>
      )}

      {activeTab === 'announcements' && (
        <HRAnnouncementsManager
          announcements={announcements}
          events={events}
          onCreateAnnouncement={onCreateAnnouncement}
          onUpdateAnnouncement={onUpdateAnnouncement}
          onDeleteAnnouncement={onDeleteAnnouncement}
          onCreateEvent={onCreateEvent}
          onUpdateEvent={onUpdateEvent}
          onDeleteEvent={onDeleteEvent}
          onToast={triggerToast}
        />
      )}

      {activeTab === 'profile' && <div className="hr-admin-profile-screen"><HRAdminProfileView user={user} onUpdateUser={onUpdateUser} onToast={triggerToast} /></div>}

      {false && activeTab === 'profile' && (
        <div className="space-y-5 animate-fadeIn"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Account settings</p><h2 className="mt-1 text-2xl font-black text-slate-900">HR/Admin Profile</h2><p className="text-sm text-slate-500">Manage your own HR/Admin account, separate from employee records.</p></div><div className="grid gap-4 md:grid-cols-2">{[['HR/Admin Name', user.name || 'HR Administrator', UserCircle], ['Employee/HR ID', user.employeeId || 'HR-ADMIN-001', ContactRound], ['Position', user.role || 'HR Administrative Officer V', ShieldAlert], ['Office/Unit', user.office || 'Human Resource Management Unit', FolderKanban], ['Official Email', user.email || 'hradmin@dilg.gov.ph', FileText], ['Contact Number', user.phoneNumber || '0939 374 9823', ContactRound]].map(([label, value, Icon]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><Icon className="h-5 w-5 text-indigo-600" /><p className="mt-3 text-xs font-bold text-slate-500">{label}</p><p className="mt-1 font-black text-slate-800">{value}</p></div>)}</div><div className="flex flex-wrap gap-3"><button onClick={() => triggerToast('Change Password flow opened.')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700"><LockKeyhole className="h-4 w-4" /> Change Password</button><button onClick={() => triggerToast('Notification settings opened.')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700"><Bell className="h-4 w-4" /> Notification Settings</button><button onClick={() => triggerToast('Account settings opened.')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700"><Settings className="h-4 w-4" /> Account Settings</button></div></div>
      )}

      {activeTab === 'dtr' && <HRAdminAttendanceView
        employees={employees}
        attendanceHistory={attendanceHistory}
        attendanceFrom={attendanceFrom}
        requests={requests}
        onOpenTab={setActiveTab}
      />}

      {activeTab === 'dtr_records' && <HRAdminDTRRecordsView
        employees={employees}
        attendanceHistory={attendanceHistory}
        attendanceFrom={attendanceFrom}
        loadedAttendanceMonths={loadedAttendanceMonths}
        onLoadAttendanceMonth={onLoadAttendanceMonth}
        reviewerName={user?.name || 'HR/Admin'}
        onSaveRecord={onUpdateAttendance ? update => onUpdateAttendance([update]) : undefined}
        onBack={() => setActiveTab('dtr')}
      />}

      {activeTab === 'attendance_history' && <HRAdminAttendanceHistoryView
        employees={employees}
        attendanceHistory={attendanceHistory}
        attendanceFrom={attendanceFrom}
        loadedAttendanceMonths={loadedAttendanceMonths}
        onLoadAttendanceMonth={onLoadAttendanceMonth}
        onBack={() => setActiveTab('dtr')}
      />}

      {activeTab === 'records' && <HRAdminRecordsView
        employees={employees}
        attendanceHistory={attendanceHistory}
        attendanceFrom={attendanceFrom}
        loadedAttendanceMonths={loadedAttendanceMonths}
        onLoadAttendanceMonth={onLoadAttendanceMonth}
        requests={requests}
      />}

      {activeTab === 'requests' && <div className="hr-admin-requests-screen"><HRAdminRequestsView
        requests={requests}
        employees={employees}
        onUpdateRequests={onUpdateRequests}
        onUpdateRequestStatus={onUpdateRequestStatus}
        onBack={() => setActiveTab('dashboard')}
      /></div>}

      {false && activeTab === 'requests' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-slate-100 gap-4">
              <div>
                <h3 className="font-extrabold text-slate-800 text-sm italic uppercase">Personnel Leave & Travel Requests</h3>
                <p className="text-[10px] text-slate-400">Review and verify employees Form 6 and Travel Order submissions</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none">
                    <Search className="h-3.5 w-3.5 text-slate-400" />
                  </span>
                  <input
                    type="text"
                    placeholder="Search requests..."
                    value={requestsSearch}
                    onChange={(e) => setRequestsSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 w-48 sm:w-56 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all text-slate-700"
                  />
                </div>

                <div className="flex bg-slate-100 p-0.5 border border-slate-200 rounded-lg text-[10px] font-bold select-none text-slate-500">
                  {['All', 'Pending', 'Approved', 'Rejected'].map((status) => (
                    <button
                      key={status}
                      onClick={() => setRequestsFilterStatus(status)}
                      className={`px-3 py-1 rounded transition-colors whitespace-nowrap cursor-pointer ${requestsFilterStatus === status ? 'bg-white text-slate-800 shadow-xs font-black' : 'hover:text-slate-850 font-bold'}`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs leading-relaxed border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold">
                    <th className="p-3">Request ID</th>
                    <th className="p-3">Employee Name</th>
                    <th className="p-3">Request Type</th>
                    <th className="p-3">Coverage Period</th>
                    <th className="p-3">Purpose/Reason</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-center">Form Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {filteredRequests.length > 0 ? (
                    filteredRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3 font-mono font-bold text-[#1e40af]">{req.id}</td>
                        <td className="p-3 font-extrabold text-slate-800">{req.employeeName || 'DILG Employee'}</td>
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold ${
                            req.type === 'Leave Request' ? 'text-indigo-700 bg-indigo-50 border border-indigo-100' : 'text-amber-700 bg-amber-50 border border-amber-100'
                          }`}>
                            <FileText className="w-3 h-3 shrink-0" />
                            {req.type}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-slate-500 text-[11px]">{req.startDate} to {req.endDate}</td>
                        <td className="p-3 text-slate-500 max-w-xs truncate" title={req.purpose}>{req.purpose || 'No details provided.'}</td>
                        <td className="p-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold ${
                            req.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                            req.status === 'Rejected' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                            'bg-amber-50 text-amber-700 border border-amber-100'
                          }`}>
                            {req.status}
                          </span>
                        </td>
                        <td className="p-3 text-center select-none">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => setSelectedFormRequest(req)}
                              className="p-1.5 text-indigo-700 hover:text-white hover:bg-indigo-700 bg-indigo-50 border border-indigo-150 rounded px-2 py-0.8 cursor-pointer transition-all inline-flex items-center gap-1 text-[10px] font-black"
                              title="Preview Official CSC Document"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Preview</span>
                            </button>
                            {req.status === 'Pending' ? (
                              <>
                                <button
                                  onClick={() => handleUpdateRequestStatusByAdmin(req.id, 'Approved')}
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded border border-transparent hover:border-emerald-100 transition-all cursor-pointer"
                                  title="Approve Request"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleUpdateRequestStatusByAdmin(req.id, 'Rejected')}
                                  className="p-1 text-rose-600 hover:bg-rose-50 rounded border border-transparent hover:border-rose-100 transition-all cursor-pointer"
                                  title="Disapprove Request"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => {
                                  const promptStatus = req.status === 'Approved' ? 'Rejected' : 'Approved';
                                  handleUpdateRequestStatusByAdmin(req.id, promptStatus);
                                }}
                                className="text-[9px] text-slate-400 hover:text-slate-600 hover:underline cursor-pointer font-bold"
                                title="Toggle Approval State"
                              >
                                Override State
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                        No service requests found matching the filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {selectedFormRequest && selectedFormRequest.type === 'Leave Request' && (
        <CSCForm6Preview
          request={selectedFormRequest}
          user={{ name: selectedFormRequest.employeeName || 'DILG Personnel', role: 'Employee' }}
          onClose={() => setSelectedFormRequest(null)}
        />
      )}

      {selectedFormRequest && selectedFormRequest.type === 'Travel Order' && (
        <TravelOrderPreview
          request={selectedFormRequest}
          onClose={() => setSelectedFormRequest(null)}
        />
      )}

      {selectedVerificationPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setSelectedVerificationPhoto(null)}>
          <div className="w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-4">
              <div><h3 className="font-black text-slate-900">Selfie Verification</h3><p className="text-xs text-slate-500">Employee ID: {selectedVerificationPhoto.record.employeeId || getEmployeeForRecord(selectedVerificationPhoto.record)?.employeeId || 'Not assigned'}</p></div>
              <button type="button" onClick={() => setSelectedVerificationPhoto(null)} className="text-slate-400 hover:text-slate-700" aria-label="Close selfie verification"><XCircle className="h-5 w-5" /></button>
            </div>
            <HRFaceComparison
              employeeId={getEmployeeForRecord(selectedVerificationPhoto.record)?.employeeId || selectedVerificationPhoto.record.employeeId}
              attendanceSelfie={selectedVerificationPhoto.url}
              faceVerified={selectedVerificationPhoto.record.faceVerified}
              faceMatchDistance={selectedVerificationPhoto.record.faceMatchDistance}
            />
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">Fingerprint</p><p className="mt-1 font-black text-emerald-700">{describeFingerprintCheck(selectedVerificationPhoto.record)}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">DTR Audit</p><p className="mt-1 font-black text-slate-800">{selectedVerificationPhoto.record.verificationAudit?.verifiedAt ? 'Verified' : 'Pending'}</p></div></div>
          </div>
        </div>
      )}

      {selectedDtrRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50 p-4">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm uppercase">DTR Correction Modal</h3>
                <p className="text-[10px] text-slate-500">Edit the selected employee time record before finalizing verification.</p>
              </div>
              <button
                onClick={handleCloseDtrEdit}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Close modal"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 p-6 text-xs text-slate-700">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="space-y-1">
                  <span className="block font-bold text-slate-700">Clock-In Time</span>
                  <input
                    type="text"
                    value={editTimeIn}
                    onChange={(e) => setEditTimeIn(e.target.value)}
                    className="w-full rounded border border-slate-200 bg-slate-50 p-2 text-xs font-semibold text-slate-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="block font-bold text-slate-700">Clock-Out Time</span>
                  <input
                    type="text"
                    value={editTimeOut}
                    onChange={(e) => setEditTimeOut(e.target.value)}
                    className="w-full rounded border border-slate-200 bg-slate-50 p-2 text-xs font-semibold text-slate-800"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <label className="space-y-1">
                  <span className="block font-bold text-slate-700">Field Status</span>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full rounded border border-slate-200 bg-slate-50 p-2 text-xs font-semibold text-slate-800"
                  >
                    <option>Present</option>
                    <option>Late</option>
                    <option>Absent</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="block font-bold text-slate-700">Location / Municipality</span>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full rounded border border-slate-200 bg-slate-50 p-2 text-xs font-semibold text-slate-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="block font-bold text-slate-700">Task</span>
                  <input
                    type="text"
                    value={editTask}
                    onChange={(e) => setEditTask(e.target.value)}
                    className="w-full rounded border border-slate-200 bg-slate-50 p-2 text-xs font-semibold text-slate-800"
                  />
                </label>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  onClick={handleCloseDtrEdit}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDTRCorrection}
                  className="rounded-xl bg-indigo-700 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-650"
                >
                  Save Correction & Verify
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
