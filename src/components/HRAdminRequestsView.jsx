import React, { useMemo, useState } from 'react';
import AttachmentList from './AttachmentList';
import { travelDurationLabel } from '../utils/travelDuration';
import { apiFetch } from '../utils/api';
import { getManilaDateString } from '../../shared/localDate';
import { FOR_PRE_APPROVAL, HR_STEP_NAMES, HR_TASK_LABELS, doesHrStep, hrStepOf, leaveCreditCertification } from '../../shared/hrSteps';
import { ArrowRight, BriefcaseBusiness, CalendarDays, Check, CheckCircle2, ChevronLeft, ClipboardCheck, Clock3, FileCheck2, FileText, Filter, History, MapPin, MessageSquare, Plane, Search, ShieldCheck, UserRound, Users } from 'lucide-react';

const statusTone = { Pending: 'bg-amber-50 text-amber-700', 'Pending Review': 'bg-amber-50 text-amber-700', [FOR_PRE_APPROVAL]: 'bg-indigo-50 text-indigo-700', Returned: 'bg-rose-50 text-rose-700', Validated: 'bg-emerald-50 text-emerald-700', 'For Supervisor': 'bg-blue-50 text-blue-700', Approved: 'bg-emerald-50 text-emerald-700', Rejected: 'bg-rose-50 text-rose-700' };
// Leave credits as HR's records write them, to three places.
const creditText = value => (Number.isFinite(Number(value)) ? Number(value).toFixed(3) : '-');
const recommendationText = recommendation => (recommendation?.decision === 'approval' ? 'For approval' : `For disapproval: ${recommendation?.reason || ''}`);
// HR 1's certification of leave credits (CSC Form No. 6, 7.A), as the form's table has it.
const CreditTable = ({ certification }) => <table className="mt-2 w-full overflow-hidden rounded-xl bg-white text-xs"><thead><tr className="text-left text-slate-500"><th className="p-2 font-black">As of {certification.asOf}</th><th className="p-2 font-black">Vacation Leave</th><th className="p-2 font-black">Sick Leave</th></tr></thead><tbody>{[['Total Earned', 'earned'], ['Less this application', 'less'], ['Balance', 'balance']].map(([label, key]) => <tr key={key} className="border-t border-slate-100"><td className="p-2 font-bold text-slate-600">{label}</td><td className="p-2 font-black text-slate-900">{creditText(certification.vacationLeave?.[key])}</td><td className="p-2 font-black text-slate-900">{creditText(certification.sickLeave?.[key])}</td></tr>)}</tbody></table>;
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
// A request's way to the Head's decision: HR 1 certifies a leave's credits, HR 2 pre-approves
// it (a Travel Order goes straight to HR 2), and the Head (the Supervisor) decides.
const requestTimeline = request => {
  const status = request.status;
  const decided = ['Approved', 'Rejected'].includes(status);
  const certification = request.creditCertification;
  const recommendation = request.recommendation;
  const certified = Boolean(certification) || [FOR_PRE_APPROVAL, 'For Supervisor'].includes(status) || decided;
  const preApproved = Boolean(recommendation) || status === 'For Supervisor' || decided;
  return [
    { label: 'Submitted', complete: true, detail: 'Filed by the employee' },
    ...(request.type === 'Leave Request' ? [{
      label: 'HR 1: Leave Credits Certified',
      complete: certified,
      detail: certification ? `By ${certification.certifiedBy?.name || 'HR 1'}, as of ${certification.asOf}` : certified ? 'Certified' : 'Awaiting HR 1'
    }] : []),
    { label: 'HR 2: Pre-approved', complete: preApproved, detail: recommendation ? `${recommendationText(recommendation)} · ${recommendation.recommendedBy?.name || 'HR 2'}` : preApproved ? 'Sent to the Head' : 'Awaiting HR 2' },
    { label: decided ? status : 'Approved / Rejected', complete: decided, detail: decided ? `Final decision by the Head: ${status}` : 'Awaiting the Head\'s decision' }
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

// Only a request waiting for an HR step can be taken further; the note says why another cannot.
const forwardNote = request => ({
  'For Supervisor': 'Already sent to the Head (Supervisor), who makes the final decision.',
  Approved: 'The Supervisor approved this request. There is nothing left to forward.',
  Rejected: 'The Supervisor rejected this request. There is nothing left to forward.',
  Withdrawn: 'The employee withdrew this request, so it cannot be forwarded.',
  Returned: 'This request was returned to the employee, so it cannot be forwarded.'
}[getStatus(request)] || `This request is ${getStatus(request)}, so it cannot be forwarded.`);

const Badge = ({ status }) => <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${statusTone[status] || 'bg-slate-100 text-slate-600'}`}>{status}</span>;
const Detail = ({ label, value, icon: Icon = FileText }) => <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /><div><p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-words text-xs font-bold text-slate-800">{value || '-'}</p></div></div>;
const Stat = ({ label, value, icon: Icon, tone, onClick }) => <button type="button" onClick={onClick} className="rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"><div className="flex items-center justify-between"><span className={`flex h-8 w-8 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span><strong className="text-2xl font-black text-slate-900">{value}</strong></div><p className="mt-3 text-xs font-black uppercase tracking-wide text-slate-500">{label}</p><span className="mt-1 block text-xs font-bold text-blue-600">View requests</span></button>;

// `user` is the signed-in HR/Admin, whose `hrTask` says which HR step they take.
export default function HRAdminRequestsView({ user = {}, requests = [], employees = [], onEmployeesChange, onUpdateRequests, onUpdateRequestStatus, focusRequestId }) {
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
  // HR 2's recommendation (CSC Form No. 6, 7.B), and HR 1's correction of a wrong balance.
  const [recommendation, setRecommendation] = useState({ decision: 'approval', reason: '' });
  const [creditForm, setCreditForm] = useState(null);
  const [creditSaving, setCreditSaving] = useState(false);
  // A draft is the employee's own until they submit it.
  const data = useMemo(() => requests.filter(request => request.status !== 'Draft').map(request => {
    const employee = employees.find(item => requesterMatches(request, item));
    return { ...request, employee: employee || request.employee, requestType: getType(request), currentStatus: getStatus(request) };
  }), [requests, employees]);
  const pending = data.filter(request => ['Pending', 'Pending Review'].includes(request.currentStatus));
  const forPreApproval = data.filter(request => request.currentStatus === FOR_PRE_APPROVAL);
  const returned = data.filter(request => request.currentStatus === 'Returned');
  const forwarded = data.filter(request => request.currentStatus === 'For Supervisor');
  const leave = data.filter(request => request.requestType === 'Leave');
  const travel = data.filter(request => request.requestType === 'Travel');
  const visible = data.filter(request => (kind === 'All' || request.requestType === kind) && (statusFilter === 'All' || request.currentStatus === statusFilter || (statusFilter === 'Pending' && ['Pending', 'Pending Review'].includes(request.currentStatus))) && `${employeeName(request)} ${employeeId(request)} ${request.type || ''} ${request.purpose || ''} ${request.id || ''}`.toLowerCase().includes(search.toLowerCase()));
  const initials = name => name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
  const notify = message => { setToast(message); window.setTimeout(() => setToast(''), 3500); };
  const open = request => { setSelected(request); setRemarks(request.remarks || ''); setChecks({}); setRecommendation({ decision: 'approval', reason: '' }); setCreditForm(null); setScreen('details'); };
  // The HR step the open request waits for, and whether this HR account takes it. The
  // checklist goes with a request's first HR step: HR 1's for a leave, HR 2's for a Travel Order.
  const step = selected ? hrStepOf(selected) : null;
  const myStep = doesHrStep(user?.hrTask, step);
  const firstStep = step === 'leave-credits' || (step === 'pre-approval' && selected?.type !== 'Leave Request');
  // The employee as HR's list has them now, so a corrected balance shows at once.
  const selectedEmployee = selected ? employees.find(item => requesterMatches(selected, item)) || selected.employee : null;
  const creditPreview = step === 'leave-credits'
    ? leaveCreditCertification({ leaveType: selected.leaveType, days: Number(selected.workingDays) || 0, employee: selectedEmployee, asOf: getManilaDateString() })
    : null;
  // Takes the request's HR step: HR 1 certifies a leave's credits and sends it to HR 2
  // ('For Pre-approval'), HR 2 pre-approves with a recommendation and sends it to the Head
  // ('For Supervisor'), or either returns it to the employee ('Returned'), with HR's remarks.
  const update = async (request, status) => {
    const returning = status === 'Returned';
    if (!request?.id) {
      notify(`Unable to ${returning ? 'return' : 'forward'}: request ID is missing.`);
      return;
    }
    const updatePayload = {
      status,
      remarks,
      ...(status === 'For Supervisor' ? { forwardedTo: 'Supervisor', recommendation } : {}),
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
      notify(returning ? 'Request returned to the employee. They were notified to fix it and submit it again.'
        : status === FOR_PRE_APPROVAL ? 'Leave credits certified. The leave is now with HR 2 for pre-approval.'
          : 'Pre-approved and sent to the Head (Supervisor) for the decision.');
    } catch (error) {
      notify(error.message || `Unable to ${returning ? 'return the request to the employee' : 'send the request on'}.`);
    } finally {
      setIsUpdating(false);
    }
  };
  const allChecked = validationItems.every(item => checks[item]);
  const recommendationReady = recommendation.decision === 'approval' || recommendation.reason.trim();
  const canSendOn = myStep && (!firstStep || allChecked) && (step !== 'pre-approval' || recommendationReady);
  // HR takes the step only after checking every validation item (at the first step) and, as
  // HR 2, choosing the recommendation.
  const handleSendOn = async () => {
    if (isUpdating || !selected || !canSendOn) return;
    await update(selected, step === 'leave-credits' ? FOR_PRE_APPROVAL : 'For Supervisor');
  };
  // HR returns a request waiting for its step when something needs the employee's action. The
  // remarks, which the employee receives, must say what to fix (not just the request's
  // own status message that the remarks box starts with).
  const typedRemarks = remarks.trim() && remarks.trim() !== (selected?.remarks || '').trim();
  const handleReturnToEmployee = async () => {
    if (isUpdating || !selected || !myStep) return;
    if (!typedRemarks) {
      notify('Write in the remarks what the employee needs to fix, then return the request.');
      return;
    }
    await update(selected, 'Returned');
  };
  // HR 1 corrects a wrong balance before certifying it, with a reason (the employee is told).
  const saveCredits = async event => {
    event.preventDefault();
    if (!selectedEmployee || !creditForm || creditSaving) return;
    setCreditSaving(true);
    try {
      const identifier = selectedEmployee.employeeId || selectedEmployee.email;
      const response = await apiFetch(`/api/employees/${encodeURIComponent(identifier)}/leave-credits`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creditForm)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success || !result.employee) throw new Error(result.error || 'Unable to update leave credits.');
      const saved = result.employee;
      onEmployeesChange?.(previous => previous.map(item => ((item.employeeId && item.employeeId === saved.employeeId) || (item.email && item.email === saved.email) ? { ...item, ...saved } : item)));
      setCreditForm(null);
      notify('Leave credits corrected. The employee was notified.');
    } catch (error) {
      notify(error.message || 'Unable to update leave credits.');
    } finally {
      setCreditSaving(false);
    }
  };
  const Card = ({ request }) => <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-black text-blue-700">{initials(employeeName(request))}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black text-slate-900">{employeeName(request)}</p><Badge status={request.currentStatus} /></div><p className="mt-1 text-[11px] font-black text-blue-700">{request.id || 'Request ID unavailable'}</p><p className="mt-1 text-xs font-bold text-slate-600">{request.type || 'Leave Request'}</p><p className="mt-1 text-[11px] text-slate-500">Submitted {dateSubmitted(request)} · Employee ID: {employeeId(request)}</p><p className="mt-1 text-[11px] font-semibold text-slate-500">{request.employee?.role || request.role || 'Employee'} · {request.employee?.office || request.office || 'Office not assigned'}</p></div></div><div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-xs font-bold text-slate-500">{request.attachments?.length ? `${request.attachments.length} attachment(s)` : 'Attachments for review'}</span><button type="button" onClick={() => open(request)} className="inline-flex items-center gap-1 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">View Details <ArrowRight className="h-3.5 w-3.5" /></button></div></article>;

  if (screen === 'details' && selected) {
    const details = selected.recordDetails || {};
    // What HR 1 and HR 2 already recorded on the request.
    const recorded = (selected.creditCertification || selected.recommendation) && (
      <div className="mt-3 space-y-2">
        {selected.creditCertification && <div className="rounded-xl bg-white/80 p-3"><p className="text-xs font-black uppercase tracking-wide text-slate-500">HR 1: Leave credits certified by {selected.creditCertification.certifiedBy?.name || 'HR 1'}</p><CreditTable certification={selected.creditCertification} />{selected.creditCertification.withoutPayDays > 0 && <p className="mt-2 text-xs font-bold text-rose-700">{creditText(selected.creditCertification.withoutPayDays)} day(s) would be without pay: the balances do not cover the whole leave.</p>}</div>}
        {selected.recommendation && <div className="rounded-xl bg-white/80 p-3"><p className="text-xs font-black uppercase tracking-wide text-slate-500">HR 2: Recommendation by {selected.recommendation.recommendedBy?.name || 'HR 2'}</p><p className="mt-1 text-xs font-bold text-slate-800">{recommendationText(selected.recommendation)}</p></div>}
      </div>
    );
    const stepTitle = step === 'leave-credits' ? 'HR 1: Certification of Leave Credits (7.A)' : 'HR 2: Pre-approval (7.B)';
    const stepPanel = step && myStep ? (
      <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <div className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-blue-700" /><h3 className="text-sm font-black text-blue-900">{stepTitle}</h3></div>
        {firstStep && <div className="mt-3 space-y-2">{validationItems.map(item => <label key={item} className="flex items-center gap-2 rounded-xl bg-white/80 p-3 text-xs font-bold text-blue-950"><input type="checkbox" checked={Boolean(checks[item])} onChange={event => setChecks(previous => ({ ...previous, [item]: event.target.checked }))} className="h-4 w-4 accent-blue-700" />{item}</label>)}</div>}
        {step === 'leave-credits' && (
          <div className="mt-3 rounded-xl bg-white/80 p-3">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">{selectedEmployee ? `${employeeName(selected)}'s leave credits, as they will be certified` : 'The employee\'s account was not found in Employee Management'}</p>
            {selectedEmployee && <CreditTable certification={creditPreview} />}
            {creditPreview?.withoutPayDays > 0 && <p className="mt-2 text-xs font-bold text-rose-700">{creditText(creditPreview.withoutPayDays)} day(s) would be without pay: the balances do not cover the whole leave.</p>}
            {selectedEmployee && !creditForm && <button type="button" onClick={() => setCreditForm({ vacationLeaveCredits: String(creditPreview.vacationLeave.earned), sickLeaveCredits: String(creditPreview.sickLeave.earned), reason: '' })} className="mt-2 text-xs font-black text-blue-700 underline">A balance is wrong? Correct it first</button>}
            {creditForm && (
              <form onSubmit={saveCredits} className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="text-[11px] font-black text-slate-600">Vacation leave (days)<input type="number" min="0" max="1000" step="0.001" required value={creditForm.vacationLeaveCredits} onChange={event => setCreditForm(previous => ({ ...previous, vacationLeaveCredits: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs font-semibold" /></label>
                <label className="text-[11px] font-black text-slate-600">Sick leave (days)<input type="number" min="0" max="1000" step="0.001" required value={creditForm.sickLeaveCredits} onChange={event => setCreditForm(previous => ({ ...previous, sickLeaveCredits: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs font-semibold" /></label>
                <label className="text-[11px] font-black text-slate-600 sm:col-span-2">Reason<input required maxLength={300} value={creditForm.reason} onChange={event => setCreditForm(previous => ({ ...previous, reason: event.target.value }))} placeholder="For example: Balance from the leave card" className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs font-semibold" /></label>
                <div className="flex gap-2 sm:col-span-2"><button type="submit" disabled={creditSaving} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{creditSaving ? 'Saving…' : 'Save leave credits'}</button><button type="button" onClick={() => setCreditForm(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600">Cancel</button></div>
              </form>
            )}
          </div>
        )}
        {step === 'pre-approval' && recorded}
        {step === 'pre-approval' && (
          <fieldset className="mt-3 space-y-2 rounded-xl bg-white/80 p-3">
            <legend className="text-xs font-black uppercase tracking-wide text-slate-500">Recommendation</legend>
            <label className="flex items-center gap-2 text-xs font-bold text-blue-950"><input type="radio" name="recommendation" checked={recommendation.decision === 'approval'} onChange={() => setRecommendation(previous => ({ ...previous, decision: 'approval' }))} className="h-4 w-4 accent-blue-700" />For approval</label>
            <label className="flex items-center gap-2 text-xs font-bold text-blue-950"><input type="radio" name="recommendation" checked={recommendation.decision === 'disapproval'} onChange={() => setRecommendation(previous => ({ ...previous, decision: 'disapproval' }))} className="h-4 w-4 accent-blue-700" />For disapproval due to…</label>
            {recommendation.decision === 'disapproval' && <textarea value={recommendation.reason} onChange={event => setRecommendation(previous => ({ ...previous, reason: event.target.value }))} maxLength={300} placeholder="Why it is recommended for disapproval" className="min-h-16 w-full rounded-lg border border-slate-200 p-2 text-xs font-semibold" />}
          </fieldset>
        )}
        <textarea value={remarks} onChange={event => setRemarks(event.target.value)} placeholder="Add HR remarks..." className="mt-3 min-h-24 w-full rounded-xl border border-blue-200 bg-white p-3 text-xs font-semibold outline-none focus:border-blue-600" />
        <button type="button" onClick={handleSendOn} disabled={!canSendOn || isUpdating || (step === 'leave-credits' && !selectedEmployee)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-xs font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"><ShieldCheck className="h-4 w-4" />{isUpdating ? 'Saving…' : step === 'leave-credits' ? 'Certify Leave Credits & Send to HR 2' : 'Pre-approve & Send to the Head'}</button>
        <p className="mt-2 text-center text-xs font-bold text-blue-700">{firstStep && !allChecked ? 'Check every item above first.' : step === 'leave-credits' ? 'HR 2 pre-approves it next, then the Head decides.' : 'The Head (Supervisor) makes the final decision.'}</p>
        <button type="button" onClick={handleReturnToEmployee} disabled={isUpdating} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-black text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"><MessageSquare className="h-4 w-4" />{isUpdating ? 'Saving…' : 'Return to Employee'}</button>
        <p className="mt-2 text-center text-xs font-bold text-rose-700">Something to fix or missing? Write it in the remarks and return the request. The employee is notified.</p>
      </section>
    ) : (
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-slate-500" /><h3 className="text-sm font-black text-slate-800">{step ? stepTitle : 'HR Steps'}</h3></div>
        <p className="mt-2 text-xs font-bold text-slate-600">{step
          ? `Waiting for ${HR_STEP_NAMES[step]}. Your HR account does ${HR_STEP_NAMES[step === 'leave-credits' ? 'pre-approval' : 'leave-credits']}; HR can change this in Staff Accounts.`
          : forwardNote(selected)}</p>
        {recorded}
      </section>
    );
    return <div className="w-full min-w-0 space-y-4 pb-24 sm:pb-0"><button type="button" onClick={() => setScreen('dashboard')} className="inline-flex items-center gap-1 text-xs font-black text-blue-700"><ChevronLeft className="h-4 w-4" />Request Management</button><section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-blue-600">Request Details</p><h2 className="mt-1 text-xl font-black text-slate-900">{selected.id || 'Request'}</h2><p className="mt-1 text-xs text-slate-500">Submitted {dateSubmitted(selected)}</p></div><Badge status={selected.status || selected.currentStatus} /></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><Detail icon={UserRound} label="Employee Name" value={employeeName(selected)} /><Detail icon={Users} label="Employee ID" value={employeeId(selected)} /><Detail icon={BriefcaseBusiness} label="Position / Designation" value={selected.position || selected.role || selected.employee?.role} /><Detail icon={MapPin} label="Office / Department" value={selected.office || selected.employee?.office} /><Detail icon={FileText} label="Request Type" value={selected.type} /><Detail icon={CalendarDays} label="Date Submitted" value={dateSubmitted(selected)} /></div></section><section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="text-sm font-black text-slate-900">Request Details</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{selected.type === 'Travel Order' ? <><Detail icon={MapPin} label="Destination" value={selected.travelVenue || selected.destination || details.destination} /><Detail icon={Plane} label="Purpose of Travel" value={selected.purpose || details.purpose} /><Detail icon={CalendarDays} label="Travel Dates" value={`${selected.startDate || details.startDate || '-'} to ${selected.endDate || details.endDate || '-'}${travelDurationLabel(selected) ? ` (${travelDurationLabel(selected)})` : ''}`} /><Detail icon={Clock3} label="Activity Time" value={selected.travelTime || details.travelTime} /></> : <><Detail label="Leave Type" value={selected.leaveType || details.leaveType || 'Leave Application'} /><Detail icon={CalendarDays} label="Inclusive Dates" value={`${selected.startDate || '-'} to ${selected.endDate || '-'}`} /><Detail icon={Clock3} label="Number of Days" value={selected.workingDays || selected.numberOfDays || details.numberOfDays} /><Detail icon={MessageSquare} label="Reason" value={selected.purpose} /><Detail icon={FileCheck2} label="Leave Credits" value={selected.creditCertification ? `Certified by ${selected.creditCertification.certifiedBy?.name || 'HR 1'}: VL ${creditText(selected.creditCertification.vacationLeave?.balance)}, SL ${creditText(selected.creditCertification.sickLeave?.balance)} after this leave` : 'For HR 1 certification'} /></>}</div><div className="mt-2 rounded-xl bg-slate-50 p-3"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Required Attachments (tap to open)</p><AttachmentList attachments={selected.attachments} className="mt-1 flex flex-wrap gap-x-3 gap-y-1" itemClassName="max-w-full text-xs font-bold text-blue-700" emptyText={<p className="mt-1 text-xs font-bold text-slate-800">No supporting documents attached</p>} /></div></section>{stepPanel}<button type="button" onClick={() => setScreen('status')} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700"><History className="h-4 w-4" />View Status & History</button>{toast && <p className="rounded-xl bg-emerald-50 p-3 text-center text-xs font-black text-emerald-700">{toast}</p>}</div>; }

  if (screen === 'status') return <div className="w-full min-w-0 space-y-4 pb-24 sm:pb-0"><button type="button" onClick={() => setScreen('dashboard')} className="inline-flex items-center gap-1 text-xs font-black text-blue-700"><ChevronLeft className="h-4 w-4" />Request Management</button><section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-blue-600" /><div><h2 className="text-xl font-black text-slate-900">Request Status</h2><p className="text-xs font-semibold text-slate-500">Track every request action and status change.</p></div></div><div className="mt-5 space-y-4">{requestTimeline(selected || data[0] || {}).map((step, index, steps) => <div key={step.label} className="flex gap-3"><div className="flex flex-col items-center"><span className={`flex h-8 w-8 items-center justify-center rounded-full ${step.complete ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500'}`}>{step.complete ? <Check className="h-4 w-4" /> : index + 1}</span>{index < steps.length - 1 && <span className="h-7 w-px bg-slate-200" />}</div><div className="pt-1"><p className="text-xs font-black text-slate-800">{step.label}</p><p className="mt-1 text-xs font-semibold text-slate-500">{step.detail}</p></div></div>)}</div></section><section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><History className="h-4 w-4 text-blue-600" /><h3 className="text-sm font-black text-slate-900">Request History</h3></div><div className="mt-3 divide-y divide-slate-100">{data.slice(0, 8).map(request => <div key={request.id} className="py-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-black text-slate-800">{request.id || 'Request'}</p><Badge status={request.currentStatus} /></div><p className="mt-1 text-xs font-semibold text-slate-500">{dateSubmitted(request)} · {employeeName(request)}</p><p className="mt-1 text-xs text-slate-600">{request.remarks || 'Request submitted for administrative validation.'}</p></div>)}</div></section></div>;

  return <div className="w-full min-w-0 space-y-4 pb-24 sm:pb-0"><header><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-600">Validate, add remarks, forward, and track employee requests.</p><p className="mt-1 text-xs font-bold text-blue-700">Your HR step: {HR_TASK_LABELS[user?.hrTask] || HR_TASK_LABELS.both}</p></div><button type="button" onClick={() => setScreen('status')} className="rounded-xl border border-slate-200 bg-white p-2 text-blue-700 shadow-sm" title="Request status and history"><History className="h-5 w-5" /></button></div></header><div className="flex gap-2"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search requests..." className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm shadow-sm outline-none focus:border-blue-500" /></div><button type="button" onClick={() => setKind(kind === 'All' ? 'Leave' : kind === 'Leave' ? 'Travel' : 'All')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm" title="Filter requests"><Filter className="h-4 w-4" /></button></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"><Stat label="Pending" value={pending.length} icon={Clock3} tone="bg-amber-50 text-amber-600" onClick={() => { setKind('All'); setStatusFilter('Pending'); setSearch(''); }} /><Stat label="For Pre-approval" value={forPreApproval.length} icon={ClipboardCheck} tone="bg-indigo-50 text-indigo-600" onClick={() => { setKind('All'); setStatusFilter(FOR_PRE_APPROVAL); setSearch(''); }} /><Stat label="Leave" value={leave.length} icon={CalendarDays} tone="bg-blue-50 text-blue-600" onClick={() => { setKind('Leave'); setStatusFilter('All'); }} /><Stat label="Travel" value={travel.length} icon={Plane} tone="bg-blue-50 text-blue-600" onClick={() => { setKind('Travel'); setStatusFilter('All'); }} /><Stat label="Returned" value={returned.length} icon={MessageSquare} tone="bg-rose-50 text-rose-600" onClick={() => { setKind('All'); setStatusFilter('Returned'); setSearch(''); }} /><Stat label="Forwarded" value={forwarded.length} icon={ShieldCheck} tone="bg-blue-50 text-blue-600" onClick={() => { setKind('All'); setStatusFilter('For Supervisor'); setSearch(''); }} /></div><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-black text-slate-900">{statusFilter === 'All' ? (kind === 'All' ? 'All Requests' : `${kind} Requests`) : `${statusFilter} Requests`}</h3><p className="mt-1 text-xs font-bold text-slate-500">{visible.length} request(s) found</p></div><div className="flex gap-1 rounded-xl bg-slate-100 p-1">{['All', 'Leave', 'Travel'].map(tab => <button type="button" key={tab} onClick={() => { setKind(tab); setStatusFilter('All'); }} className={`rounded-lg px-3 py-1.5 text-xs font-black ${kind === tab && statusFilter === 'All' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>{tab}</button>)}</div></div><div className="space-y-3">{visible.map(request => <Card key={request.id} request={request} />)}{visible.length === 0 && <div className="rounded-2xl bg-slate-50 p-8 text-center"><FileText className="mx-auto h-8 w-8 text-slate-500" /><p className="mt-3 text-sm font-black text-slate-700">No requests found</p><p className="mt-1 text-xs font-semibold text-slate-500">Try another search or filter.</p></div>}</div>{toast && <p className="rounded-xl bg-emerald-50 p-3 text-center text-xs font-black text-emerald-700">{toast}</p>}</div>;
}