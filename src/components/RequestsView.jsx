/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useEffect, useRef } from 'react';
import { getManilaDateString } from '../../shared/localDate';
import { overlapMessage, overlappingRequest } from '../../shared/requestOverlap';
import { countLeaveDays } from '../../shared/leaveCalc';
import {
  FileText,
  Calendar,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  PlusCircle,
  Search,
  Check,
  AlertCircle,
  FileCheck2,
  Trash2,
  Edit2,
  Paperclip,
  Upload,
  Sparkles,
  BookmarkCheck,
  Eye,
  Info
} from 'lucide-react';
import CSCForm6Preview from './CSCForm6Preview';
import TravelOrderPreview from './TravelOrderPreview';
import { Plane, MapPin } from 'lucide-react';
import { matchesAttendanceEmployee } from '../utils/attendanceIdentity';
import { travelDayCount, travelDurationLabel } from '../utils/travelDuration';
import AttachmentList from './AttachmentList';

// Attachments travel inside the request, which the server accepts up to about 4 MB, so one
// file and all of them together are kept under these sizes.
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const megabytes = bytes => (bytes / 1024 / 1024).toFixed(1);
// A data URL's file size, from its base64 length.
const attachmentBytes = file => Math.round((String(file?.dataUrl || '').split(',')[1] || '').length * 0.75);

// Submitted requests that are not decided yet can be withdrawn (matches the server).
const WITHDRAWABLE_STATUSES = ['Pending', 'Pending Review', 'For Supervisor', 'Returned'];

// The remark saved when the Supervisor approves without typing one (the first is from
// before it was shortened). It says nothing, so it is not shown.
const DEFAULT_APPROVAL_REMARKS = ['Approved based on sufficient leave balance.', 'Approved.'];

