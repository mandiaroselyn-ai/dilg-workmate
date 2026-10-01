import React, { useMemo, useState } from 'react';
import { ArrowRight, BriefcaseBusiness, CalendarDays, Check, CheckCircle2, ChevronLeft, ClipboardCheck, Clock3, FileCheck2, FileText, Filter, History, MapPin, MessageSquare, Plane, Search, ShieldCheck, UserRound, Users } from 'lucide-react';

const statusTone = { Pending: 'bg-amber-50 text-amber-700', 'Pending Review': 'bg-amber-50 text-amber-700', Returned: 'bg-rose-50 text-rose-700', Validated: 'bg-emerald-50 text-emerald-700', 'For Supervisor': 'bg-blue-50 text-blue-700', Approved: 'bg-emerald-50 text-emerald-700', Rejected: 'bg-rose-50 text-rose-700' };
const validationItems = ['Employee Information Verified', 'Request Details Checked', 'Required Attachments Complete', 'Request Information Complete', 'Supporting Documents Verified'];
const getType = request => request.type === 'Travel Order' ? 'Travel' : 'Leave';
const getStatus = request => request.status || 'Pending Review';
const employeeName = request => request.employee?.name
  || request.employee?.fullName
  || [request.employee?.firstName, request.employee?.middleName, request.employee?.lastName].filter(Boolean).join(' ')
  || request.employeeName
  || (request.employeeId ? `Employee ${request.employeeId}` : 'Employee');
