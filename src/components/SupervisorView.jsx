/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useEffect } from 'react';
import { getManilaDateString } from '../../shared/localDate';
import {
  FileCheck2,
  XCircle,
  CheckCircle2,
  PenTool,
  Clock,
  Search,
  Check,
  AlertCircle,
  Flame,
  FileDown,
  Info,
  Calendar,
  Sparkles,
  Users,
  Award,
  Signature
} from 'lucide-react';
import CSCForm6Preview from './CSCForm6Preview';
import TravelOrderPreview from './TravelOrderPreview';
import { matchesAttendanceEmployee } from '../utils/attendanceIdentity';
import { FOR_PRE_APPROVAL, awaitsHead, isLeaveWithHr } from '../../shared/hrSteps';
import TravelDocumentsPanel from './TravelDocumentsPanel';
import { companionNames } from '../../shared/travelStatus';
import { travelDurationLabel } from '../utils/travelDuration';
import AttachmentList from './AttachmentList';
import SupervisorDtrDesk from './SupervisorDtrDesk';
import SignedFormStep from './SignedFormStep';
import cscForm6Template from '../assets/template/csc-form-6-template.pdf';
import travelOrderTemplate from '../assets/template/travelorder-template.pdf';
import { fillLeaveForm } from '../utils/leaveForm';
import { fillTravelOrder } from '../utils/travelOrderForm';
import { fetchSignedForm, signedNoteText, stampForSigning } from '../utils/signedForms';

// A request the Supervisor can still decide: a leave HR 2 sent, or a Travel Order, which comes
// straight to the Supervisor (the server allows the same). A leave comes only after HR 2 confirms
// its leave credits and pre-approves it (shared/hrSteps.js). Approved, disapproved, returned, and
// withdrawn ones are done.
const canDecide = request => !isLeaveWithHr(request) && ['Pending', 'Pending Review', FOR_PRE_APPROVAL, 'For Supervisor'].includes(request?.status);