export default function RequestsView({
  user,
  requests,
  onSubmitRequest,
  onUpdateOwnRequest,
  holidays = []
}) {
  // Configured view state
  const [activeTab2, setActiveTab2] = useState('Leave');
  
  // Advanced Leave Form core values
  const [leaveType, setLeaveType] = useState('Vacation Leave');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [purpose, setPurpose] = useState('');
  const [commutation, setCommutation] = useState('Not Requested');
  
  // Specific Leave sub-details based on Selected Leave Category
  const [detailsType, setDetailsType] = useState('Within Philippines');
  const [detailsSpecify, setDetailsSpecify] = useState('');
  const [travelActivity, setTravelActivity] = useState('');
  const [travelTime, setTravelTime] = useState('');
  const [travelVenue, setTravelVenue] = useState('');

  // Draft tracker ID & Editing state
  const [editingDraftId, setEditingDraftId] = useState(null);
  const formTopRef = useRef(null);

  // File Attachments lists
  const [attachments, setAttachments] = useState([]);
  const [uploadTarget, setUploadTarget] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showAdminPanel, setShowAdminPanel] = useState(true);

  // CSC Form No. 6 Preview modal trigger
  const [previewRequest, setPreviewRequest] = useState(null);
  const [formSuccessMessage, setFormSuccessMessage] = useState('');
  const [formErrorMessage, setFormErrorMessage] = useState('');

  // Dynamic computation of Working Days (Excluding Sat/Sun)
  const [workingDays, setWorkingDays] = useState(0);

  // Monday to Friday without HR's holidays, as the server counts them when it saves the leave.
  useEffect(() => {
    setWorkingDays(startDate && endDate ? countLeaveDays(startDate, endDate, holidays) : 0);
  }, [startDate, endDate, holidays]);
  // The holidays on weekdays of the leave, which are not counted.
  const holidaysInLeave = startDate && endDate
    ? holidays.filter(holiday => holiday.date >= startDate && holiday.date <= endDate && countLeaveDays(holiday.date, holiday.date) === 1)
    : [];

  // Handle Drag-and-Drop parameters
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleDrop = (e, section) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processDocument(e.dataTransfer.files[0], section);
    }
  };

  const handleFileSelect = (e, section) => {
    if (e.target.files && e.target.files[0]) {
      processDocument(e.target.files[0], section);
    }
    e.target.value = '';
  };

  const processDocument = async (file, section) => {
    setUploadError('');
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setUploadError(`${file.name} is ${megabytes(file.size)} MB. Choose a file of ${megabytes(MAX_ATTACHMENT_BYTES)} MB or less. For a photo, take it again at a lower resolution.`);
      return;
    }
    const attachedBytes = attachments.reduce((total, attached) => total + attachmentBytes(attached), 0);
    if (attachedBytes + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
      setUploadError(`Attachments can total up to ${megabytes(MAX_TOTAL_ATTACHMENT_BYTES)} MB. Remove a file or choose a smaller one.`);
      return;
    }
    setUploadTarget(section);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Unable to read the selected document.'));
        reader.readAsDataURL(file);
      });
      setAttachments(prev => [...prev, {
        id: `file-${Date.now()}`,
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        type: section === 'medical' ? 'Medical Certificate' : 'Supporting Doc',
        mimeType: file.type,
        dataUrl
      }]);
    } catch (error) {
      setUploadError(error.message || 'Unable to upload the selected document.');
    } finally {
      setUploadTarget(null);
    }
  };

  const deleteAttachment = (fileId) => {
    setAttachments(prev => prev.filter(f => f.id !== fileId));
  };

  // Create or update a form submission
  const handleFormSubmission = (isDraftMode) => {
    setFormErrorMessage('');
    if (activeTab2 === 'Leave' && !purpose.trim()) {
      setFormErrorMessage('Please provide the purpose or reason for your leave request.');
      return;
    }
    if (!startDate || !endDate) {
      setFormErrorMessage(activeTab2 === 'Leave'
        ? 'Please select the start and end dates for your leave request.'
        : 'Please select the activity date and the return date for the Provincial Order.');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setFormErrorMessage(activeTab2 === 'Leave'
        ? 'The end date cannot be earlier than the start date.'
        : 'The return date cannot be earlier than the activity date.');
      return;
    }
    // A submitted leave or travel order may not share a day with the employee's other
    // submitted or approved leave or travel (the server checks this too).
    if (!isDraftMode) {
      const other = overlappingRequest({
        id: editingDraftId || undefined,
        type: activeTab2 === 'Leave' ? 'Leave Request' : 'Travel Order',
        startDate,
        endDate,
        employeeId: user?.employeeId,
        employeeEmail: user?.email
      }, requests);
      if (other) {
        setFormErrorMessage(overlapMessage(other));
        return;
      }
    }
    if (activeTab2 === 'Travel') {
      const missingTravelField = [
        [travelActivity, 'Subject'],
        [travelTime, 'Activity Time'],
        [travelVenue, 'Venue / Office']
      ].find(([value]) => !value.trim());

      if (missingTravelField) {
        setFormErrorMessage(`Please provide the ${missingTravelField[1]} for the Provincial Order.`);
        return;
      }
    }

    const typeLabel = activeTab2 === 'Leave' ? 'Leave Request' : 'Travel Order';
    const cleanDetailsType = activeTab2 === 'Leave' ? detailsType : '';

    const extraFields = {
      status: isDraftMode ? 'Draft' : 'Pending',
      leaveType: activeTab2 === 'Leave' ? leaveType : 'N/A',
      detailsType: cleanDetailsType,
      detailsSpecify: activeTab2 === 'Leave' ? detailsSpecify : '',
      travelActivity: activeTab2 === 'Travel' ? travelActivity : '',
      travelTime: activeTab2 === 'Travel' ? travelTime : '',
      travelVenue: activeTab2 === 'Travel' ? travelVenue : '',
      commutation: activeTab2 === 'Leave' ? commutation : 'Not Requested',
      workingDays: activeTab2 === 'Leave' ? workingDays : 0,
      attachments: attachments
    };

    const compiledPurpose = activeTab2 === 'Leave'
      ? `Leave Type: ${leaveType}. ${purpose}`
      : `Official Travel. ${travelActivity.trim()}`;

    if (editingDraftId) {
      // Update the draft itself so submitting it does not leave the old draft behind.
      onUpdateOwnRequest(editingDraftId, { type: typeLabel, startDate, endDate, purpose: compiledPurpose, ...extraFields })
        .catch(error => setFormErrorMessage(error.message || 'Unable to save the draft.'));
    } else {
      onSubmitRequest(typeLabel, startDate, endDate, compiledPurpose, extraFields);
    }

    // Provide visual success report
    const bannerMessage = isDraftMode
      ? 'A draft copy has been securely logged to your draft tray.'
      : activeTab2 === 'Leave'
        ? 'Leave application submitted to HR for review.'
        : 'Travel order submitted to HR for review.';
    
    setFormSuccessMessage(bannerMessage);
    setTimeout(() => setFormSuccessMessage(''), 5500);

    // Reset Form Input states
    setEditingDraftId(null);
    setPurpose('');
    setStartDate('');
    setEndDate('');
    setWorkingDays(0);
    setAttachments([]);
    setDetailsSpecify('');
    setTravelActivity('');
    setTravelTime('');
    setTravelVenue('');
    setCommutation('Not Requested');

    // Automatically transition view filters to see the results
    if (isDraftMode) {
      setStatusFilter('Draft');
    } else {
      setStatusFilter('Pending');
    }
  };

  // Recall a saved draft into the active inputs
  const resumeDraft = (draft) => {
    setEditingDraftId(draft.id);
    setActiveTab2(draft.type === 'Leave Request' ? 'Leave' : 'Travel');
    
    if (draft.type === 'Leave Request') {
      setLeaveType(draft.leaveType || 'Vacation Leave');
      setDetailsType(draft.detailsType || 'Within Philippines');
      setDetailsSpecify(draft.detailsSpecify || '');
      setTravelActivity(draft.travelActivity || '');
      setTravelTime(draft.travelTime || '');
      setTravelVenue(draft.travelVenue || '');
      setCommutation(draft.commutation || 'Not Requested');
    } else {
      setDetailsType(draft.detailsType || 'Provincial Operations Funds');
      setDetailsSpecify(draft.detailsSpecify || '');
    }
    
    setStartDate(draft.startDate);
    setEndDate(draft.endDate);
    
    // Parse purpose
    const rawPurpose = draft.purpose;
    const cleanPurpose = rawPurpose.includes('Leave Type:') 
      ? rawPurpose.substring(rawPurpose.indexOf('.') + 1).trim()
      : rawPurpose;
    setPurpose(cleanPurpose);

    if (draft.attachments) {
      setAttachments(draft.attachments);
    }
  };

  // A request HR or the supervisor returned opens in the form, like a draft, to be fixed and
  // submitted again.
  const editReturnedRequest = (request) => {
    resumeDraft(request);
    formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // A submitted request can be withdrawn until it is approved or rejected.
  const canWithdraw = request => WITHDRAWABLE_STATUSES.includes(request.status);
  const isClosedByEmployee = request => request.status === 'Withdrawn' || request.status === 'Cancelled';

  const withdrawRequest = (request) => {
    const reason = window.prompt(`Withdraw ${request.type} ${request.id}? HR will be notified and it will no longer be reviewed.

Reason (optional):`, '');
    if (reason === null) return;
    onUpdateOwnRequest(request.id, { status: 'Withdrawn', withdrawalReason: reason })
      .catch(error => window.alert(error.message || 'Unable to withdraw the request.'));
  };

  const discardDraft = (draftId) => {
    onUpdateOwnRequest(draftId, { status: 'Cancelled' })
      .catch(error => setFormErrorMessage(error.message || 'Unable to discard the draft.'));
  };

  const renderSigBlock = (sigData, name) => {
    if (!sigData && !name) return null;
    if (sigData && sigData.startsWith('data:')) {
      return <img src={sigData} alt="Signature" className="h-10 max-w-[170px] object-contain" />;
    }
    if (sigData && sigData.startsWith('type:')) {
      const parts = sigData.split(':');
      const font = parts[1] || 'Dancing Script';
      const sigName = parts.slice(2).join(':') || name;
      return <span style={{ fontFamily: `"${font}", cursive`, fontSize: '19px', color: '#1e3a8a', lineHeight: 1.2 }}>{sigName}</span>;
    }
    if (sigData && sigData.startsWith('stamp:')) {
      const parts = sigData.split(':');
      const ink = parts[2] || '#1e3a8a';
      return <span className="inline-block font-mono text-xl font-black px-2 py-0.5 rounded-sm border-2" style={{ color: ink, borderColor: ink, opacity: 0.85 }}>{parts[1] || 'SIG'}</span>;
    }
    return null;
  };

  const myRequests = requests.filter(request => {
    const hasEmployeeIdentity = request.employeeId || request.employeeEmail || request.employeeName;
    return !hasEmployeeIdentity || matchesAttendanceEmployee(request, user);
  });
  const editingReturned = myRequests.some(request => request.id === editingDraftId && request.status === 'Returned');
  const leaveHistory = myRequests.filter(request => request.type === 'Leave Request');
  const travelHistory = myRequests.filter(request => request.type === 'Travel Order');

  // Filter & Search the logs list
  const filteredRequests = myRequests.filter(req => {
    const searchString = `${req.type} ${req.purpose} ${req.leaveType || ''} ${req.approver || ''} ${req.id}`.toLowerCase();
    const matchesSearch = searchString.includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'All' ? true : req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const groupedFilteredRequests = [...filteredRequests].sort((a, b) => (a.type === 'Travel Order' ? 1 : 0) - (b.type === 'Travel Order' ? 1 : 0));

  const countByStatus = (status) => {
    return myRequests.filter(r => r.status === status).length;
  };

  const leaveCredits = [
    { label: 'Vacation Leave', field: 'vacationLeaveCredits', color: 'text-blue-700', bar: 'bg-blue-600' },
    { label: 'Sick Leave', field: 'sickLeaveCredits', color: 'text-emerald-700', bar: 'bg-emerald-600' }
  ].map((credit) => {
    // The approved leave taken out of this balance: from each leave's saved charge (sick leave
    // can spill into vacation leave), or, for one approved before charges were saved, its days
    // when its type matches.
    const chargedDays = credit.field === 'vacationLeaveCredits' ? 'vacationLeaveDays' : 'sickLeaveDays';
    const used = myRequests
      .filter(request => request.type === 'Leave Request' && request.status === 'Approved')
      .reduce((total, request) => total + (request.creditCharge
        ? Number(request.creditCharge[chargedDays]) || 0
        : (request.leaveType || '').toLowerCase().includes(credit.label.toLowerCase().replace(' leave', '')) ? Number(request.workingDays || 0) : 0), 0);
    // The server deducts approved leave from the stored balance, which can exceed 15 days.
    const remaining = Math.max(0, Number(user?.[credit.field] ?? 15));
    return { ...credit, used, remaining, max: Math.max(15, remaining) };
  });

  return (
    <div className="p-4 sm:p-8 pb-24 sm:pb-8 space-y-8 overflow-y-auto flex-1 id-requests-view font-sans">
      
      {/* Dynamic Summary Cards widgets */}
      <div className="grid grid-cols-2 sm:grid-cols-2 gap-4 text-left">
        {/* Approved Box */}
        <button
          type="button"
          onClick={() => setStatusFilter('Approved')}
          className="bg-white border border-slate-200/80 p-3 sm:p-4 rounded-xl flex items-center justify-between shadow-xs text-left transition hover:border-emerald-200 hover:bg-emerald-50/30 active:scale-[0.99]"
        >
          <div className="space-y-1">
            <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider block">Approved Forms</span>
            <span id="stat-approved-reqs" className="text-lg sm:text-xl font-extrabold text-emerald-650 block">{countByStatus('Approved')} Certified</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center border border-emerald-100 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
        </button>

        {/* Drafts Box */}
        <button
          type="button"
          onClick={() => setStatusFilter('Draft')}
          className="bg-white border border-slate-200/80 p-3 sm:p-4 rounded-xl flex items-center justify-between shadow-xs text-left transition hover:border-indigo-200 hover:bg-indigo-50/30 active:scale-[0.99]"
        >
          <div className="space-y-1">
            <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider block">My Saved Drafts</span>
            <span id="stat-drafts-reqs" className="text-lg sm:text-xl font-extrabold text-indigo-650 block">{countByStatus('Draft')} Drafts</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center border border-indigo-100 shrink-0">
            <Edit2 className="w-4 h-4 text-indigo-500" />
          </div>
        </button>
      </div>

      {activeTab2 === 'Leave' && (
        <>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-left">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">Leave Credits</h2>
            <p className="mt-1 text-[10px] font-semibold text-slate-400">Remaining balance after approved leave applications</p>
          </div>
          <FileCheck2 className="h-5 w-5 text-blue-600" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {leaveCredits.map(credit => (
            <div key={credit.label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-end justify-between gap-2">
                <span className="text-[10px] font-bold text-slate-500">{credit.label}</span>
                <strong className={`text-lg font-black ${credit.color}`}>{credit.remaining}</strong>
              </div>
              <p className="mt-1 text-[9px] font-semibold text-slate-400">of {credit.max} days remaining</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div className={`h-full rounded-full ${credit.bar}`} style={{ width: `${(credit.remaining / credit.max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-left">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">My Leave History</h2>
            <p className="mt-1 text-[10px] font-semibold text-slate-400">Your submitted leave applications and current processing status</p>
          </div>
          <Calendar className="h-5 w-5 text-blue-600" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] font-bold text-slate-500 sm:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-2"><strong className="block text-lg text-slate-800">{leaveHistory.length}</strong>Total</div>
          <div className="rounded-lg bg-amber-50 p-2"><strong className="block text-lg text-amber-600">{leaveHistory.filter(request => request.status === 'Pending').length}</strong>Pending</div>
          <div className="rounded-lg bg-emerald-50 p-2"><strong className="block text-lg text-emerald-600">{leaveHistory.filter(request => request.status === 'Approved').length}</strong>Approved</div>
          <div className="col-span-3 rounded-lg bg-rose-50 p-2 sm:col-span-1"><strong className="block text-lg text-rose-600">{leaveHistory.filter(request => request.status === 'Rejected').length}</strong>Rejected</div>
        </div>
        {leaveHistory.length > 0 ? (
          <div className="mt-3 space-y-2">
            {leaveHistory.map(request => (
              <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 p-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-slate-800">{request.leaveType || 'Leave Request'}</p>
                  <p className="mt-1 text-[10px] font-semibold text-slate-500">{request.startDate} to {request.endDate} · {request.workingDays || 0} day(s)</p>
                  {request.creditCharge && (
                    <p className="mt-0.5 text-[10px] font-bold text-slate-600">
                      Charged: {[
                        request.creditCharge.sickLeaveDays && `${Number(request.creditCharge.sickLeaveDays)} SL`,
                        request.creditCharge.vacationLeaveDays && `${Number(request.creditCharge.vacationLeaveDays)} VL`,
                        request.creditCharge.withoutPayDays && `${Number(request.creditCharge.withoutPayDays)} without pay`
                      ].filter(Boolean).join(', ') || 'nothing'}
                    </p>
                  )}
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${request.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : request.status === 'Rejected' ? 'bg-rose-100 text-rose-700' : request.status === 'Draft' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>{request.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-slate-50 p-4 text-center text-xs font-semibold text-slate-500">No leave history yet.</p>
        )}
      </section>

      {/* Main split work dashboard */}
        </>
      )}
      {activeTab2 === 'Travel' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-left">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">My Travel History</h2>
              <p className="mt-1 text-[10px] font-semibold text-slate-400">Your submitted travel orders and current processing status</p>
            </div>
            <Plane className="h-5 w-5 text-blue-600" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] font-bold text-slate-500 sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-2"><strong className="block text-lg text-slate-800">{travelHistory.length}</strong>Total</div>
            <div className="rounded-lg bg-amber-50 p-2"><strong className="block text-lg text-amber-600">{travelHistory.filter(request => request.status === 'Pending').length}</strong>Pending</div>
            <div className="rounded-lg bg-emerald-50 p-2"><strong className="block text-lg text-emerald-600">{travelHistory.filter(request => request.status === 'Approved').length}</strong>Approved</div>
            <div className="col-span-3 rounded-lg bg-rose-50 p-2 sm:col-span-1"><strong className="block text-lg text-rose-600">{travelHistory.filter(request => request.status === 'Rejected').length}</strong>Rejected</div>
          </div>
          {travelHistory.length > 0 ? (
            <div className="mt-3 space-y-2">
              {travelHistory.map(request => (
                <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-slate-800">{request.detailsSpecify && request.detailsSpecify !== 'N/A' ? request.detailsSpecify : 'Travel Order'}</p>
                    <p className="mt-1 line-clamp-1 text-[10px] font-semibold text-slate-500">{request.startDate} to {request.endDate} · {request.purpose}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${request.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : request.status === 'Rejected' ? 'bg-rose-100 text-rose-700' : request.status === 'Draft' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>{request.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-center text-xs font-semibold text-slate-500">No travel history yet.</p>
          )}
        </section>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-left">
        
        {/* Left Form: DILG Interactive Standardized Leave/Travel form */}
        <div className="lg:col-span-6 bg-white border border-slate-200 shadow-xs rounded-2xl overflow-hidden mt-0">
          {/* Form Tabs Switcher */}
          <div className="flex border-b border-slate-200 bg-slate-50 select-none">
            <button
              type="button"
              onClick={() => {
                setActiveTab2('Leave');
                setDetailsType('Within Philippines');
                setDetailsSpecify('');
              }}
              className={`flex-1 py-3 px-4 text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-center border-b-2 transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab2 === 'Leave'
                  ? 'border-[#1e40af] text-[#1e40af] bg-white font-black'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
              }`}
            >
              <FileCheck2 className="w-4 h-4 text-[#1e40af]" />
              <span>Leave Application</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab2('Travel');
                setDetailsType('Provincial Operations Funds');
                setDetailsSpecify('');
                setStartDate('');
                setEndDate('');
              }}
              className={`flex-1 py-3 px-4 text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-center border-b-2 transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab2 === 'Travel'
                  ? 'border-[#1e40af] text-[#1e40af] bg-white font-black'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
              }`}
            >
              <Plane className="w-4 h-4 text-[#1e40af]" />
              <span>Travel Order</span>
            </button>
          </div>

          {/* Header */}
          <div ref={formTopRef} className="p-6 bg-gradient-to-r from-[#1d4ed8] to-[#1e40af] text-white space-y-1">
            <div className="flex items-center gap-2">
              {activeTab2 === 'Leave' ? (
                <FileCheck2 className="w-5.5 h-5.5 text-yellow-400" />
              ) : (
                <Plane className="w-5.5 h-5.5 text-yellow-400" />
              )}
              <h2 className="text-md font-extrabold uppercase tracking-wide">
                {activeTab2 === 'Leave' ? 'Leave Application Module' : 'Travel Authorization Module'}
              </h2>
              {editingDraftId && (
                <span className="bg-amber-400 text-slate-900 font-black text-[9px] uppercase px-1.5 py-0.5 rounded ml-2">
                  {editingReturned ? 'Fixing Returned Request' : 'Editing Draft'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-blue-100 font-medium font-semibold font-sans">
              {activeTab2 === 'Leave'
                ? 'Auto-populating official CSC Civil Service Form No. 6 on approval.'
                : 'Generates official certified DILG Regional Travel Order documentation.'}
            </p>
          </div>

          <div className="p-6 space-y-6">
            
            {/* Automatic Sync indicator block */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Employee Information (Registered Base)</span>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 font-black uppercase px-2 py-0.5 rounded-full flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Verified Sync
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <p className="text-slate-400 font-bold uppercase text-[9px]">Name of Employee</p>
                  <p className="font-bold text-slate-700">{user.name}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-bold uppercase text-[9px]">Position Title</p>
                  <p className="font-bold text-slate-700 truncate">{user.role}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-bold uppercase text-[9px]">Office / Department</p>
                  <p className="font-bold text-slate-700 truncate">{user.office}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-bold uppercase text-[9px]">Date of Filing</p>
                  <p className="font-bold text-slate-700">{getManilaDateString()}</p>
                </div>
              </div>
            </div>

            {/* Leave or Travel parameters Form */}
            <div className="space-y-4">
              
              {/* Type selector (Only for Leave) */}
              {activeTab2 === 'Leave' && (
                <div className="space-y-1.5 text-left animate-none">
                  <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Leave Classification</label>
                  <select
                    value={leaveType}
                    onChange={(e) => {
                      setLeaveType(e.target.value);
                      // Match default details based on selection
                      if (e.target.value.toLowerCase().includes('sick')) {
                        setDetailsType('Out Patient');
                        setDetailsSpecify('General wellness consult');
                      } else if (e.target.value.toLowerCase().includes('vacation')) {
                        setDetailsType('Within Philippines');
                        setDetailsSpecify('Marinduque Rest');
                      } else {
                        setDetailsType('Default specify');
                        setDetailsSpecify('');
                      }
                    }}
                    className="w-full text-xs font-bold rounded-lg border border-slate-200 bg-slate-50 text-slate-800 p-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-[#1e40af] transition-all font-semibold"
                  >
                    <option value="Vacation Leave">Vacation Leave (Sec. 51, Rule XVI)</option>
                    <option value="Sick Leave">Sick Leave (Sec. 43, Rule XVI)</option>
                    <option value="Mandatory / Forced Leave">Mandatory/Forced Leave (Sec. 25, Rule XVI)</option>
                    <option value="Special Privilege Leave">Special Privilege Leave (Sec. 21, Rule XVI)</option>
                    <option value="Maternity Leave">Maternity Leave (R.A. 11210)</option>
                    <option value="Paternity Leave">Paternity Leave (R.A. 8187)</option>
                    <option value="Solo Parent Leave">Solo Parent Leave (R.A. 8972)</option>
                    <option value="Study Leave">Study Leave (Sec. 68, Rule XVI)</option>
                    <option value="10-Day VAWC Leave">10-Day VAWC Leave (R.A. 9262)</option>
                    <option value="Rehabilitation Privilege">Rehabilitation Privilege (Sec. 55, Rule XVI)</option>
                    <option value="Special Leave Benefits for Women">Special Leave Benefits for Women (R.A. 9710)</option>
                    <option value="Special Emergency Lease">Special Emergency (Calamity) Leave</option>
                    <option value="Adoption Leave">Adoption Leave (R.A. 8552)</option>
                    <option value="Others">Others (e.g., CTO)</option>
                  </select>
                </div>
              )}

              {/* Provincial Order fields from the supplied blank form */}
              {activeTab2 === 'Travel' && (
                <div className="space-y-4 animate-none">
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Subject</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g., Provision of technical assistance to Provincial Health Board"
                      value={travelActivity}
                      onChange={(e) => setTravelActivity(e.target.value)}
                      className="w-full text-xs font-semibold rounded-lg border border-slate-200 pl-3 p-3.5 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-[#1e40af]"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5 text-left">
                      <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Activity Time</label>
                      <input
                        required
                        type="text"
                        placeholder="e.g., 8:00 a.m. to 5:00 p.m."
                        value={travelTime}
                        onChange={(e) => setTravelTime(e.target.value)}
                        className="w-full text-xs font-semibold rounded-lg border border-slate-200 pl-3 p-3.5 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-[#1e40af]"
                      />
                    </div>
                    <div className="space-y-1.5 text-left">
                      <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Venue / Office</label>
                      <input
                        required
                        type="text"
                        placeholder="e.g., LGU Municipal Hall"
                        value={travelVenue}
                        onChange={(e) => setTravelVenue(e.target.value)}
                        className="w-full text-xs font-semibold rounded-lg border border-slate-200 pl-3 p-3.5 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-[#1e40af]"
                      />
                    </div>
                  </div>

                </div>
              )}

              {/* Form date fields */}
              <div className="grid grid-cols-2 gap-4 text-left animate-none">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                    {activeTab2 === 'Leave' ? 'Start Date' : 'Activity Date'}
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        // A one-day travel returns the same day, until a later return date is chosen.
                        if (activeTab2 === 'Travel' && (!endDate || endDate < e.target.value)) setEndDate(e.target.value);
                      }}
                      className="w-full text-xs font-bold rounded-lg border border-slate-200 pl-9 p-3 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-[#1e40af] font-semibold"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                    {activeTab2 === 'Leave' ? 'End Date' : 'Return Date'}
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="date"
                      value={endDate}
                      min={activeTab2 === 'Travel' ? startDate || undefined : undefined}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full text-xs font-bold rounded-lg border border-slate-200 pl-9 p-3 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-[#1e40af] font-semibold"
                    />
                  </div>
                </div>
              </div>

              {/* A travel order's duration, from its activity date through its return date */}
              {activeTab2 === 'Travel' && travelDayCount(startDate, endDate) > 0 && (
                <div className="bg-amber-50 text-amber-800 border border-amber-100 p-3 rounded-lg text-xs font-extrabold flex items-center justify-between animate-none">
                  <span>Travel duration:</span>
                  <span className="bg-amber-600 text-white font-black px-2 py-0.5 rounded text-[10px] animate-none font-semibold">
                    {travelDurationLabel({ startDate, endDate })}
                  </span>
                </div>
              )}

              {/* Dynamic Auto-calculated Days block */}
              {activeTab2 === 'Leave' && workingDays > 0 && (
                <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 p-3 rounded-lg text-xs font-extrabold flex items-center justify-between animate-none">
                  <span>
                    Computed span:
                    {holidaysInLeave.length > 0 && (
                      <span className="block text-[10px] font-semibold text-emerald-700">Holidays not counted: {holidaysInLeave.map(holiday => holiday.name).join(', ')}</span>
                    )}
                  </span>
                  <span className="bg-emerald-600 text-white font-black px-2 py-0.5 rounded text-[10px] animate-none font-semibold">
                    {workingDays} Working Days
                  </span>
                </div>
              )}

              {/* Dynamic Specific Details of Leave mapped precisely */}
              {activeTab2 === 'Leave' && (
                <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-3.5 text-left">
                  <label className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider block">6.B Specification Mapped Coordination</label>
                  
                  {/* Switch inputs based on Leave Type */}
                  {leaveType.toLowerCase().includes('vacation') || leaveType.toLowerCase().includes('privilege') ? (
                    <div className="space-y-3">
                      <p className="text-[10px] text-slate-500 font-bold uppercase">Vacation / Privilege Coordinates</p>
                      <div className="flex gap-4 text-xs font-bold text-slate-650 text-left">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="vacSpec"
                            value="Within Philippines"
                            checked={detailsType === 'Within Philippines'}
                            onChange={() => setDetailsType('Within Philippines')}
                            className="text-[#1e40af] focus:ring-0"
                          />
                          <span>Within Philippines</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="vacSpec"
                            value="Abroad (Specify)"
                            checked={detailsType === 'Abroad (Specify)'}
                            onChange={() => setDetailsType('Abroad (Specify)')}
                            className="text-[#1e40af] focus:ring-0"
                          />
                          <span>Abroad (Specify)</span>
                        </label>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 block uppercase">Specify Spot / Destination info</label>
                        <input
                          type="text"
                          placeholder="e.g., Baguio City or Tokyo, Japan"
                          value={detailsSpecify}
                          onChange={(e) => setDetailsSpecify(e.target.value)}
                          className="w-full text-xs font-semibold rounded-lg border border-slate-200 pl-3 p-2.5 bg-white text-slate-800 focus:outline-[#1e40af]"
                        />
                      </div>
                    </div>
                  ) : leaveType.toLowerCase().includes('sick') ? (
                    <div className="space-y-3">
                      <p className="text-[10px] text-slate-500 font-bold uppercase">Sick Leave Medical Coordination</p>
                      <div className="flex gap-4 text-xs font-bold text-slate-650 text-left">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="sickSpec"
                            value="In Hospital"
                            checked={detailsType === 'In Hospital'}
                            onChange={() => setDetailsType('In Hospital')}
                            className="text-[#1e40af] focus:ring-0"
                          />
                          <span>In Hospital</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="sickSpec"
                            value="Out Patient"
                            checked={detailsType === 'Out Patient'}
                            onChange={() => setDetailsType('Out Patient')}
                            className="text-[#1e40af] focus:ring-0"
                          />
                          <span>Out Patient</span>
                        </label>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 block uppercase">Diagnosed Illness / Consultation Details</label>
                        <input
                          type="text"
                          placeholder="e.g., Acute Gastroenteritis or Regular Dental Surgery"
                          value={detailsSpecify}
                          onChange={(e) => setDetailsSpecify(e.target.value)}
                          className="w-full text-xs font-semibold rounded-lg border border-slate-200 pl-3 p-2.5 bg-white text-slate-800 focus:outline-[#1e40af]"
                        />
                      </div>
                    </div>
                  ) : leaveType.toLowerCase().includes('women') ? (
                    <div className="space-y-2">
                      <p className="text-[10px] text-slate-500 font-bold uppercase">Women Special Benefits Details</p>
                      <label className="text-[9px] font-bold text-slate-400 block uppercase">Specify Gynecologic Illness / Surgery details</label>
                      <input
                        type="text"
                        placeholder="e.g., Uterine Fibroids Post-Op recovery"
                        value={detailsSpecify}
                        onChange={(e) => setDetailsSpecify(e.target.value)}
                        className="w-full text-xs font-semibold rounded-lg border border-slate-200 pl-3 p-2.5 bg-white text-slate-800 focus:outline-[#1e40af]"
                      />
                    </div>
                  ) : leaveType.toLowerCase().includes('study') ? (
                    <div className="space-y-3">
                      <p className="text-[10px] text-slate-500 font-bold uppercase">Study Leave type select</p>
                      <div className="flex gap-4 text-xs font-bold text-slate-650 text-left">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="studySpec"
                            value="Completion of Master's"
                            checked={detailsType === "Completion of Master's"}
                            onChange={() => setDetailsType("Completion of Master's")}
                            className="text-[#1e40af] focus:ring-0"
                          />
                          <span>Master's Degree Completion</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="studySpec"
                            value="BAR/Board Review"
                            checked={detailsType === 'BAR/Board Review'}
                            onChange={() => setDetailsType('BAR/Board Review')}
                            className="text-[#1e40af] focus:ring-0"
                          />
                          <span>BAR/Board Review</span>
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="text-[9px] font-bold text-slate-400 block uppercase">Specify leave circumstances</label>
                      <input
                        type="text"
                        placeholder="e.g., Compensatory Time Off clearance description"
                        value={detailsSpecify}
                        onChange={(e) => setDetailsSpecify(e.target.value)}
                        className="w-full text-xs font-semibold rounded-lg border border-slate-200 pl-3 p-2.5 bg-white text-slate-800 focus:outline-[#1e40af]"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Leave-only justification */}
              {activeTab2 === 'Leave' && <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Official Justification / Purpose</label>
                <textarea
                  required
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  rows={3}
                  placeholder="State the detailed, honest purpose or health circumstances for the documentation..."
                  className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-800 p-3.5 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-[#1e40af] transition-all leading-relaxed"
                />
              </div>}

              {/* Commutation Toggle Selection */}
              {activeTab2 === 'Leave' && (
                <div className="space-y-1.5 border-t border-slate-100 pt-4 text-left">
                  <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">6.D Commutation Request</label>
                  <div className="flex gap-6 mt-1 text-xs font-bold text-slate-600 pl-2">
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="radio"
                        name="commutation"
                        value="Not Requested"
                        checked={commutation === 'Not Requested'}
                        onChange={() => setCommutation('Not Requested')}
                        className="text-[#1e40af] focus:ring-0"
                      />
                      <span>Not Requested (Standard)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="radio"
                        name="commutation"
                        value="Requested"
                        checked={commutation === 'Requested'}
                        onChange={() => setCommutation('Requested')}
                        className="text-[#1e40af] focus:ring-0"
                      />
                      <span>Requested (Approved Cash Commutation)</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Supporting document upload zone */}
              <div className="border-t border-slate-100 pt-4 space-y-3 text-left">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                      {activeTab2 === 'Leave' ? 'Supporting Documents' : 'Official Memo / Invitation'}
                    </label>
                    <p className="mt-1 text-[9px] font-semibold text-slate-400">
                      {activeTab2 === 'Leave' ? 'Upload the documents required for your Leave request.' : 'Optional attachment for the Provincial Order.'}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-1 text-[7.5px] font-black uppercase tracking-wider">Upload</span>
                </div>

                <div className={`${activeTab2 === 'Leave' ? 'grid grid-cols-2' : 'grid grid-cols-1'} gap-3 pb-1`}>
                  {/* Medical Certificate upload card */}
                  {activeTab2 === 'Leave' && <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'medical')}
                    className="flex min-h-[90px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-center transition-all hover:bg-slate-100/50"
                  >
                    <input type="file" id="file-med" className="hidden" accept="image/*,.pdf" onChange={(e) => handleFileSelect(e, 'medical')} />
                    <label htmlFor="file-med" className="flex h-full w-full cursor-pointer flex-col items-center justify-center">
                      <Upload className="mb-1 h-5 w-5 text-slate-400" />
                      <span className="block text-[9.5px] font-extrabold text-[#111827]">Upload Medical Certificate</span>
                      <span className="mt-0.5 block text-[7.5px] text-blue-600 font-bold">Upload file</span>
                    </label>
                  </div>}

                  {/* Supporting Documents area */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'support')}
                    className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[90px] ${
                      dragActive ? 'border-[#1e40af] bg-blue-50/50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100/50'
                    }`}
                  >
                    <input
                      type="file"
                      id="file-support"
                      className="hidden"
                      accept="image/*,.pdf"
                      onChange={(e) => handleFileSelect(e, 'support')}
                    />
                    <label htmlFor="file-support" className="w-full h-full cursor-pointer flex flex-col items-center justify-center">
                      <Paperclip className="w-4.5 h-4.5 text-slate-400 mb-1" />
                      <span className="text-[9.5px] font-extrabold text-[#111827] block">{activeTab2 === 'Leave' ? 'Upload Supporting Documents' : 'Upload Official Memo / Invitation'}</span>
                      <span className="text-[7.5px] text-blue-600 mt-0.5 block font-bold">Upload file</span>
                    </label>
                  </div>
                </div>

                <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-2.5 py-2 text-[8px] font-bold text-blue-700">
                  Supported: image and PDF uploads.
                </div>

                {uploadError && (
                  <div className="rounded-lg border border-rose-100 bg-rose-50 p-2.5 text-[9px] font-bold text-rose-700">
                    {uploadError}
                  </div>
                )}

                {/* File Vault Lists Drawer */}
                {attachments.length > 0 && (
                  <div className="space-y-1.5 shadow-xs bg-slate-50/50 border border-slate-150 rounded-xl p-3">
                    <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest block">Active Document Drawer</span>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {attachments.map((file) => (
                        <div key={file.id} className="bg-white px-2.5 py-1.5 border border-slate-200 rounded-lg flex items-center justify-between text-[9px] gap-3">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="bg-indigo-50 border border-indigo-150 rounded px-1.5 py-0.5 text-[8px] text-indigo-700 font-extrabold shrink-0">{file.type}</span>
                            <span className="font-semibold text-slate-750 truncate">{file.name}</span>
                            <span className="text-[8px] font-bold text-slate-500">Uploaded</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-405 font-bold font-mono">
                            <span>{file.size}</span>
                            <button
                              onClick={() => deleteAttachment(file.id)}
                              className="text-red-500 hover:text-red-700 cursor-pointer p-0.5 rounded hover:bg-red-50 border-0 bg-transparent flex items-center"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Status Report Error Banner */}
              {formErrorMessage && (
                <div className="bg-rose-50 border border-rose-100 text-rose-700 p-3.5 rounded-lg text-xs font-semibold flex items-center gap-2 select-none text-left">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formErrorMessage}</span>
                </div>
              )}

              {/* Status Report Success Banner */}
              {formSuccessMessage && (
                <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-3.5 rounded-lg text-xs font-semibold flex items-center gap-2 select-none text-left">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{formSuccessMessage}</span>
                </div>
              )}

              {/* Dynamic Bottom Double-Action buttons drawer */}
              <div className="grid grid-cols-2 gap-4 border-t border-slate-150 pt-5">
                <button
                  type="button"
                  onClick={() => handleFormSubmission(true)}
                  className="py-3 px-4 font-bold border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm font-semibold whitespace-nowrap bg-transparent"
                >
                  <BookmarkCheck className="w-4.5 h-4.5 text-indigo-500 shrink-0" />
                  <span>Save Draft</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleFormSubmission(false)}
                  className="py-3 px-4 font-bold bg-[#1e40af] hover:bg-blue-800 text-white text-xs rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm font-semibold whitespace-nowrap border-0"
                >
                  <Send className="w-4 h-4 shrink-0" />
                  <span className="hidden md:inline">{activeTab2 === 'Leave' ? 'Submit Leave Request' : 'Submit Travel Order'}</span>
                  <span className="md:hidden">{activeTab2 === 'Leave' ? 'Submit Leave' : 'Submit Travel'}</span>
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* Right Panel: Submission History Logs */}
        <div className="lg:col-span-6 space-y-6 mt-0">
          {/* Submission History Feed list */}
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xs space-y-5 text-left md:mt-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wide">My Request Logs</h3>
                <p className="text-xs text-slate-400 mt-0.5">Filter, resume drafted requests, or download approved Form 6 versions.</p>
              </div>

              {/* Admin Tools removed per request */}
            </div>

            {/* Dynamic filter controls */}
            <div className="flex flex-col gap-3.5 text-left">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter by Code, Type, Approver..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-4 py-2 text-slate-800 placeholder-slate-405 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-[#1e40af] transition-all"
                />
              </div>

              {/* Status categories: three to a row on phones; on wider screens as many as fit,
                  wrapping onto another row when the card is narrow. They stay inside the card. */}
              <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-[10px] font-bold text-slate-500 sm:flex sm:flex-wrap">
                {['All', 'Pending', 'Returned', 'Approved', 'Rejected', 'Draft', 'Withdrawn'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setStatusFilter(tab)}
                    className={`whitespace-nowrap px-2.5 py-1.5 text-center rounded transition-all cursor-pointer border-0 font-semibold ${
                      statusFilter === tab ? 'bg-[#1e40af] text-white font-black shadow-xs font-bold' : 'hover:text-slate-850'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Card lists deck */}
            <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
              {groupedFilteredRequests.length === 0 ? (
                <div className="p-12 text-center text-slate-400 font-bold border border-slate-202 bg-slate-50 rounded-2xl">
                  No Leave applications matched corresponding filters.
                </div>
              ) : (
                groupedFilteredRequests.map((req, index) => (
                  <React.Fragment key={req.id}>
                  {(index === 0 || groupedFilteredRequests[index - 1].type !== req.type) && <h3 className="border-b border-slate-200 pb-2 pt-2 text-sm font-extrabold uppercase tracking-wide text-slate-800">{req.type === 'Travel Order' ? 'My Travel Order Logs' : 'My Leave Application Logs'}</h3>}
                  <div
                    className={`p-5 rounded-xl border transition-all space-y-4 bg-white text-left ${
                      req.status === 'Pending' ? 'border-amber-200 shadow-xs' :
                      req.status === 'Approved' ? 'border-emerald-200 shadow-xs' :
                      req.status === 'Draft' ? 'border-indigo-200 shadow-xs' :
                      isClosedByEmployee(req) ? 'border-slate-200' : 'border-rose-200 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* File Metadata info */}
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap text-left">
                          <span className="font-extrabold text-[#1e40af] text-[9.5px] font-mono bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5 uppercase">{req.id}</span>
                          <span className="font-extrabold text-sm text-slate-800">{req.type}</span>
                          {req.workingDays ? (
                            <span className="bg-slate-100 text-slate-600 font-bold text-[9px] px-1.5 py-0.5 rounded font-sans">
                              {req.workingDays} Day(s) 
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2 text-slate-400 font-bold text-[9px] flex-wrap text-left">
                          <span>Filing Date: {req.submissionDate}</span>
                          <span className="w-1 h-3 border-l border-slate-205 hidden sm:inline-block"></span>
                          <span>Span: {req.startDate} to {req.endDate}{req.type === 'Travel Order' && travelDurationLabel(req) ? ` (${travelDurationLabel(req)})` : ''}</span>
                        </div>
                      </div>

                      {/* Status pill badge */}
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-extrabold border shrink-0 ${
                        req.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-150' :
                        req.status === 'Rejected' ? 'bg-rose-50 text-rose-700 border-rose-150' :
                        req.status === 'Draft' ? 'bg-indigo-50 text-indigo-700 border-indigo-150' :
                        isClosedByEmployee(req) ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-amber-50 text-amber-700 border-amber-150'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          req.status === 'Approved' ? 'bg-emerald-500' :
                          req.status === 'Rejected' ? 'bg-rose-500' :
                          req.status === 'Draft' ? 'bg-indigo-500' :
                          isClosedByEmployee(req) ? 'bg-slate-400' : 'bg-amber-500 animate-pulse'
                        }`}></span>
                        {req.status}
                      </span>
                    </div>

                    {/* Purpose Statement display box */}
                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-xs font-semibold text-slate-650 leading-relaxed font-semibold text-left">
                      {req.purpose}
                    </div>

                    {/* Attached files, each opened by tapping it */}
                    <AttachmentList
                      attachments={req.attachments}
                      className="flex flex-wrap gap-1.5 items-center pt-1"
                      itemClassName="max-w-full bg-slate-100 text-slate-700 border border-slate-205 rounded px-2 py-0.5 text-[9px] font-bold"
                    />

                    {/* Supervisor approval signature block */}
                    {req.status === 'Approved' && req.supervisorName && (
                      <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2.5 space-y-1">
                        <span className="text-[9px] uppercase tracking-widest font-bold text-emerald-600 block">Approved by Supervisor</span>
                        <div className="flex flex-col gap-0.5">
                          {renderSigBlock(req.supervisorSignature || req.signatureData, req.supervisorName)}
                          <div className="h-px w-36 bg-slate-300 mt-0.5"></div>
                          <span className="text-[10px] font-extrabold text-slate-700">{req.supervisorName}</span>
                          {req.supervisorApprovedAt && <span className="text-[9px] text-slate-400 font-semibold">{req.supervisorApprovedAt}</span>}
                        </div>
                        {req.supervisorRemarks && !DEFAULT_APPROVAL_REMARKS.includes(req.supervisorRemarks) && (
                          <p className="text-[9px] text-slate-500 font-semibold italic border-l-2 border-emerald-200 pl-2 mt-1">"{req.supervisorRemarks}"</p>
                        )}
                      </div>
                    )}

                    {/* Why it was disapproved, or what to fix in a request returned to the employee */}
                    {['Rejected', 'Returned'].includes(req.status) && (req.supervisorRemarks || req.remarks) && (
                      <div className={`rounded-lg border px-3 py-2.5 text-left ${req.status === 'Returned' ? 'border-amber-200 bg-amber-50' : 'border-rose-100 bg-rose-50/60'}`}>
                        <span className={`block text-[9px] font-bold uppercase tracking-widest ${req.status === 'Returned' ? 'text-amber-700' : 'text-rose-600'}`}>
                          {req.status === 'Returned' ? 'Needs your action' : 'Reason for disapproval'}
                        </span>
                        <p className="mt-1 text-[11px] font-semibold text-slate-700">
                          {req.status === 'Returned' ? req.remarks || req.supervisorRemarks : req.supervisorRemarks || req.remarks}
                        </p>
                      </div>
                    )}
                    {/* Bottom action rows based on Status: Resume Drafts or Generate CSC Form6 */}
                    <div className="flex items-center justify-between border-t border-slate-150 pt-3.5 flex-wrap gap-2.5">
                      
                      {req.status === 'Draft' ? (
                        <>
                          <div className="text-[10px] text-slate-405 font-bold flex items-center gap-1 font-semibold text-left">
                            <Info className="w-3.5 h-3.5 text-slate-350 shrink-0" />
                            <span>This is a draft version. Click to submit.</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => discardDraft(req.id)}
                              className="px-2.5 py-1.5 text-red-650 hover:bg-red-50 text-[10px] font-bold rounded cursor-pointer transition-all flex items-center gap-1 border-0 bg-transparent font-semibold"
                            >
                              Discard
                            </button>
                            <button
                              onClick={() => resumeDraft(req)}
                              className="px-3 py-1.5 bg-indigo-50 border border-indigo-150 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1 font-semibold"
                            >
                              <Edit2 className="w-3 h-3 text-indigo-700" />
                              <span>Resume & Submit</span>
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-[10px] text-slate-405 font-bold flex items-center gap-1.5 font-semibold text-left">
                            {isClosedByEmployee(req) ? (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                <span>{req.status === 'Withdrawn' ? 'Withdrawn by you' : 'Discarded draft'}</span>
                              </>
                            ) : canWithdraw(req) ? (
                              <>
                                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping"></span>
                                <span>{req.status === 'Returned' ? 'Returned to you: fix it and submit again' : req.status === 'For Supervisor' ? 'Awaiting supervisor approval' : 'Awaiting HR review'}</span>
                              </>
                            ) : (
                              <>
                                <span className={`w-1.5 h-1.5 rounded-full ${req.status === 'Approved' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                <span className="truncate max-w-[200px]">Processed by: {req.approver}</span>
                              </>
                            )}
                          </div>

                          {req.status === 'Returned' && (
                            <button
                              type="button"
                              onClick={() => editReturnedRequest(req)}
                              className="px-3 py-2 bg-indigo-50 border border-indigo-150 hover:bg-indigo-100 text-indigo-700 text-[10px] font-black rounded-lg transition-all flex items-center gap-1"
                            >
                              <Edit2 className="w-3 h-3 text-indigo-700" />
                              <span>Edit & Resubmit</span>
                            </button>
                          )}

                          {canWithdraw(req) && (
                            <button
                              type="button"
                              onClick={() => withdrawRequest(req)}
                              className="px-3 py-2 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-black rounded-lg transition-all"
                            >
                              Withdraw
                            </button>
                          )}

                          {/* Dynamic CSC Form 6 / Travel Order trigger modal */}
                          {!isClosedByEmployee(req) && <button
                            onClick={() => setPreviewRequest(req)}
                            className="px-3 py-2 bg-gradient-to-r from-blue-900 to-[#1e40af] hover:from-black hover:to-indigo-900 text-white text-[10px] font-black rounded-lg transition-all flex items-center gap-1.5 shadow-xs cursor-pointer select-none font-semibold border-0"
                          >
                            <Eye className="w-4 h-4 text-yellow-300" />
                            <span>{req.type === 'Leave Request' ? 'Generate CSC Form 6' : 'Generate Travel Order'}</span>
                          </button>}
                        </>
                      )}

                    </div>
                  </div>
                  </React.Fragment>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Embedded High Fidelity CSC Form No. 6 Viewer Modal overlay */}
      {previewRequest && previewRequest.type === 'Leave Request' && (
        <CSCForm6Preview
          request={previewRequest}
          user={user}
          onClose={() => setPreviewRequest(null)}
        />
      )}

      {/* Embedded High Fidelity Travel Order Viewer Modal overlay */}
      {previewRequest && previewRequest.type === 'Travel Order' && (
        <TravelOrderPreview
          request={previewRequest}
          user={user}
          onClose={() => setPreviewRequest(null)}
        />
      )}

    </div>
  );
}
