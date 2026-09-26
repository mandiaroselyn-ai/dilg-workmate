/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useEffect } from 'react';
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

export default function RequestsView({
  user,
  requests,
  onSubmitRequest,
  onUpdateRequestStatus
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

  // Draft tracker ID & Editing state
  const [editingDraftId, setEditingDraftId] = useState(null);

  // File Attachments lists
  const [attachments, setAttachments] = useState([]);
  const [uploadTarget, setUploadTarget] = useState(null);
  const [simUploadProgress, setSimUploadProgress] = useState(null);
  const [dragActive, setDragActive] = useState(false);

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

  useEffect(() => {
    if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      if (e >= s) {
        let count = 0;
        const cur = new Date(s);
        while (cur <= e) {
          const day = cur.getDay();
          if (day !== 0 && day !== 6) { // Mon - Fri
            count++;
          }
          cur.setDate(cur.getDate() + 1);
        }
        setWorkingDays(count);
      } else {
        setWorkingDays(0);
      }
    } else {
      setWorkingDays(0);
    }
  }, [startDate, endDate]);

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
      simulateFileUpload(e.dataTransfer.files[0].name, section);
    }
  };

  const handleFileSelect = (e, section) => {
    if (e.target.files && e.target.files[0]) {
      simulateFileUpload(e.target.files[0].name, section);
    }
  };

  // Upload progress animation
  const simulateFileUpload = (fileName, section) => {
    setUploadTarget(section);
    setSimUploadProgress(0);
    
    let progress = 0;
    const interval = setInterval(() => {
      progress += 25;
      setSimUploadProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          const sizeKb = Math.floor(Math.random() * 800) + 120;
          const newFile = {
            id: `file-${Date.now()}`,
            name: fileName,
            size: `${(sizeKb / 1024).toFixed(2)} MB`,
            type: section === 'medical' ? 'Medical Certificate' : 'Supporting Doc'
          };
          setAttachments(prev => [...prev, newFile]);
          setSimUploadProgress(null);
          setUploadTarget(null);
        }, 300);
      }
    }, 150);
  };

  const deleteAttachment = (fileId) => {
    setAttachments(prev => prev.filter(f => f.id !== fileId));
  };

  // Create or update a form submission
  const handleFormSubmission = (isDraftMode) => {
    setFormErrorMessage('');
    if (!purpose.trim()) {
      setFormErrorMessage('Please provide the purpose or reason for your request.');
      return;
    }
    if (!startDate || !endDate) {
      setFormErrorMessage('Pakikipagtatala: Piliin ang simula at huling araw ng iyong request (Start & End periods).');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setFormErrorMessage('Pakikipagtatala: Hindi maaari na ang huling araw ay nauna sa simula.');
      return;
    }

    const typeLabel = activeTab2 === 'Leave' ? 'Leave Request' : 'Travel Order';
    const cleanDetailsType = activeTab2 === 'Leave' ? detailsType : 'Official Operations';

    const extraFields = {
      status: isDraftMode ? 'Draft' : 'Pending',
      leaveType: activeTab2 === 'Leave' ? leaveType : 'N/A',
      detailsType: cleanDetailsType,
      detailsSpecify: activeTab2 === 'Leave' ? detailsSpecify : 'N/A',
      commutation: activeTab2 === 'Leave' ? commutation : 'Not Requested',
      workingDays: activeTab2 === 'Leave' ? workingDays : 0,
      attachments: attachments
    };

    if (editingDraftId) {
      // Draft edits are handled through backend updates and in-memory state only.
    }

    const compiledPurpose = activeTab2 === 'Leave' 
      ? `Leave Type: ${leaveType}. ${purpose}`
      : `Official Travel. ${purpose}`;

    onSubmitRequest(typeLabel, startDate, endDate, compiledPurpose, extraFields);

    // Provide visual success report
    const bannerMessage = isDraftMode
      ? 'A draft copy has been securely logged to your draft tray.'
      : 'Leave Application transmitted securely to John Erick J. Matining (HR Admin) for evaluation.';
    
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

  const discardDraft = (draftId) => {
    onUpdateRequestStatus(draftId, {
      status: 'Cancelled',
      remarks: 'Draft discarded by user.'
    });
  };

  // Filter & Search the logs list
  const filteredRequests = requests.filter(req => {
    const searchString = `${req.type} ${req.purpose} ${req.leaveType || ''} ${req.approver || ''} ${req.id}`.toLowerCase();
    const matchesSearch = searchString.includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'All' ? true : req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const countByStatus = (status) => {
    return requests.filter(r => r.status === status).length;
  };

  return (
    <div className="p-4 sm:p-8 space-y-8 overflow-y-auto flex-1 id-requests-view font-sans">
      
      {/* Dynamic Summary Cards widgets */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-left">
        {/* Total Box */}
        <div className="bg-white border border-slate-200/80 p-3 sm:p-4 rounded-xl flex items-center justify-between shadow-xs">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Total Filed</span>
            <span id="stat-total-reqs" className="text-lg sm:text-xl font-extrabold text-slate-800 block">{requests.filter(r => r.status !== 'Draft').length} Logged</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100 shrink-0">
            <FileText className="w-4 h-4 text-[#1e40af]" />
          </div>
        </div>

        {/* Pending Box */}
        <div className="bg-white border border-slate-200/80 p-3 sm:p-4 rounded-xl flex items-center justify-between shadow-xs">
          <div className="space-y-1">
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider block">Awaiting Action</span>
            <span id="stat-pending-reqs" className="text-lg sm:text-xl font-extrabold text-amber-600 block">{countByStatus('Pending')} Pending</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center border border-amber-100 shrink-0">
            <Clock className="w-4 h-4 text-amber-500 animate-pulse" />
          </div>
        </div>

        {/* Approved Box */}
        <div className="bg-white border border-slate-200/80 p-3 sm:p-4 rounded-xl flex items-center justify-between shadow-xs">
          <div className="space-y-1">
            <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider block">Approved Forms</span>
            <span id="stat-approved-reqs" className="text-lg sm:text-xl font-extrabold text-emerald-650 block">{countByStatus('Approved')} Certified</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center border border-emerald-100 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
        </div>

        {/* Drafts Box */}
        <div className="bg-white border border-slate-200/80 p-3 sm:p-4 rounded-xl flex items-center justify-between shadow-xs">
          <div className="space-y-1">
            <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider block">My Saved Drafts</span>
            <span id="stat-drafts-reqs" className="text-lg sm:text-xl font-extrabold text-indigo-650 block">{countByStatus('Draft')} Drafts</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center border border-indigo-100 shrink-0">
            <Edit2 className="w-4 h-4 text-indigo-500" />
          </div>
        </div>
      </div>

      {/* Main split work dashboard */}
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
          <div className="p-6 bg-gradient-to-r from-[#1d4ed8] to-[#1e40af] text-white space-y-1">
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
                  Editing Draft
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
                  <p className="font-bold text-slate-700">{new Date().toISOString().split('T')[0]}</p>
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

              {/* Destination & Funding Source (Only for Travel) */}
              {activeTab2 === 'Travel' && (
                <div className="space-y-4 animate-none">
                  {/* Destination Input */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#1e40af]" />
                      <span>Destination / Station to Visit</span>
                    </label>
                    <input
                      required
                      type="text"
                      placeholder="e.g., DILG Regional Office IV-A, Calamba City or LGU Boac"
                      value={detailsSpecify}
                      onChange={(e) => setDetailsSpecify(e.target.value)}
                      className="w-full text-xs font-semibold rounded-lg border border-slate-200 pl-3 p-3.5 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-[#1e40af]"
                    />
                  </div>

                  {/* Funding Source Selector */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Source of Funds for Expenses</label>
                    <select
                      value={detailsType}
                      onChange={(e) => setDetailsType(e.target.value)}
                      className="w-full text-xs font-bold rounded-lg border border-slate-200 bg-slate-50 text-slate-800 p-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-[#1e40af] transition-all font-semibold font-sans"
                    >
                      <option value="Provincial Operations Funds">Provincial Operations Funds (Standard)</option>
                      <option value="Local LGU Counterpart Funds">Local LGU Counterpart Funds</option>
                      <option value="Regional Training Funds">Regional Training Funds</option>
                      <option value="Personal / Non-reimbursable Travel">Personal / Non-reimbursable Travel (Official Time Only)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Range pickers */}
              <div className="grid grid-cols-2 gap-4 text-left animate-none">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                    {activeTab2 === 'Leave' ? 'Start Date' : 'Departure Date'}
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
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
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full text-xs font-bold rounded-lg border border-slate-200 pl-9 p-3 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-[#1e40af] font-semibold"
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Auto-calculated Days block */}
              {activeTab2 === 'Leave' && workingDays > 0 && (
                <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 p-3 rounded-lg text-xs font-extrabold flex items-center justify-between animate-none">
                  <span>Computed span:</span>
                  <span className="bg-emerald-600 text-white font-black px-2 py-0.5 rounded text-[10px] animate-none font-semibold">
                    {workingDays} Working Days
                  </span>
                </div>
              )}

              {activeTab2 === 'Travel' && startDate && endDate && (
                <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 p-3 rounded-lg text-xs font-extrabold flex items-center justify-between animate-none">
                  <span>Computed span:</span>
                  <span className="bg-emerald-600 text-white font-black px-2 py-0.5 rounded text-[10px] animate-none font-semibold">
                    {Math.max(0, Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1)} Calendar Day(s)
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

              {/* Justification Text area */}
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Official Justification / Purpose</label>
                <textarea
                  required
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  rows={3}
                  placeholder="State the detailed, honest purpose or health circumstances for the documentation..."
                  className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-800 p-3.5 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-[#1e40af] transition-all leading-relaxed"
                />
              </div>

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

              {/* Advanced Attachments File Zone (Drag and Drop / Selector) */}
              <div className="border-t border-slate-100 pt-4 space-y-3 text-left">
                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Attachments Portal</label>
                
                <div className="grid grid-cols-2 gap-3 pb-1">
                  {/* Medical Certificate area */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'medical')}
                    className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[90px] ${
                      dragActive ? 'border-[#1e40af] bg-blue-50/50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100/50'
                    }`}
                  >
                    <input
                      type="file"
                      id="file-med"
                      className="hidden"
                      onChange={(e) => handleFileSelect(e, 'medical')}
                    />
                    <label htmlFor="file-med" className="w-full h-full cursor-pointer flex flex-col items-center justify-center">
                      <Upload className="w-4.5 h-4.5 text-slate-400 mb-1" />
                      <span className="text-[9.5px] font-extrabold text-[#111827] block">{activeTab2 === 'Leave' ? 'Medical Certificate' : 'Official Memo / Invitation'}</span>
                      <span className="text-[7.5px] text-slate-400 mt-0.5 block">Drag here or Browse</span>
                    </label>
                  </div>

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
                      onChange={(e) => handleFileSelect(e, 'support')}
                    />
                    <label htmlFor="file-support" className="w-full h-full cursor-pointer flex flex-col items-center justify-center">
                      <Paperclip className="w-4.5 h-4.5 text-slate-400 mb-1" />
                      <span className="text-[9.5px] font-extrabold text-[#111827] block">{activeTab2 === 'Leave' ? 'Supporting Docs' : 'Supporting Documents'}</span>
                      <span className="text-[7.5px] text-slate-400 mt-0.5 block">Drag here or Browse</span>
                    </label>
                  </div>
                </div>

                {/* Upload Action Progress Animation */}
                {simUploadProgress !== null && (
                  <div className="bg-blue-50 border border-blue-100 p-2.5 rounded-lg text-[9px] font-bold text-slate-600 flex items-center justify-between gap-3 select-none">
                    <div className="flex-1 space-y-1">
                      <p className="font-extrabold text-slate-750">Uploading to HR secure servers...</p>
                      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-[#1e40af] transition-all duration-150" style={{ width: `${simUploadProgress}%` }}></div>
                      </div>
                    </div>
                    <span className="font-mono text-[10px] text-[#1e40af] shrink-0 font-extrabold">{simUploadProgress}%</span>
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
                  <span>{activeTab2 === 'Leave' ? 'Submit Leave Request' : 'Submit Travel Order'}</span>
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* Right Panel: Submission History Logs & Live Signor Review Console */}
        <div className="lg:col-span-6 space-y-6 mt-0">
          
          {/* Executive Administrative Approvals Reviewer panel */}
          {showAdminPanel && (
            <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl shadow-xs space-y-3.5 text-left md:mt-0">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <div className="flex items-center gap-1.5">
                  <FileCheck2 className="w-5 h-5 text-[#1e40af]" />
                  <span className="font-extrabold text-slate-750 text-xs uppercase tracking-wider">LGU Director Review Console</span>
                </div>
                <button
                  onClick={() => setShowAdminPanel(false)}
                  className="text-[10px] text-[#1e40af] hover:underline font-bold cursor-pointer border-0 bg-transparent"
                >
                  Hide Admin Portal
                </button>
              </div>

              <p className="text-[11px] text-slate-505 font-medium leading-relaxed font-semibold">
                Review, endorse, and electronically sign pending employee applications:
              </p>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {requests.filter(r => r.status === 'Pending').length === 0 ? (
                  <div className="text-center py-5 text-xs text-slate-450 font-bold">
                    No pending leave orders to finalize signatures on.
                  </div>
                ) : (
                  requests.filter(r => r.status === 'Pending').map(pending => (
                    <div key={pending.id} className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-4 text-xs shadow-xs text-left">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="bg-blue-50 border border-blue-100 text-[#1e40af] font-mono text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase">{pending.id}</span>
                          <span className="font-extrabold text-slate-800">{pending.type}</span>
                        </div>
                        <p className="text-slate-500 text-[10.5px] mt-1 line-clamp-1 font-semibold">{pending.purpose}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => onUpdateRequestStatus(
                            pending.id,
                            'Approved',
                            'GERMAN F. YAP, CESO V (Provincial Director)',
                            'Verified leaf credits sufficient. Electronic CSC6 approved.'
                          )}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-[10px] font-bold text-white rounded cursor-pointer transition-colors border-0 font-semibold"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => onUpdateRequestStatus(
                            pending.id,
                            'Rejected',
                            'GERMAN F. YAP, CESO V (Provincial Director)',
                            'Declined. Heavy overlapping activities.'
                          )}
                          className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-[10px] font-bold text-white rounded cursor-pointer transition-colors border-0 font-semibold"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Submission History Feed list */}
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xs space-y-5 text-left md:mt-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wide">My Leave Application Logs</h3>
                <p className="text-xs text-slate-400 mt-0.5">Filter, resume drafted requests, or download approved Form 6 versions.</p>
              </div>

              {!showAdminPanel && (
                <button
                  onClick={() => setShowAdminPanel(true)}
                  className="text-xs font-extrabold text-[#1e40af] bg-blue-50 px-2.5 py-1 border border-blue-100 rounded hover:bg-blue-100 transition-colors cursor-pointer text-[10px] uppercase font-semibold text-center"
                >
                  Admin Tools
                </button>
              )}
            </div>

            {/* Dynamic filter controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3.5 text-left">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter by Code, Type, Approver..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-4 py-2 text-slate-800 placeholder-slate-405 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-[#1e40af] transition-all"
                />
              </div>

              {/* Status categories with counts */}
              <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-[10px] font-bold text-slate-500 shrink-0 self-start sm:self-auto">
                {['All', 'Pending', 'Approved', 'Rejected', 'Draft'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setStatusFilter(tab)}
                    className={`px-2.5 py-1 rounded transition-all cursor-pointer border-0 font-semibold ${
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
              {filteredRequests.length === 0 ? (
                <div className="p-12 text-center text-slate-400 font-bold border border-slate-202 bg-slate-50 rounded-2xl">
                  No Leave applications matched corresponding filters.
                </div>
              ) : (
                filteredRequests.map((req) => (
                  <div
                    key={req.id}
                    className={`p-5 rounded-xl border transition-all space-y-4 bg-white text-left ${
                      req.status === 'Pending' ? 'border-amber-200 shadow-xs' :
                      req.status === 'Approved' ? 'border-emerald-200 shadow-xs' :
                      req.status === 'Draft' ? 'border-indigo-200 shadow-xs' : 'border-rose-200 shadow-xs'
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
                          <span>Span: {req.startDate} to {req.endDate}</span>
                        </div>
                      </div>

                      {/* Status pill badge */}
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-extrabold border shrink-0 ${
                        req.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-150' :
                        req.status === 'Rejected' ? 'bg-rose-50 text-rose-700 border-rose-150' :
                        req.status === 'Draft' ? 'bg-indigo-50 text-indigo-700 border-indigo-150' : 'bg-amber-50 text-amber-700 border-amber-150'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          req.status === 'Approved' ? 'bg-emerald-500' :
                          req.status === 'Rejected' ? 'bg-rose-500' :
                          req.status === 'Draft' ? 'bg-indigo-500' : 'bg-amber-500 animate-pulse'
                        }`}></span>
                        {req.status}
                      </span>
                    </div>

                    {/* Purpose Statement display box */}
                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-xs font-semibold text-slate-650 leading-relaxed font-semibold text-left">
                      {req.purpose}
                    </div>

                    {/* Show files listed if there are attachments inside */}
                    {req.attachments && req.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 items-center select-none pt-1">
                        <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {req.attachments.map((file) => (
                          <span key={file.id} className="bg-slate-100 text-slate-600 border border-slate-205 rounded px-2 py-0.5 text-[8.5px] font-bold">
                            {file.name}
                          </span>
                        ))}
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
                            {req.status === 'Pending' ? (
                              <>
                                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping"></span>
                                <span>Awaiting Program Manager endorsement</span>
                              </>
                            ) : (
                              <>
                                <span className={`w-1.5 h-1.5 rounded-full ${req.status === 'Approved' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                <span className="truncate max-w-[200px]">Processed by: {req.approver}</span>
                              </>
                            )}
                          </div>

                          {/* Dynamic CSC Form 6 / Travel Order trigger modal */}
                          <button
                            onClick={() => setPreviewRequest(req)}
                            className="px-3 py-2 bg-gradient-to-r from-blue-900 to-[#1e40af] hover:from-black hover:to-indigo-900 text-white text-[10px] font-black rounded-lg transition-all flex items-center gap-1.5 shadow-xs cursor-pointer select-none font-semibold border-0"
                          >
                            <Eye className="w-4 h-4 text-yellow-300" />
                            <span>{req.type === 'Leave Request' ? 'Generate CSC Form 6' : 'Generate Travel Order'}</span>
                          </button>
                        </>
                      )}

                    </div>
                  </div>
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