const shortDate = value => {
  const date = new Date(`${String(value || '').slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// What happened to a request that is no longer waiting for the Supervisor.
const decisionText = request => {
  const by = request.supervisorName ? ` by ${request.supervisorName}` : '';
  const on = shortDate(request.supervisorApprovedAt) ? ` on ${shortDate(request.supervisorApprovedAt)}` : '';
  if (request.status === 'Approved') return `Approved${by}${on}.`;
  if (request.status === 'Rejected') return `Disapproved${by}${on}.`;
  if (request.status === 'Returned') return 'Returned to the employee to fix. It comes back here once they submit it again.';
  if (request.status === 'Withdrawn') return 'Withdrawn by the employee.';
  return `This request is ${request.status || 'not submitted'}.`;
};

export default function SupervisorView({
  user,
  requests: allRequests = [],
  employees = [],
  activeEmployeeCount = null,
  onUpdateRequestStatus,
  // Uploads a form signed in Adobe (see utils/signedForms.js).
  onUploadSignedForm,
  // From a notification's button: { requestId } of the request to open.
  focus = null,
  // The DTRs employees signed through WorkMate, for the Supervisor to verify as the In-charge.
  dtrSubmissions = [],
  onReviewDtr,
  onOpenDtr,
  onReloadDtrSubmissions
}) {
  // A leave still with HR 2 (confirmation of leave credits and pre-approval) is not the Head's
  // yet, so it is not listed until HR 2 sends it.
  const requests = allRequests.filter(request => !isLeaveWithHr(request));
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [remarks, setRemarks] = useState('');
  
  // Filters & Tabs
  const [activeMainTab, setActiveMainTab] = useState('requests');

  const [statusFilter, setStatusFilter] = useState('For Supervisor');
  // 'All', 'Leave Request', or 'Travel Order'.
  const [typeFilter, setTypeFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm6Request, setShowForm6Request] = useState(null);

  // Success indicator
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSavingDecision, setIsSavingDecision] = useState(false);

  // A notification's Review request button opens that request.
  useEffect(() => {
    const request = focus?.requestId ? requests.find(item => item.id === focus.requestId) : null;
    if (!request) return;
    setActiveMainTab('requests');
    setStatusFilter(request.status === 'For Supervisor' ? 'For Supervisor' : 'All');
    setTypeFilter('All');
    setSelectedRequest(request);
    setRemarks(['Pending', 'For Supervisor'].includes(request.status) ? '' : request.supervisorRemarks || '');
  }, [focus]);

  const getRequester = (request) => request.employee || employees.find(employee => matchesAttendanceEmployee(request, employee));
  const requesterName = (request) => getRequester(request)?.name || request.employeeName || 'Employee name unavailable';
  const requesterId = (request) => getRequester(request)?.employeeId || request.employeeId || 'Not assigned';

  // Returning a request to the employee, and disapproving a Travel Order, need no signed form.
  // An approval, and a leave's disapproval (7.D), are made by uploading the form signed in Adobe.
  const handleDecision = async (decision) => {
    if (!selectedRequest || isSavingDecision) return;
    setErrorMsg('');
    if (decision === 'Rejected' && !remarks.trim()) {
      setErrorMsg('Please ensure you provide the reason (remarks) for disapproving the request.');
      return;
    }
    if (decision === 'Returned' && !remarks.trim()) {
      setErrorMsg('Write in the remarks what the employee needs to fix before returning the request.');
      return;
    }
    const finalRemarks = remarks.trim();
    const updatePayload = {
      status: decision,
      stage: decision,
      approver: 'Supervisor Review Desk',
      remarks: finalRemarks,
      supervisorRemarks: finalRemarks,
      supervisorName: user?.name || 'Supervisor',
      ...(decision === 'Rejected' ? { supervisorApprovedAt: getManilaDateString() } : {})
    };

    setIsSavingDecision(true);
    try {
      await onUpdateRequestStatus(selectedRequest.id, updatePayload);
      setSuccessMsg(decision === 'Returned'
        ? `Application ID ${selectedRequest.id} was returned to the employee to fix and submit again.`
        : `Application ID ${selectedRequest.id} was disapproved.`);
      setSelectedRequest(null);
      setRemarks('');
      window.setTimeout(() => setSuccessMsg(''), 4500);
    } catch (error) {
      setErrorMsg(error.message || 'Unable to save the supervisor decision. Please try again.');
    } finally {
      setIsSavingDecision(false);
    }
  };

  // The form the Head signs in Adobe: a leave's CSC Form No. 6 as HR 2 signed it (or, for a leave
  // HR sent before signed uploads began, made now), or the Travel Order made now.
  const formToSign = async request => {
    const person = getRequester(request) || { name: request.employeeName };
    if (request.type === 'Leave Request') {
      const signedByHr = request.signedForms?.hr ? await fetchSignedForm('leave-hr', request.id) : null;
      if (signedByHr) return { bytes: signedByHr.bytes, fileName: `CSC_Form_6_${request.id}_to_sign.pdf` };
      const template = await (await fetch(cscForm6Template)).arrayBuffer();
      return { bytes: await stampForSigning(await fillLeaveForm(template, request, person), 'leave-head', request.id), fileName: `CSC_Form_6_${request.id}_to_sign.pdf` };
    }
    const template = await (await fetch(travelOrderTemplate)).arrayBuffer();
    return { bytes: await stampForSigning(await fillTravelOrder(template, request, person), 'travel-head', request.id), fileName: `Travel_Order_${request.id}_to_sign.pdf` };
  };
  const uploadSignedDecision = async ({ file, decision, remarks: signedRemarks }) => {
    const request = selectedRequest;
    const leave = request.type === 'Leave Request';
    const data = await onUploadSignedForm({ kind: leave ? 'leave-head' : 'travel-head', ref: request.id, file, decision: leave ? decision : 'Approved', remarks: signedRemarks });
    const status = data?.request?.status;
    setSuccessMsg(`Application ID ${request.id} was ${status === 'Rejected' ? 'disapproved' : 'approved'}. The form you signed in Adobe is now its official copy.`);
    setSelectedRequest(null);
    setRemarks('');
    window.setTimeout(() => setSuccessMsg(''), 6000);
  };

  // Stats summaries
  const pendingRequests = requests.filter(r => r.status === 'For Supervisor');
  // What is waiting for the supervisor, leave and travel apart.
  const pendingLeave = pendingRequests.filter(r => r.type === 'Leave Request');
  const pendingTravel = pendingRequests.filter(r => r.type === 'Travel Order');
  const approvedRequests = requests.filter(r => r.status === 'Approved');
  const rejectedRequests = requests.filter(r => r.status === 'Rejected');
  const isShownType = req => typeFilter === 'All' || req.type === typeFilter;

  // Search filter
  const filteredRequests = requests.filter(req => {
    const requester = getRequester(req);
    const searchString = `${req.type} ${req.purpose} ${req.id} ${requesterName(req)} ${requesterId(req)} ${requester?.office || ''}`.toLowerCase();
    const matchesSearch = searchString.includes(searchQuery.toLowerCase());
    if (req.status === 'Draft') return false;
    const matchesStatus = statusFilter === 'All' ? true : req.status === statusFilter;
    return matchesSearch && matchesStatus && isShownType(req);
  });

  return (
    <div className="p-4 sm:p-8 space-y-8 overflow-y-auto flex-1 id-supervisor-review-view font-sans">
      
      {/* Tab Navigation for Supervisor Workspace */}
      <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 self-start inline-flex select-none">
        <button
          onClick={() => setActiveMainTab('requests')}
          className={`px-4 py-2 rounded-lg text-xs font-black cursor-pointer border-0 flex items-center gap-2 transition-all font-bold ${
            activeMainTab === 'requests'
              ? 'bg-blue-800 text-white shadow-xs font-black'
              : 'text-slate-500 hover:text-slate-855 bg-transparent'
          }`}
        >
          <FileCheck2 className="w-4 h-4" />
          <span>Leave & Travel Requests Desk ({requests.length})</span>
        </button>
        <button
          onClick={() => setActiveMainTab('dtr')}
          className={`px-4 py-2 rounded-lg text-xs font-black cursor-pointer border-0 flex items-center gap-2 transition-all font-bold ${
            activeMainTab === 'dtr'
              ? 'bg-blue-800 text-white shadow-xs font-black'
              : 'text-slate-500 hover:text-slate-855 bg-transparent'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>DTR to Verify ({dtrSubmissions.filter(item => item.status === 'Submitted').length})</span>
        </button>
      </div>

      {activeMainTab === 'dtr' ? (
        <SupervisorDtrDesk submissions={dtrSubmissions} onReview={onReviewDtr} onOpen={onOpenDtr} onReload={onReloadDtrSubmissions} onUploadSignedForm={onUploadSignedForm} />
      ) : (<>
      {/* Row 1: Quick Insights Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-left">
          
          {/* Pending Card */}
          <button
            type="button"
            onClick={() => setStatusFilter('For Supervisor')}
            className={`p-5 rounded-2xl flex items-center justify-between text-left transition-all duration-200 border cursor-pointer ${
              statusFilter === 'For Supervisor'
                ? 'border-amber-500 bg-amber-50/70 ring-2 ring-amber-500/10 shadow-sm'
                : 'bg-gradient-to-br from-amber-50 to-amber-100/50 border-amber-200 hover:border-amber-400 hover:shadow-xs'
            }`}
          >
            <div className="space-y-1.5">
              <span className="text-[10px] text-amber-700 font-extrabold uppercase tracking-wider block">Pending Evaluative Reviews</span>
              <span className="text-2xl font-black text-amber-800 tracking-tight block">{pendingRequests.length}</span>
              <span className="text-[11px] text-amber-800 font-extrabold block">Leave: {pendingLeave.length} · Travel: {pendingTravel.length}</span>
              <span className="text-[10px] text-amber-600/80 font-bold block leading-relaxed">Awaiting Digital Signature & Endorsement</span>
            </div>
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center border border-amber-200 shadow-sm shrink-0">
              <Clock className="w-5.5 h-5.5 text-amber-500 animate-pulse" />
            </div>
          </button>

          {/* Approved Card */}
          <button
            type="button"
            onClick={() => setStatusFilter('Approved')}
            className={`p-5 rounded-2xl flex items-center justify-between text-left transition-all duration-200 border cursor-pointer ${
              statusFilter === 'Approved'
                ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/10 shadow-sm'
                : 'bg-gradient-to-br from-emerald-50 to-emerald-100/40 border-emerald-200 hover:border-emerald-400 hover:shadow-xs'
            }`}
          >
            <div className="space-y-1.5">
              <span className="text-[10px] text-emerald-700 font-extrabold uppercase tracking-wider block">Completed Endorsements</span>
              <span className="text-2xl font-black text-emerald-800 tracking-tight block">{approvedRequests.length}</span>
              <span className="text-[10px] text-emerald-600/80 font-bold block leading-relaxed">Certified Civil Service Form 6 Documents</span>
            </div>
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center border border-emerald-200 shadow-sm shrink-0">
              <FileCheck2 className="w-5.5 h-5.5 text-emerald-500" />
            </div>
          </button>

          {/* Total Supervised Card */}
          <button
            type="button"
            onClick={() => setStatusFilter('All')}
            className={`p-5 rounded-2xl flex items-center justify-between text-left transition-all duration-200 border cursor-pointer ${
              statusFilter === 'All'
                ? 'border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/10 shadow-sm'
                : 'bg-gradient-to-br from-blue-50 to-blue-100/40 border-blue-200 hover:border-blue-400 hover:shadow-xs'
            }`}
          >
            <div className="space-y-1.5">
              <span className="text-[10px] text-blue-700 font-extrabold uppercase tracking-wider block">Total Active Personnel Base</span>
              <span className="text-2xl font-black text-blue-800 tracking-tight block">{activeEmployeeCount ?? '–'} Staff</span>
              <span className="text-[10px] text-blue-600/80 font-bold block leading-relaxed">Active employee accounts</span>
            </div>
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center border border-blue-200 shadow-sm shrink-0">
              <Users className="w-5.5 h-5.5 text-blue-600" />
            </div>
          </button>
          
        </div>

      {/* Main split work space */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mt-0 text-left">
        
        {/* Left Side: Requests List & Search with filters */}
        <div className="lg:col-span-7 bg-white border border-slate-200 shadow-xs rounded-2xl p-6 space-y-5 text-left md:mt-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-extrabold text-[#1e40af] text-sm uppercase tracking-wider">Leave & Travel Approvals Desk</h2>
              <p className="text-[11px] text-slate-400 mt-0.5 font-semibold">Electronic verification portal for Supervisor and Approving Officers</p>
            </div>
          </div>

          {/* Quick search and filter toggles */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between text-left">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by name, ID, or purpose..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs font-semibold rounded-lg border border-slate-200 pl-9 pr-4 py-2 bg-slate-50 text-slate-800 placeholder-slate-400 focus:outline-[#1e40af]"
              />
            </div>

            <div className="flex bg-slate-100 border border-slate-200 rounded-lg p-0.5 text-[10px] font-bold text-slate-500 shrink-0 select-none self-start sm:self-auto">
              {['For Supervisor', 'Pending', 'Approved', 'Rejected', 'All'].map(tab => {
                const count = requests.filter(r => isShownType(r) && (tab === 'All' || r.status === tab)).length;
                return (
                  <button
                    key={tab}
                    onClick={() => setStatusFilter(tab)}
                    className={`px-3 py-1 rounded cursor-pointer transition-all border-0 font-semibold ${
                      statusFilter === tab ? 'bg-blue-800 text-white font-bold shadow-xs' : 'hover:text-slate-700 bg-transparent'
                    }`}
                  >
                    {tab} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Leave applications and travel orders apart */}
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
            <span className="uppercase tracking-wider text-slate-400">Show:</span>
            <div className="flex bg-slate-100 border border-slate-200 rounded-lg p-0.5 select-none">
              {[['All', 'All'], ['Leave Request', 'Leave'], ['Travel Order', 'Travel']].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTypeFilter(value)}
                  className={`px-3 py-1 rounded cursor-pointer transition-all border-0 font-semibold ${
                    typeFilter === value ? 'bg-blue-800 text-white font-bold shadow-xs' : 'hover:text-slate-700 bg-transparent'
                  }`}
                >
                  {label} ({value === 'All' ? pendingRequests.length : value === 'Leave Request' ? pendingLeave.length : pendingTravel.length} pending)
                </button>
              ))}
            </div>
          </div>

          {/* Scrolling request deck */}
          <div className="space-y-3.5 max-h-[500px] overflow-y-auto pr-1">
            {filteredRequests.length === 0 ? (
              <div className="p-12 text-center text-slate-400 font-bold border border-slate-200 bg-slate-50 rounded-xl">
                No requests found for the selected filter.
              </div>
            ) : (
              filteredRequests.map((req) => (
                <div
                  key={req.id}
                  onClick={() => {
                    setSelectedRequest(req);
                    setErrorMsg('');
                    setRemarks(['Pending', 'For Supervisor'].includes(req.status) ? '' : req.supervisorRemarks || '');
                  }}
                  className={`p-4 rounded-xl border cursor-pointer transition-all space-y-3 text-xs leading-relaxed text-left ${
                    selectedRequest?.id === req.id 
                      ? 'border-blue-600 bg-blue-50/20 shadow-sm' 
                      : 'border-slate-200 hover:border-slate-400 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-[#1e40af] text-[9.5px] font-mono bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5 uppercase">{req.id}</span>
                        <h4 className="font-extrabold text-slate-800 text-sm">{req.type}</h4>
                        {req.leaveType && req.leaveType !== 'N/A' && (
                          <span className="bg-slate-100 text-slate-600 font-bold text-[8.5px] px-1.5 py-0.5 rounded uppercase">
                            {req.leaveType.split(' ')[0]}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold text-left">
                        Filing: {req.submissionDate} • Inclusive Dates: {req.startDate} to {req.endDate}{req.type === 'Travel Order' && travelDurationLabel(req) ? ` (${travelDurationLabel(req)})` : ''}
                      </p>
                      <p className="text-[11px] font-black text-slate-700">
                        {requesterName(req)} <span className="font-semibold text-slate-400">· {requesterId(req)}</span>
                      </p>
                      <p className="text-[10px] font-semibold text-slate-500">
                        {getRequester(req)?.role || req.role || 'Employee'} · {getRequester(req)?.office || req.office || 'Office not assigned'}
                      </p>
                    </div>

                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold border shrink-0 ${
                      req.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-150' :
                      req.status === 'Rejected' ? 'bg-rose-50 text-rose-700 border-rose-150' :
                      req.status === 'Draft' ? 'bg-indigo-50 text-indigo-700 border-indigo-150' : 'bg-amber-50 text-amber-700 border-amber-150'
                    }`}>
                      <span className={`w-1 h-1 rounded-full ${
                        req.status === 'Approved' ? 'bg-emerald-500' :
                        req.status === 'Rejected' ? 'bg-rose-500' :
                        req.status === 'Draft' ? 'bg-indigo-500' : 'bg-amber-500 animate-pulse'
                      }`}></span>
                      {req.status}
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-50 border border-slate-100 rounded text-[11px] text-slate-650 font-semibold italic text-left">
                    "{req.purpose}"
                  </div>

                  {req.attachments && req.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 items-center text-[9px] text-[#1e40af] font-semibold text-left">
                      <span className="font-bold text-slate-400 uppercase text-[8px]">Attachments (tap to open):</span>
                      <AttachmentList
                        attachments={req.attachments}
                        className="flex flex-wrap gap-1.5"
                        itemClassName="max-w-full bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5 font-bold"
                      />
                    </div>
                  )}

                  {/* Quick trigger to show official Civil service preview form */}
                  {req.status === 'Approved' && (
                    <div className="pt-2 flex justify-end border-t border-slate-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowForm6Request(req);
                        }}
                        className="flex items-center gap-1.5 text-[10px] font-black text-blue-800 hover:underline bg-blue-50/60 p-2 py-1 border border-blue-100 rounded cursor-pointer transition-colors font-semibold"
                      >
                        <FileDown className="w-3.5 h-3.5 shrink-0" />
                        <span>Review and Download {req.type === 'Leave Request' ? 'CSC Form 6' : 'Travel Order'} (PDF)</span>
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Advanced Review & Signature Placement Panel */}
        <div className="lg:col-span-5 space-y-6 mt-0">
          <div className="bg-white border border-slate-200 shadow-xs rounded-2xl p-6 space-y-5 text-left md:mt-0">
            <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
              <PenTool className="w-5 h-5 text-indigo-600 shrink-0" />
              <div>
                <h3 className="font-extrabold text-slate-800 text-sm uppercase">Decision and Signature Module</h3>
                <p className="text-[10px] text-slate-405 font-semibold">Electronic signing of Civil Service records</p>
              </div>
            </div>

            {/* Shown here, beside the decision, not at the top of the page where it is out of view. */}
            {successMsg && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl flex items-center gap-3 animate-fadeIn select-none text-left">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="font-bold text-xs">{successMsg}</span>
              </div>
            )}

            {selectedRequest ? (
              <div className="space-y-4">
                
                {/* Micro Brief Summary */}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-600 leading-tight space-y-2 text-left">
                  <div className="flex justify-between items-center text-[9px] text-slate-400 font-extrabold uppercase">
                    <span>Currently Reviewing</span>
                    <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-mono font-bold">{selectedRequest.id}</span>
                  </div>
                  <div>
                    <p className="font-black text-slate-700 uppercase text-[10px]">{selectedRequest.type}</p>
                    <p className="font-semibold text-slate-500 mt-0.5">Requested by: <span className="text-slate-800 font-bold">{requesterName(selectedRequest)}</span></p>
                    <p className="font-semibold text-slate-500 mt-0.5">Employee ID: <span className="text-slate-800 font-bold">{requesterId(selectedRequest)}</span></p>
                    {selectedRequest.workingDays && <p className="font-semibold text-emerald-800 font-sans mt-0.5">Total Days: {selectedRequest.workingDays} Day(s)</p>}
                    {companionNames(selectedRequest) && <p className="font-semibold text-slate-500 mt-0.5">Also included: <span className="text-slate-800 font-bold">{companionNames(selectedRequest)}</span></p>}
                    {['Pending', FOR_PRE_APPROVAL, 'For Supervisor'].includes(selectedRequest.status) && selectedRequest.remarks && (
                      <p className="font-semibold text-slate-500 mt-0.5">HR remarks: <span className="text-slate-800 font-bold">{selectedRequest.remarks}</span></p>
                    )}
                  </div>
                </div>

                {/* HR 2's certification of the leave credits (7.A) and recommendation (7.B),
                    which the Head decides on. */}
                {(selectedRequest.creditCertification || selectedRequest.recommendation) && (
                  <div className="space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-left text-xs text-slate-600">
                    {selectedRequest.creditCertification && (() => {
                      const { asOf, vacationLeave = {}, sickLeave = {}, withoutPayDays, certifiedBy } = selectedRequest.creditCertification;
                      const days = value => Number(value || 0).toFixed(3);
                      return (
                        <div>
                          <p className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-700">Leave credits as of {asOf} · {certifiedBy?.name || 'HR 1'}</p>
                          <p className="mt-1 font-semibold">Vacation leave: <span className="font-bold text-slate-800">{days(vacationLeave.earned)} − {days(vacationLeave.less)} = {days(vacationLeave.balance)}</span></p>
                          <p className="font-semibold">Sick leave: <span className="font-bold text-slate-800">{days(sickLeave.earned)} − {days(sickLeave.less)} = {days(sickLeave.balance)}</span></p>
                          {withoutPayDays > 0 && <p className="font-bold text-rose-700">{days(withoutPayDays)} day(s) without pay</p>}
                        </div>
                      );
                    })()}
                    {selectedRequest.recommendation && (
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-700">Recommendation · {selectedRequest.recommendation.recommendedBy?.name || 'HR 2'}</p>
                        <p className="mt-1 font-bold text-slate-800">{selectedRequest.recommendation.decision === 'approval' ? 'For approval' : `For disapproval due to: ${selectedRequest.recommendation.reason}`}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* A decided request (or one with the employee) shows its decision; only one still
                    waiting for a decision can be signed, approved, disapproved, or returned. */}
                {!canDecide(selectedRequest) ? (
                  <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left text-xs text-slate-600">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Decision</p>
                    <p className="font-bold text-slate-800">{decisionText(selectedRequest)}</p>
                    {selectedRequest.signedForms?.head && <p className="font-semibold text-emerald-700">{signedNoteText(selectedRequest.signedForms.head)}</p>}
                    {['Approved', 'Rejected', 'Returned'].includes(selectedRequest.status) && (selectedRequest.supervisorRemarks || selectedRequest.remarks) && (
                      <p className="font-semibold">Remarks: <span className="font-bold text-slate-800">{selectedRequest.supervisorRemarks || selectedRequest.remarks}</span></p>
                    )}
                    {/* An approved Travel Order's Post Activity Reports or Certificates of Appearance */}
                    <TravelDocumentsPanel request={selectedRequest} user={user} className="mt-2" />
                  </div>
                ) : (<>
                {awaitsHead(selectedRequest) ? (
                  <SignedFormStep
                    key={selectedRequest.id}
                    title={selectedRequest.type === 'Leave Request' ? 'Decide and sign 7.C and 7.D in Adobe' : 'Sign the Travel Order in Adobe'}
                    description={selectedRequest.type === 'Leave Request'
                      ? (selectedRequest.signedForms?.hr ? 'The form already carries HR 2\'s signature at 7.A and 7.B. Mark your decision at 7.C or 7.D, sign it, and upload it.' : 'Mark your decision at 7.C or 7.D, sign it, and upload it.')
                      : 'Signing the Travel Order approves it. To disapprove it, use the button below instead.'}
                    decisions={selectedRequest.type === 'Leave Request' ? [{ value: 'Approved', label: 'Approved (7.C)' }, { value: 'Rejected', label: 'Disapproved (7.D)' }] : null}
                    remarksLabel="Approver's Official Remarks"
                    remarksPlaceholder="Recommendations or comments, or the reason for disapproving"
                    remarksRequiredFor="Rejected"
                    submitLabel={selectedRequest.type === 'Leave Request' ? 'Upload Signed Form & Record Decision' : 'Upload Signed Travel Order & Approve'}
                    onDownload={() => formToSign(selectedRequest)}
                    onSubmit={uploadSignedDecision}
                  />
                ) : (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">HR has not sent this request to you yet. You can sign it once HR 2 sends it; until then you can only return it to the employee.</p>
                )}

                {/* Returning needs no signed form; nor does disapproving a Travel Order. */}
                <div className="space-y-1.5 border-t border-slate-100 pt-4 text-xs text-left">
                  <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block font-bold">Remarks to return{selectedRequest.type === 'Travel Order' ? ' or disapprove' : ''}</label>
                  <textarea
                    rows={2}
                    value={remarks}
                    onChange={(e) => { setRemarks(e.target.value); if (e.target.value.trim()) setErrorMsg(''); }}
                    placeholder="What the employee needs to fix, or why it is disapproved"
                    className="w-full font-semibold border border-slate-200 rounded-lg p-3 bg-slate-50 text-slate-800 focus:outline-[#1e40af] placeholder-slate-400"
                  />
                </div>

                {errorMsg && (
                  <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl flex items-center gap-3 animate-fadeIn select-none text-left">
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                    <span className="font-bold text-xs">{errorMsg}</span>
                  </div>
                )}

                <div className={`grid gap-3 ${selectedRequest.type === 'Travel Order' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {selectedRequest.type === 'Travel Order' && (
                    <button
                      type="button"
                      onClick={() => handleDecision('Rejected')}
                      disabled={isSavingDecision}
                      className="py-2.5 px-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-bold hover:bg-rose-100 transition-colors cursor-pointer text-xs flex items-center justify-center gap-1.5 disabled:cursor-wait disabled:opacity-60"
                    >
                      <XCircle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>{isSavingDecision ? 'Saving…' : 'Disapprove Travel Order'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDecision('Returned')}
                    disabled={isSavingDecision}
                    className="py-2.5 px-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 font-bold hover:bg-amber-100 transition-colors cursor-pointer text-xs flex items-center justify-center gap-1.5 disabled:cursor-wait disabled:opacity-60"
                  >
                    <span>{isSavingDecision ? 'Saving…' : 'Return to Employee (needs changes)'}</span>
                  </button>
                </div>
                </>)}

              </div>
            ) : (
              <div className="space-y-5">
                <div className="text-center py-6 text-slate-400 space-y-2">
                  <Signature className="w-10 h-10 text-slate-300 mx-auto animate-none" />
                  <p className="font-extrabold text-xs">No applicant request selected.</p>
                  <p className="text-[10px] text-slate-400 max-w-[200px] mx-auto leading-relaxed font-semibold">
                    Select a request from the left panel to review its details, verify the leave balance, and sign it in Adobe.
                  </p>
                </div>

                <p className="border-t border-slate-100 pt-4 text-[10px] font-semibold leading-relaxed text-slate-500">
                  You sign leave forms, Travel Orders and DTRs in Adobe Acrobat with your digital ID: download the form here, sign it, and upload the signed PDF.
                </p>
              </div>
            )}
          </div>


        </div>
      </div>
      </>)}

      {/* Renders CSC Form No. 6 Modal Preview / Travel Order Preview */}
      {showForm6Request && showForm6Request.type === 'Leave Request' && (
        <CSCForm6Preview
          request={showForm6Request}
          user={getRequester(showForm6Request) || { name: showForm6Request.employeeName }}
          onClose={() => setShowForm6Request(null)}
        />
      )}

      {showForm6Request && showForm6Request.type === 'Travel Order' && (
        <TravelOrderPreview
          request={showForm6Request}
          user={getRequester(showForm6Request) || { name: showForm6Request.employeeName }}
          onClose={() => setShowForm6Request(null)}
        />
      )}

    </div>
  );
}
