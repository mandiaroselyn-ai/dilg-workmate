/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useRef, useEffect } from 'react';
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

export default function SupervisorView({
  user,
  requests,
  employees = [],
  activeEmployeeCount = null,
  onUpdateRequestStatus,
  // From a notification's button: { requestId } of the request to open.
  focus = null
}) {
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [remarks, setRemarks] = useState('');
  
  // Signature settings
  const [signatureMode, setSignatureMode] = useState('type');
  const [typewrittenName, setTypewrittenName] = useState('GERMAN F. YAP, CESO V');
  const [cursiveStyle, setCursiveStyle] = useState('Dancing Script');
  const [customInitials, setCustomInitials] = useState('GFY');
  const [selectedInkColor, setSelectedInkColor] = useState('blue'); // blue, black, red

  // Canvas drawing state
  const canvasRef = useRef(null);
  // A ref, so every pointer move sees at once that a stroke has started.
  const drawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Filters & Tabs
  const [activeMainTab, setActiveMainTab] = useState('requests');

  const [statusFilter, setStatusFilter] = useState('For Supervisor');
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
    setSelectedRequest(request);
    setRemarks(['Pending', 'For Supervisor'].includes(request.status) ? '' : request.supervisorRemarks || '');
  }, [focus]);

  const getRequester = (request) => request.employee || employees.find(employee => matchesAttendanceEmployee(request, employee));
  const requesterName = (request) => getRequester(request)?.name || request.employeeName || 'Employee name unavailable';
  const requesterId = (request) => getRequester(request)?.employeeId || request.employeeId || 'Not assigned';

  // Setup canvas drawings
  useEffect(() => {
    if (signatureMode === 'draw' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = selectedInkColor === 'blue' ? '#1e40af' : selectedInkColor === 'red' ? '#dc2626' : '#0f172a';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [signatureMode, selectedInkColor]);

  // The cursive signature fonts (loaded in index.css), by name.
  const cursiveFontStyle = name => ({ fontFamily: `"${name}", cursive` });

  // Where a mouse, finger, or pen is on the signature canvas, in canvas pixels: the canvas
  // is drawn 350 px wide but shown at the width of its box.
  const canvasPoint = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const startDrawing = (e) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    e.preventDefault();
    // Keeps the stroke going when the finger slides past the edge; drawing works without it.
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Not every browser allows capturing this pointer.
    }
    const { x, y } = canvasPoint(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawingRef.current = true;
  };

  const draw = (e) => {
    if (!drawingRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    e.preventDefault();
    const { x, y } = canvasPoint(e, canvas);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    drawingRef.current = false;
  };

  const clearCanvas = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const getSignatureDataUrl = () => {
    if (signatureMode === 'type') {
      return `type:${cursiveStyle}:${typewrittenName}`;
    }
    if (signatureMode === 'stamp') {
      return `stamp:${customInitials}:${selectedInkColor}`;
    }
    if (signatureMode === 'draw' && canvasRef.current && hasDrawn) {
      return canvasRef.current.toDataURL();
    }
    return '';
  };

  // Submit decision
  const handleDecision = async (decision) => {
    if (!selectedRequest || isSavingDecision) return;
    setErrorMsg('');
    if (decision === 'Rejected' && !remarks.trim()) {
      setErrorMsg('Please ensure you provide the reason (remarks) for disapproving the request.');
      return;
    }

    const finalRemarks = remarks.trim() || (decision === 'Approved' ? 'Approved based on sufficient leave balance.' : 'Operational conflicts.');
    const sigData = getSignatureDataUrl();

    let updatePayload = {};
    const today = getManilaDateString();

    if (decision === 'Rejected') {
      updatePayload = {
        status: 'Rejected',
        stage: 'Rejected',
        approver: 'Supervisor Review Desk',
        remarks: finalRemarks,
        supervisorSignature: sigData,
        supervisorRemarks: finalRemarks,
        supervisorApprovedAt: today,
        supervisorName: typewrittenName || user?.name || 'Supervisor',
        signatureData: sigData
      };
    } else {
      updatePayload = {
        status: 'Approved',
        stage: 'Supervisor Approved',
        approver: 'Supervisor Review Desk',
        remarks: finalRemarks,
        supervisorSignature: sigData,
        supervisorRemarks: finalRemarks,
        supervisorApprovedAt: today,
        supervisorName: typewrittenName || user?.name || 'Supervisor',
        signatureData: sigData
      };
    }

    setIsSavingDecision(true);
    try {
      await onUpdateRequestStatus(selectedRequest.id, updatePayload);
      setSuccessMsg(`Application ID ${selectedRequest.id} was successfully ${decision === 'Rejected' ? 'Disapproved' : 'Approved'}.`);
      setSelectedRequest(null);
      setRemarks('');
      clearCanvas();
      window.setTimeout(() => setSuccessMsg(''), 4500);
    } catch (error) {
      setErrorMsg(error.message || 'Unable to save the supervisor decision. Please try again.');
    } finally {
      setIsSavingDecision(false);
    }
  };

  // Stats summaries
  const pendingRequests = requests.filter(r => r.status === 'For Supervisor');
  const approvedRequests = requests.filter(r => r.status === 'Approved');
  const rejectedRequests = requests.filter(r => r.status === 'Rejected');

  // Search filter
  const filteredRequests = requests.filter(req => {
    const requester = getRequester(req);
    const searchString = `${req.type} ${req.purpose} ${req.id} ${requesterName(req)} ${requesterId(req)} ${requester?.office || ''}`.toLowerCase();
    const matchesSearch = searchString.includes(searchQuery.toLowerCase());
    if (req.status === 'Draft') return false;
    const matchesStatus = statusFilter === 'All' ? true : req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-4 sm:p-8 space-y-8 overflow-y-auto flex-1 id-supervisor-review-view font-sans">
      
      {/* Top Banner Alert */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center gap-3 shadow-xs animate-fadeIn select-none text-left">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-bold text-xs">{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-805 p-4 rounded-xl flex items-center gap-3 shadow-xs animate-fadeIn select-none text-left">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span className="font-bold text-xs">{errorMsg}</span>
        </div>
      )}

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
      </div>

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
                const count = tab === 'All' ? requests.length : requests.filter(r => r.status === tab).length;
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
                        Filing: {req.submissionDate} • Inclusive Dates: {req.startDate} to {req.endDate}
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
                    <div className="flex flex-wrap gap-1.5 items-center select-none text-[9px] text-[#1e40af] font-semibold text-left">
                      <span className="font-bold text-slate-400 uppercase text-[8px]">Attachments:</span>
                      {req.attachments.map((file) => (
                        <span key={file.id} className="bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5 font-bold">
                          {file.name}
                        </span>
                      ))}
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
                    {['Pending', 'For Supervisor'].includes(selectedRequest.status) && selectedRequest.remarks && (
                      <p className="font-semibold text-slate-500 mt-0.5">HR remarks: <span className="text-slate-800 font-bold">{selectedRequest.remarks}</span></p>
                    )}
                  </div>
                </div>

                {/* Supervisor Remarks Input */}
                <div className="space-y-1.5 text-xs text-left">
                  <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block font-bold">Approver's Official Remarks</label>
                  <textarea
                    rows={2}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Enter recommendations or comments for leave or travel order approval..."
                    className="w-full font-semibold border border-slate-200 rounded-lg p-3 bg-slate-50 text-slate-800 focus:outline-[#1e40af] placeholder-slate-400"
                  />
                  {selectedRequest.status === 'Pending' && (
                    <span className="text-[9.5px] text-slate-500 font-medium block leading-normal font-semibold">
                      These remarks and signature will serve as the final decision and official signature on the document.
                    </span>
                  )}
                </div>

                {/* Digital Signature Designer Setup */}
                <div className="space-y-3.5 border-t border-slate-100 pt-4 text-left">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block font-bold">Digital Signature Options</label>
                    <div className="flex gap-2 text-[9.5px] font-bold">
                      <button 
                        onClick={() => setSignatureMode('type')} 
                        className={`px-2 py-0.5 rounded cursor-pointer border-0 font-semibold ${signatureMode === 'type' ? 'bg-[#1e40af] text-white' : 'bg-slate-100 text-slate-600'}`}>
                        Typewritten
                      </button>
                      <button 
                        onClick={() => setSignatureMode('draw')} 
                        className={`px-2 py-0.5 rounded cursor-pointer border-0 font-semibold ${signatureMode === 'draw' ? 'bg-[#1e40af] text-white' : 'bg-slate-100 text-slate-600'}`}>
                        Manual Draw
                      </button>
                      <button 
                        onClick={() => setSignatureMode('stamp')} 
                        className={`px-2 py-0.5 rounded cursor-pointer border-0 font-semibold ${signatureMode === 'stamp' ? 'bg-[#1e40af] text-white' : 'bg-slate-100 text-slate-600'}`}>
                        Seal Stamp
                      </button>
                    </div>
                  </div>

                  {/* Mode 1: Cursive Script Generator */}
                  {signatureMode === 'type' && (
                    <div className="space-y-3 bg-slate-50/50 p-3 rounded-lg border border-slate-200 text-left">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="space-y-1">
                          <label className="text-[8px] font-bold text-slate-400 uppercase font-bold">Predefined Name</label>
                          <input 
                            type="text" 
                            value={typewrittenName} 
                            onChange={(e) => setTypewrittenName(e.target.value)}
                            className="w-full text-xs font-bold rounded border border-slate-200 bg-white p-2 text-slate-800"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-bold text-slate-400 uppercase font-bold">Cursive Script Font</label>
                          <select 
                            value={cursiveStyle} 
                            onChange={(e) => setCursiveStyle(e.target.value)}
                            className="w-full text-xs font-bold rounded border border-slate-200 bg-white p-2 text-slate-800"
                          >
                            <option value="Dancing Script">Dancing Script (Elegant)</option>
                            <option value="Alex Brush">Alex Brush (Calligraphy)</option>
                            <option value="Caveat">Caveat (Modern Cursive)</option>
                          </select>
                        </div>
                      </div>

                      {/* Preview script */}
                      <div className="bg-white border border-slate-200 rounded p-4 text-center min-h-[50px] flex items-center justify-center select-none shadow-inner">
                        <span className="text-2xl text-blue-700" style={cursiveFontStyle(cursiveStyle)}>
                          {typewrittenName || 'Empty'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Mode 2: Manual draw canvas */}
                  {signatureMode === 'draw' && (
                    <div className="space-y-2 bg-slate-50/50 p-3 rounded-lg border border-slate-200 text-left">
                      <div className="flex items-center justify-between text-[10px] font-bold flex-wrap gap-2 text-left">
                        <span className="text-slate-400 uppercase font-bold text-[9px]">Draw signature with mouse or finger:</span>
                        <div className="flex gap-2 text-[9px] font-bold select-none items-center">
                          <span className="text-slate-400 font-bold">Color ink:</span>
                          <button onClick={() => setSelectedInkColor('blue')} className={`w-3.5 h-3.5 rounded-full bg-blue-600 border border-white ${selectedInkColor === 'blue' ? 'ring-2 ring-indigo-500' : ''}`}></button>
                          <button onClick={() => setSelectedInkColor('black')} className={`w-3.5 h-3.5 rounded-full bg-slate-900 border border-white ${selectedInkColor === 'black' ? 'ring-2 ring-indigo-500' : ''}`}></button>
                          <button onClick={() => setSelectedInkColor('red')} className={`w-3.5 h-3.5 rounded-full bg-red-600 border border-white ${selectedInkColor === 'red' ? 'ring-2 ring-indigo-500' : ''}`}></button>
                        </div>
                      </div>
                      
                      <div className="relative border border-slate-200 bg-white rounded-lg shadow-inner overflow-hidden cursor-crosshair">
                        <canvas
                          ref={canvasRef}
                          width={350}
                          height={120}
                          onPointerDown={startDrawing}
                          onPointerMove={draw}
                          onPointerUp={stopDrawing}
                          onPointerCancel={stopDrawing}
                          onPointerLeave={stopDrawing}
                          className="w-full touch-none"
                        />
                      </div>
                      <div className="flex justify-end select-none">
                        <button
                          type="button"
                          onClick={clearCanvas}
                          className="text-[9px] font-black text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded px-2.5 py-1 cursor-pointer transition-all font-semibold"
                        >
                          Clear Canvas drawing
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Mode 3: Badge stamp initials selection */}
                  {signatureMode === 'stamp' && (
                    <div className="space-y-3 bg-slate-50/50 p-3 rounded-lg border border-slate-200 text-left">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="space-y-1">
                          <label className="text-[8px] font-bold text-slate-400 uppercase font-bold">Stamp Initials</label>
                          <input 
                            type="text" 
                            maxLength={3} 
                            value={customInitials} 
                            onChange={(e) => setCustomInitials(e.target.value.toUpperCase())}
                            className="w-full text-xs font-bold rounded border border-slate-200 p-2 bg-white text-slate-800"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-bold text-slate-400 uppercase font-bold">Stamp Colors</label>
                          <select 
                            value={selectedInkColor} 
                            onChange={(e) => setSelectedInkColor(e.target.value)}
                            className="w-full text-xs font-bold rounded border border-slate-200 p-2 bg-white text-slate-800"
                          >
                            <option value="blue">Official Royal Blue</option>
                            <option value="red">Urgent Ruby Red</option>
                            <option value="black">Doc Slate Black</option>
                          </select>
                        </div>
                      </div>

                      {/* Display circular rubber ink stamp */}
                      <div className="bg-white border border-slate-200 rounded p-4 text-center min-h-[90px] flex items-center justify-center select-none shadow-inner">
                        <div className={`w-16 h-16 border-2 border-dashed rounded-full flex flex-col items-center justify-center font-mono leading-none ${
                          selectedInkColor === 'blue' ? 'text-blue-600 border-blue-500 bg-blue-50/20' :
                          selectedInkColor === 'red' ? 'text-red-700 border-red-500 bg-red-50/20' :
                          'text-slate-900 border-slate-800 bg-slate-100/20'
                        }`}>
                          <span className="text-[6px] font-black uppercase font-bold">AUTHORIZED</span>
                          <span className="text-sm font-black my-1 uppercase font-bold">{customInitials || 'STAMP'}</span>
                          <span className="text-[5px] font-bold uppercase font-bold">DILG GOV</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Double Decisive Button Layout Drawer */}
                <div className="grid grid-cols-2 gap-3.5 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleDecision('Rejected')}
                    disabled={isSavingDecision}
                    className="py-3 px-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-bold hover:bg-rose-100 transition-colors cursor-pointer text-xs flex items-center justify-center gap-1.5 font-semibold disabled:cursor-wait disabled:opacity-60"
                  >
                    <XCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{isSavingDecision ? 'Saving…' : 'Disapprove Request'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDecision('Approved')}
                    disabled={isSavingDecision}
                    className="py-3 px-3 rounded-xl bg-emerald-600 text-white font-extrabold hover:bg-emerald-500 transition-colors cursor-pointer text-xs flex items-center justify-center gap-1.5 shadow-sm font-semibold border-0 disabled:cursor-wait disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-white" />
                    <span>{isSavingDecision ? 'Saving…' : 'Sign & Approve Request'}</span>
                  </button>
                </div>

              </div>
            ) : (
              <div className="text-center py-10 text-slate-400 space-y-2">
                <Signature className="w-10 h-10 text-slate-300 mx-auto animate-none" />
                <p className="font-extrabold text-xs">No applicant request selected.</p>
                <p className="text-[10px] text-slate-400 max-w-[200px] mx-auto leading-relaxed font-semibold">
                  Select a request from the left panel to review its details, verify the leave balance, and apply your digital signature.
                </p>
              </div>
            )}
          </div>


        </div>
      </div>

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