const employeeId = request => request.employee?.employeeId || request.employeeId || 'Not assigned';
const dateSubmitted = request => request.submissionDate || request.createdAt?.split('T')[0] || '-';
const requestTimeline = request => {
  const status = normalized(request.status);
  const history = new Set((request.statusHistory || []).map(item => normalized(item.status)));
  const approvedOrRejected = status === 'approved' || status === 'rejected';
  const forwarded = history.has('for supervisor') || status === 'for supervisor' || approvedOrRejected;
  const validated = history.has('validated') || forwarded;
  const adminValidation = history.has('admin validation') || validated;
  const underReview = history.has('under review') || approvedOrRejected;

  return [
    { label: 'Submitted', complete: true, detail: 'Recorded in request activity' },
    { label: 'Admin Validation', complete: adminValidation, detail: adminValidation ? 'Checked by HR/Admin' : 'Awaiting HR/Admin validation' },
    { label: 'Validated', complete: validated, detail: validated ? 'Request information validated' : 'Awaiting validation' },
    { label: 'Forwarded to Supervisor', complete: forwarded, detail: forwarded ? 'Forwarded for Supervisor action' : 'Awaiting HR/Admin handoff' },
    { label: 'Under Review', complete: underReview, detail: underReview ? 'Supervisor review recorded' : 'Awaiting Supervisor action' },
    { label: approvedOrRejected ? status[0].toUpperCase() + status.slice(1) : 'Approved / Rejected', complete: approvedOrRejected, detail: approvedOrRejected ? `Final decision: ${status}` : 'Awaiting Supervisor decision' }
  ];
};
const normalized = value => value?.toString().trim().toLowerCase() || '';
const requesterMatches = (request, employee) => {
  const requestId = normalized(request.employeeId);
  const requestEmail = normalized(request.employeeEmail);
  const requestName = normalized(request.employeeName);
  const employeeIdValue = normalized(employee.employeeId || employee.id);
  const employeeEmail = normalized(employee.email);
  const employeeNameValue = normalized(employee.name || [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(' '));

  return Boolean(
    (requestId && employeeIdValue && requestId === employeeIdValue)
    || (requestEmail && employeeEmail && requestEmail === employeeEmail)
    || (requestName && employeeNameValue && requestName === employeeNameValue)
  );
};

// Only a request waiting for HR can be forwarded; the note says why another cannot.
const canForward = request => ['Pending', 'Pending Review'].includes(getStatus(request));
const forwardNote = request => ({
  'For Supervisor': 'Already forwarded to the Supervisor, who makes the final decision.',
  Approved: 'The Supervisor approved this request. There is nothing left to forward.',
  Rejected: 'The Supervisor rejected this request. There is nothing left to forward.',
  Withdrawn: 'The employee withdrew this request, so it cannot be forwarded.',
  Returned: 'This request was returned to the employee, so it cannot be forwarded.'
}[getStatus(request)] || `This request is ${getStatus(request)}, so it cannot be forwarded.`);

const Badge = ({ status }) => <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${statusTone[status] || 'bg-slate-100 text-slate-600'}`}>{status}</span>;
const Detail = ({ label, value, icon: Icon = FileText }) => <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /><div><p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-words text-xs font-bold text-slate-800">{value || '-'}</p></div></div>;
const Stat = ({ label, value, icon: Icon, tone, onClick }) => <button type="button" onClick={onClick} className="rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"><div className="flex items-center justify-between"><span className={`flex h-8 w-8 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span><strong className="text-2xl font-black text-slate-900">{value}</strong></div><p className="mt-3 text-xs font-black uppercase tracking-wide text-slate-500">{label}</p><span className="mt-1 block text-xs font-bold text-blue-600">View requests</span></button>;

export default function HRAdminRequestsView({ requests = [], employees = [], onUpdateRequests, onUpdateRequestStatus, focusRequestId }) {
  // A notification's button opens this request first.
  const focusedRequest = focusRequestId ? requests.find(request => request.id === focusRequestId) || null : null;
  const [screen, setScreen] = useState(focusedRequest ? 'details' : 'dashboard');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selected, setSelected] = useState(focusedRequest);
  const [remarks, setRemarks] = useState(focusedRequest?.remarks || '');
  const [checks, setChecks] = useState({});
  const [toast, setToast] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  // A draft is the employee's own until they submit it.
  const data = useMemo(() => requests.filter(request => request.status !== 'Draft').map(request => {
    const employee = employees.find(item => requesterMatches(request, item));
    return { ...request, employee: employee || request.employee, requestType: getType(request), currentStatus: getStatus(request) };
  }), [requests, employees]);
  const pending = data.filter(request => ['Pending', 'Pending Review'].includes(request.currentStatus));
  const returned = data.filter(request => request.currentStatus === 'Returned');
  const forwarded = data.filter(request => request.currentStatus === 'For Supervisor');
  const leave = data.filter(request => request.requestType === 'Leave');
  const travel = data.filter(request => request.requestType === 'Travel');
  const visible = data.filter(request => (kind === 'All' || request.requestType === kind) && (statusFilter === 'All' || request.currentStatus === statusFilter || (statusFilter === 'Pending' && ['Pending', 'Pending Review'].includes(request.currentStatus))) && `${employeeName(request)} ${employeeId(request)} ${request.type || ''} ${request.purpose || ''} ${request.id || ''}`.toLowerCase().includes(search.toLowerCase()));
  const initials = name => name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
  const notify = message => { setToast(message); window.setTimeout(() => setToast(''), 3500); };
  const open = request => { setSelected(request); setRemarks(request.remarks || ''); setChecks({}); setScreen('details'); };
  const update = async (request, status) => {
    if (!request?.id) {
      notify('Unable to forward: request ID is missing.');
      return;
    }
    const updatePayload = {
      status,
      remarks,
      forwardedTo: 'Supervisor',
      adminActionAt: new Date().toISOString()
    };
    setIsUpdating(true);
    try {
      if (onUpdateRequestStatus) {
        await onUpdateRequestStatus(request.id, updatePayload);
      } else {
        onUpdateRequests?.(requests.map(item => item.id === request.id ? { ...item, ...updatePayload } : item));
      }
      setSelected({ ...request, ...updatePayload });
      setScreen('dashboard');
      notify('Request successfully forwarded to the Supervisor.');
    } catch (error) {
      notify(error.message || 'Unable to forward request to the Supervisor.');
    } finally {
      setIsUpdating(false);
    }
  };
  const allChecked = validationItems.every(item => checks[item]);
  // HR forwards only requests waiting for HR, after checking every validation item.
  const handleForwardToSupervisor = async () => {
    if (isUpdating || !selected || !canForward(selected) || !allChecked) return;
    await update(selected, 'For Supervisor');
  };
  const Card = ({ request }) => <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-black text-blue-700">{initials(employeeName(request))}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black text-slate-900">{employeeName(request)}</p><Badge status={request.currentStatus} /></div><p className="mt-1 text-[11px] font-black text-blue-700">{request.id || 'Request ID unavailable'}</p><p className="mt-1 text-xs font-bold text-slate-600">{request.type || 'Leave Request'}</p><p className="mt-1 text-[11px] text-slate-500">Submitted {dateSubmitted(request)} · Employee ID: {employeeId(request)}</p><p className="mt-1 text-[11px] font-semibold text-slate-500">{request.employee?.role || request.role || 'Employee'} · {request.employee?.office || request.office || 'Office not assigned'}</p></div></div><div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-xs font-bold text-slate-500">{request.attachments?.length ? `${request.attachments.length} attachment(s)` : 'Attachments for review'}</span><button type="button" onClick={() => open(request)} className="inline-flex items-center gap-1 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">View Details <ArrowRight className="h-3.5 w-3.5" /></button></div></article>;

  if (screen === 'details' && selected) { const details = selected.recordDetails || {}; return <div className="w-full min-w-0 space-y-4 pb-24 sm:pb-0"><button type="button" onClick={() => setScreen('dashboard')} className="inline-flex items-center gap-1 text-xs font-black text-blue-700"><ChevronLeft className="h-4 w-4" />Request Management</button><section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-blue-600">Request Details</p><h2 className="mt-1 text-xl font-black text-slate-900">{selected.id || 'Request'}</h2><p className="mt-1 text-xs text-slate-500">Submitted {dateSubmitted(selected)}</p></div><Badge status={selected.status || selected.currentStatus} /></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><Detail icon={UserRound} label="Employee Name" value={employeeName(selected)} /><Detail icon={Users} label="Employee ID" value={employeeId(selected)} /><Detail icon={BriefcaseBusiness} label="Position / Designation" value={selected.position || selected.role || selected.employee?.role} /><Detail icon={MapPin} label="Office / Department" value={selected.office || selected.employee?.office} /><Detail icon={FileText} label="Request Type" value={selected.type} /><Detail icon={CalendarDays} label="Date Submitted" value={dateSubmitted(selected)} /></div></section><section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="text-sm font-black text-slate-900">Request Details</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{selected.type === 'Travel Order' ? <><Detail icon={MapPin} label="Destination" value={selected.destination || details.destination} /><Detail icon={Plane} label="Purpose of Travel" value={selected.purpose || details.purpose} /><Detail icon={CalendarDays} label="Travel Dates" value={`${selected.startDate || details.startDate || '-'} to ${selected.endDate || details.endDate || '-'}`} /><Detail icon={BriefcaseBusiness} label="Transportation" value={selected.transportation || details.transportation} /></> : <><Detail label="Leave Type" value={selected.leaveType || details.leaveType || 'Leave Application'} /><Detail icon={CalendarDays} label="Inclusive Dates" value={`${selected.startDate || '-'} to ${selected.endDate || '-'}`} /><Detail icon={Clock3} label="Number of Days" value={selected.workingDays || selected.numberOfDays || details.numberOfDays} /><Detail icon={MessageSquare} label="Reason" value={selected.purpose} /><Detail icon={FileCheck2} label="Leave Credits" value={selected.leaveCredits || details.leaveCredits || 'For HR verification'} /></>}</div><div className="mt-2"><Detail label="Required Attachments" value={selected.attachments?.length ? selected.attachments.map(file => file.name || file).join(', ') : 'No supporting documents attached'} /></div></section>{canForward(selected) ? <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4"><div className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-blue-700" /><h3 className="text-sm font-black text-blue-900">Admin Validation</h3></div><div className="mt-3 space-y-2">{validationItems.map(item => <label key={item} className="flex items-center gap-2 rounded-xl bg-white/80 p-3 text-xs font-bold text-blue-950"><input type="checkbox" checked={Boolean(checks[item])} onChange={event => setChecks(previous => ({ ...previous, [item]: event.target.checked }))} className="h-4 w-4 accent-blue-700" />{item}</label>)}</div><textarea value={remarks} onChange={event => setRemarks(event.target.value)} placeholder="Add admin remarks..." className="mt-3 min-h-24 w-full rounded-xl border border-blue-200 bg-white p-3 text-xs font-semibold outline-none focus:border-blue-600" /><button type="button" onClick={handleForwardToSupervisor} disabled={!allChecked || isUpdating} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-xs font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"><ShieldCheck className="h-4 w-4" />{isUpdating ? 'Forwarding…' : 'Forward to Supervisor'}</button><p className="mt-2 text-center text-xs font-bold text-blue-700">{allChecked ? 'Admin validates and forwards. Final approval belongs to the Supervisor.' : 'Check every item above before forwarding.'}</p></section> : <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-slate-500" /><h3 className="text-sm font-black text-slate-800">Admin Validation</h3></div><p className="mt-2 text-xs font-bold text-slate-600">{forwardNote(selected)}</p></section>}<button type="button" onClick={() => setScreen('status')} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700"><History className="h-4 w-4" />View Status & History</button>{toast && <p className="rounded-xl bg-emerald-50 p-3 text-center text-xs font-black text-emerald-700">{toast}</p>}</div>; }

  if (screen === 'status') return <div className="w-full min-w-0 space-y-4 pb-24 sm:pb-0"><button type="button" onClick={() => setScreen('dashboard')} className="inline-flex items-center gap-1 text-xs font-black text-blue-700"><ChevronLeft className="h-4 w-4" />Request Management</button><section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-blue-600" /><div><h2 className="text-xl font-black text-slate-900">Request Status</h2><p className="text-xs font-semibold text-slate-500">Track every request action and status change.</p></div></div><div className="mt-5 space-y-4">{requestTimeline(selected || data[0] || {}).map((step, index) => <div key={step.label} className="flex gap-3"><div className="flex flex-col items-center"><span className={`flex h-8 w-8 items-center justify-center rounded-full ${step.complete ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500'}`}>{step.complete ? <Check className="h-4 w-4" /> : index + 1}</span>{index < 5 && <span className="h-7 w-px bg-slate-200" />}</div><div className="pt-1"><p className="text-xs font-black text-slate-800">{step.label}</p><p className="mt-1 text-xs font-semibold text-slate-500">{step.detail}</p></div></div>)}</div></section><section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><History className="h-4 w-4 text-blue-600" /><h3 className="text-sm font-black text-slate-900">Request History</h3></div><div className="mt-3 divide-y divide-slate-100">{data.slice(0, 8).map(request => <div key={request.id} className="py-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-black text-slate-800">{request.id || 'Request'}</p><Badge status={request.currentStatus} /></div><p className="mt-1 text-xs font-semibold text-slate-500">{dateSubmitted(request)} · {employeeName(request)}</p><p className="mt-1 text-xs text-slate-600">{request.remarks || 'Request submitted for administrative validation.'}</p></div>)}</div></section></div>;

  return <div className="w-full min-w-0 space-y-4 pb-24 sm:pb-0"><header><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-600">Validate, add remarks, forward, and track employee requests.</p></div><button type="button" onClick={() => setScreen('status')} className="rounded-xl border border-slate-200 bg-white p-2 text-blue-700 shadow-sm" title="Request status and history"><History className="h-5 w-5" /></button></div></header><div className="flex gap-2"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search requests..." className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm shadow-sm outline-none focus:border-blue-500" /></div><button type="button" onClick={() => setKind(kind === 'All' ? 'Leave' : kind === 'Leave' ? 'Travel' : 'All')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm" title="Filter requests"><Filter className="h-4 w-4" /></button></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-5"><Stat label="Pending" value={pending.length} icon={Clock3} tone="bg-amber-50 text-amber-600" onClick={() => { setKind('All'); setStatusFilter('Pending'); setSearch(''); }} /><Stat label="Leave" value={leave.length} icon={CalendarDays} tone="bg-blue-50 text-blue-600" onClick={() => { setKind('Leave'); setStatusFilter('All'); }} /><Stat label="Travel" value={travel.length} icon={Plane} tone="bg-blue-50 text-blue-600" onClick={() => { setKind('Travel'); setStatusFilter('All'); }} /><Stat label="Returned" value={returned.length} icon={MessageSquare} tone="bg-rose-50 text-rose-600" onClick={() => { setKind('All'); setStatusFilter('Returned'); setSearch(''); }} /><Stat label="Forwarded" value={forwarded.length} icon={ShieldCheck} tone="bg-blue-50 text-blue-600" onClick={() => { setKind('All'); setStatusFilter('For Supervisor'); setSearch(''); }} /></div><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-black text-slate-900">{statusFilter === 'All' ? (kind === 'All' ? 'All Requests' : `${kind} Requests`) : `${statusFilter} Requests`}</h3><p className="mt-1 text-xs font-bold text-slate-500">{visible.length} request(s) found</p></div><div className="flex gap-1 rounded-xl bg-slate-100 p-1">{['All', 'Leave', 'Travel'].map(tab => <button type="button" key={tab} onClick={() => { setKind(tab); setStatusFilter('All'); }} className={`rounded-lg px-3 py-1.5 text-xs font-black ${kind === tab && statusFilter === 'All' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>{tab}</button>)}</div></div><div className="space-y-3">{visible.map(request => <Card key={request.id} request={request} />)}{visible.length === 0 && <div className="rounded-2xl bg-slate-50 p-8 text-center"><FileText className="mx-auto h-8 w-8 text-slate-500" /><p className="mt-3 text-sm font-black text-slate-700">No requests found</p><p className="mt-1 text-xs font-semibold text-slate-500">Try another search or filter.</p></div>}</div>{toast && <p className="rounded-xl bg-emerald-50 p-3 text-center text-xs font-black text-emerald-700">{toast}</p>}</div>;
}