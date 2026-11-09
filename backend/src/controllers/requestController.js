import { Leave } from '../models/leaveModel.js';
import { sendServerError } from '../middleware/requestSecurity.js';
import { User } from '../models/User.js';
import { toRequesterProfile } from '../utils/passwordSecurity.js';
import { buildEmployeeDraftUpdate, buildEmployeeRequest, buildEmployeeWithdrawal, pickReviewUpdate, reviewUpdateProblem } from '../utils/requestFields.js';
import { leaveCreditDeduction } from '../utils/leaveCredits.js';
import { Announcement } from '../models/announcementModel.js';
import { sendSupervisorReviewSms } from '../services/smsService.js';
import { noticeEmployee, noticeRequestDecision, requestDates } from '../services/employeeNotices.js';
import { overlapMessage, overlappingRequest } from '../../../shared/requestOverlap.js';
import { filingDate, lateFilingProblem } from '../../../shared/requestFiling.js';
import { getManilaDateString } from '../../../shared/localDate.js';
import { countLeaveDays } from '../../../shared/leaveCalc.js';
import { Holiday } from '../models/holidayModel.js';
import { FOR_PRE_APPROVAL, leaveCreditCertification, readRecommendation } from '../../../shared/hrSteps.js';
import { YEARLY_LEAVES, yearlyLeaveProblem } from '../../../shared/yearlyLeave.js';

const reviewerName = req => req.user?.name || (req.user?.accessLevel === 'supervisor' ? 'your supervisor' : 'HR');
const reviewRemarks = update => update?.supervisorRemarks || update?.remarks || '';

// Texts the active supervisors when HR forwards a request to them. A failed text never
// fails the forward.
const textSupervisorsAboutForward = async (previous, updated) => {
  if (previous?.status === 'For Supervisor' || updated?.status !== 'For Supervisor') return;
  try {
    const supervisors = (await User.findByAccessLevel('supervisor'))
      .filter(account => (account.accountStatus || 'Active').toString().toLowerCase() === 'active');
    await sendSupervisorReviewSms(updated, supervisors);
  } catch (error) {
    console.error('Unable to text supervisors about a forwarded request:', error);
  }
};

// Employees cannot address notifications to HR themselves, so the server tells HR when an
// employee submits a request. A failed notification never fails the submission.
const notifyHrOfSubmission = async (request, employee) => {
  try {
    await Announcement.createNotification({
      title: 'New Request Submitted',
      message: `${employee.name || 'An employee'} submitted a ${request.type} (Ref ${request.id}) for HR review.`,
      type: 'request',
      recipientRole: 'hr_admin',
      action: 'review_request',
      targetId: request.id
    });
  } catch (error) {
    console.error('Unable to notify HR about a submitted request:', error);
  }
};

// Tells HR (and the supervisor, if the request was forwarded to them) that an employee
// withdrew a request, so nobody keeps reviewing it.
const notifyReviewersOfWithdrawal = async (request, employee, previousStatus) => {
  const roles = previousStatus === 'For Supervisor' ? ['hr_admin', 'supervisor'] : ['hr_admin'];
  for (const recipientRole of roles) {
    await Announcement.createNotification({
      title: 'Request Withdrawn',
      message: `${employee.name || 'An employee'} withdrew their ${request.type} (Ref ${request.id}).`,
      type: 'request',
      recipientRole
    }).catch(error => console.error('Unable to notify reviewers about a withdrawn request:', error));
  }
};

const enrichRequestEmployees = async (requests) => Promise.all(requests.map(async request => {
  const employee = request.employeeId
    ? await User.findByEmployeeId(request.employeeId)
    : request.employeeEmail
      ? await User.findByEmail(request.employeeEmail)
      : null;
  if (!employee) return request;
  const requester = toRequesterProfile(employee);
  return { ...request, employee: requester, employeeName: request.employeeName || requester.name };
}));

// Who took an HR step, as CSC Form No. 6 prints it under the signature: the name and position.
const signatory = user => ({ name: user?.name || 'HR', position: user?.role || '' });

// What an HR step records on the request (CSC Form No. 6, section 7): HR 1's certification of
// the employee's leave credits when a leave goes for pre-approval (7.A), counted by the server
// from the employee's balances now and the leave's working days, and HR 2's recommendation
// when a request goes to the supervisor (7.B). Returns { fields } or { error }.
const hrStepRecord = async (existing, update, req) => {
  const at = new Date().toISOString();
  if (update.status === FOR_PRE_APPROVAL) {
    const employee = (existing.employeeId && await User.findByEmployeeId(existing.employeeId))
      || (existing.employeeEmail && await User.findByEmail(existing.employeeEmail));
    if (!employee) return { error: 'The employee\'s account was not found, so their leave credits cannot be certified.' };
    const certification = leaveCreditCertification({
      leaveType: existing.leaveType,
      days: await serverLeaveDays(existing),
      employee,
      asOf: getManilaDateString()
    });
    return { fields: { creditCertification: { ...certification, certifiedBy: signatory(req.user), certifiedAt: at } } };
  }
  if (update.status === 'For Supervisor') {
    const recommendation = readRecommendation(req.body?.recommendation);
    if (recommendation.error) return { error: recommendation.error };
    return { fields: { recommendation: { ...recommendation.value, recommendedBy: signatory(req.user), recommendedAt: at } } };
  }
  return { fields: {} };
};

// Tells HR that HR 1 certified a leave's credits, so HR 2 pre-approves it. A failed
// notification never fails the step.
const notifyHrOfCertification = async (request, hr) => {
  try {
    await Announcement.createNotification({
      title: 'Leave for Pre-approval',
      message: `${hr?.name || 'HR 1'} certified the leave credits of ${request.employeeName || 'an employee'}'s ${request.leaveType || 'leave'} (Ref ${request.id}). It is ready for HR 2's pre-approval.`,
      type: 'request',
      recipientRole: 'hr_admin',
      action: 'review_request',
      targetId: request.id
    });
  } catch (error) {
    console.error('Unable to notify HR about a certified leave:', error);
  }
};

export const getRequests = async (req, res) => {
  try {
    const list = await Leave.findAllRequests();
    // A draft is the employee's own until they submit it.
    // An employee also sees, read-only, the submitted Travel Orders that include them.
    const includesMe = request => request.status !== 'Draft'
      && (request.companions || []).some(companion => companion?.employeeId === req.user.employeeId);
    const visible = req.user?.accessLevel === 'employee'
      ? list.filter(request => request.employeeId === req.user.employeeId || request.employeeEmail === req.user.email || includesMe(request))
      : list.filter(request => request.status !== 'Draft');
    res.status(200).json(await enrichRequestEmployees(visible));
  } catch (error) {
    sendServerError(res, error);
  }
};

// Why a leave or travel order being submitted (`request`, not a draft) overlaps the employee's
// other leave or travel, or null (see overlappingRequest).
const overlapProblem = async request => {
  if (!['Leave Request', 'Travel Order'].includes(request?.type) || request.status === 'Draft' || !request.startDate) return null;
  const absences = await Leave.findAbsencesOfEmployee({ employeeId: request.employeeId, email: request.employeeEmail });
  const other = overlappingRequest(request, absences);
  return other ? overlapMessage(other) : null;
};

// The other employees a Travel Order includes, from other offices or towns (`list`, as the form
// sends them), as their accounts are now: each an active employee account, not the one filing,
// at most 50. Returns { value } or { error }.
const MAX_COMPANIONS = 50;
const readCompanions = async (list, filer) => {
  if (!Array.isArray(list)) return { value: [] };
  const ids = [...new Set(list.map(item => String(item?.employeeId || '').trim()).filter(Boolean))]
    .filter(id => id !== filer?.employeeId);
  if (ids.length > MAX_COMPANIONS) return { error: `A Travel Order can include at most ${MAX_COMPANIONS} other employees.` };
  const value = [];
  for (const id of ids) {
    const account = await User.findByEmployeeId(id);
    const active = account && (account.accountStatus || 'Active').toString().toLowerCase() === 'active';
    if (!active || (account.accessLevel || 'employee') !== 'employee') return { error: `Employee ${id} is not an active employee account.` };
    value.push({ employeeId: account.employeeId, name: account.name || '', role: account.role || '', office: account.office || '' });
  }
  return { value };
};

// Why a Travel Order being submitted cannot include one of its other employees: they already have
// leave or travel on its dates. Null when none does.
const companionOverlapProblem = async request => {
  if (request?.type !== 'Travel Order' || request.status === 'Draft' || !request.companions?.length) return null;
  for (const companion of request.companions) {
    const absences = await Leave.findAbsencesOfEmployee({ employeeId: companion.employeeId });
    const other = overlappingRequest({ ...request, employeeId: companion.employeeId, employeeEmail: '' }, absences);
    if (other) return `${companion.name || companion.employeeId} cannot be included: ${overlapMessage(other).replace(/^You already have/, 'they already have')}`;
  }
  return null;
};

// Tells the other employees of a Travel Order that was just approved that they go on it and need
// no Time In on its days. A failed notice never fails the approval.
const noticeCompanionsOfApproval = async request => {
  const details = [request.travelVenue, requestDates(request)].filter(Boolean).join(', ');
  for (const companion of request.companions || []) {
    const account = await User.findByEmployeeId(companion.employeeId).catch(() => null);
    if (!account) continue;
    await noticeEmployee(account, {
      title: 'Included in a Travel Order',
      message: `${request.employeeName || 'A colleague'} included you in Travel Order ${request.id}${details ? ` (${details})` : ''}, which was approved. No Time In is needed on those days.`,
      type: 'request',
      view: 'attendance'
    }).catch(error => console.error('Unable to notify an employee included in a travel order:', error));
  }
};

// Why a special privilege or wellness leave being submitted asks for more than its year has left
// (or, for wellness leave, more than 3 days at a time), or null (see shared/yearlyLeave.js).
const yearlyLimitProblem = async request => {
  if (request?.type !== 'Leave Request' || request.status === 'Draft' || !YEARLY_LEAVES[request.leaveType]) return null;
  const absences = await Leave.findAbsencesOfEmployee({ employeeId: request.employeeId, email: request.employeeEmail });
  return yearlyLeaveProblem(request, absences, await Holiday.findAll());
};

// The working days of a leave, counted by the server from its dates (Monday to Friday, without
// HR's holidays), so the number the form sent is never trusted.
const serverLeaveDays = async request => countLeaveDays(request.startDate, request.endDate, await Holiday.findAll());

const daysText = days => `${Number(days.toFixed(3))} day${days === 1 ? '' : 's'}`;
// How an approved leave was charged, such as "2 days sick leave, 1 day vacation leave".
const chargeText = charge => [
  charge.sickLeaveDays && `${daysText(charge.sickLeaveDays)} sick leave`,
  charge.vacationLeaveDays && `${daysText(charge.vacationLeaveDays)} vacation leave`,
  charge.withoutPayDays && `${daysText(charge.withoutPayDays)} without pay`
].filter(Boolean).join(', ') || 'nothing';

// Charges a leave that has just been approved to the employee's credits by the CSC rules (see
// leaveCharge), saves how on the request, and tells the employee.
const chargeApprovedLeave = async (request, { field, days }) => {
  const label = `${request.leaveType || 'leave'} ${request.id} (${daysText(days)})`;
  const result = await User.chargeApprovedLeave(
    { employeeId: request.employeeId, email: request.employeeEmail },
    { field, days, reason: charge => `Approved ${label}: ${chargeText(charge)}` }
  );
  if (!result) return;
  await Leave.saveCreditCharge(request.id, result.charge);
  await Announcement.createNotification({
    title: 'Leave Credits Charged',
    message: `Your approved ${label} was charged: ${chargeText(result.charge)}.`
      + (result.charge.withoutPayDays ? ' The days without pay are because your leave credits were not enough.' : ''),
    type: 'system',
    view: 'dashboard',
    employeeId: result.employee.employeeId || '',
    employeeEmail: result.employee.email || ''
  }).catch(error => console.error('Unable to notify the employee about the leave charge:', error));
};

export const createRequest = async (req, res) => {
  try {
    const requestBody = req.user?.accessLevel === 'employee'
      ? buildEmployeeRequest(req.body, req.user)
      : { ...req.body };
    // A Travel Order's other employees, as their accounts are now.
    const companions = requestBody.type === 'Travel Order' ? await readCompanions(requestBody.companions, req.user) : { value: [] };
    if (companions.error) return res.status(400).json({ success: false, error: companions.error });
    requestBody.companions = companions.value;
    if (requestBody.type === 'Leave Request' && requestBody.startDate) requestBody.workingDays = await serverLeaveDays(requestBody);
    // An employee's leave or travel order filed after it should have been (see lateFilingProblem).
    const late = req.user?.accessLevel === 'employee' && requestBody.status === 'Pending'
      ? lateFilingProblem(requestBody, getManilaDateString())
      : null;
    if (late) return res.status(400).json({ success: false, error: late });
    const overlap = await overlapProblem(requestBody);
    if (overlap) return res.status(409).json({ success: false, error: overlap });
    const yearly = req.user?.accessLevel === 'employee' ? await yearlyLimitProblem(requestBody) : null;
    if (yearly) return res.status(409).json({ success: false, error: yearly });
    const companionOverlap = await companionOverlapProblem(requestBody);
    if (companionOverlap) return res.status(409).json({ success: false, error: companionOverlap });
    const newReq = await Leave.create(requestBody);
    if (req.user?.accessLevel === 'employee' && newReq.status === 'Pending') {
      await notifyHrOfSubmission(newReq, req.user);
    }
    res.status(201).json({ success: true, request: newReq });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const updateRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user?.accessLevel;
    let update;
    const existing = await Leave.findByCustomId(id);
    if (!existing) return res.status(404).json({ success: false, error: 'Request ID not found.' });
    if (role === 'employee') {
      // Employees may edit, submit, or discard their own drafts, fix and submit again a
      // request returned to them, and withdraw their own requests that have not been
      // decided yet.
      const editsOwnRequest = existing.status === 'Draft' || (existing.status === 'Returned' && req.body?.status !== 'Withdrawn');
      update = editsOwnRequest
        ? buildEmployeeDraftUpdate(existing, req.body, req.user)
        : buildEmployeeWithdrawal(existing, req.body, req.user);
      if (!update) {
        return res.status(403).json({ success: false, error: 'You can only change your own drafts and returned requests, or withdraw your own requests before they are approved or rejected.' });
      }
      // An edited Travel Order's other employees, as their accounts are now.
      if (update.companions !== undefined) {
        const companions = (update.type || existing.type) === 'Travel Order' ? await readCompanions(update.companions, req.user) : { value: [] };
        if (companions.error) return res.status(400).json({ success: false, error: companions.error });
        update.companions = companions.value;
      }
      // An edited leave's working days are counted again from its dates.
      const edited = { ...existing, ...update };
      if (editsOwnRequest && edited.type === 'Leave Request' && edited.startDate && update.status !== 'Cancelled') {
        update.workingDays = await serverLeaveDays(edited);
      }
      // A draft submitted, or a returned request submitted again, may not be filed late (a
      // returned one counts from when it was first submitted) or overlap other leave or travel.
      if (update.status === 'Pending') {
        const late = lateFilingProblem(edited, filingDate(existing, getManilaDateString()));
        if (late) return res.status(400).json({ success: false, error: late });
        const overlap = await overlapProblem({ ...existing, ...update });
        if (overlap) return res.status(409).json({ success: false, error: overlap });
        const yearly = await yearlyLimitProblem({ ...existing, ...update });
        if (yearly) return res.status(409).json({ success: false, error: yearly });
        const companionOverlap = await companionOverlapProblem({ ...existing, ...update, id: existing.customId });
        if (companionOverlap) return res.status(409).json({ success: false, error: companionOverlap });
      }
    } else if (role === 'supervisor' || role === 'hr_admin') {
      update = pickReviewUpdate(req.body);
      const problem = reviewUpdateProblem(existing.status, update, role, { type: existing.type, hrTask: req.user.hrTask });
      if (problem) return res.status(409).json({ success: false, error: problem });
      if (role === 'hr_admin') {
        const step = await hrStepRecord(existing, update, req);
        if (step.error) return res.status(400).json({ success: false, error: step.error });
        Object.assign(update, step.fields);
      }
    } else {
      return res.status(403).json({ success: false, error: 'You do not have permission to perform this action.' });
    }
    const updated = await Leave.updateStatus(id, update);

    // Charge leave credits the first time a leave request is approved, for the working days
    // counted from its dates. The flag on the request makes sure two approvals at the same
    // moment cannot charge twice.
    const newlyApprovedLeave = updated?.type === 'Leave Request' && updated.status === 'Approved' && existing.status !== 'Approved';
    const deduction = newlyApprovedLeave ? leaveCreditDeduction(existing, updated, await Holiday.findAll()) : null;
    if (deduction && await Leave.markCreditsDeducted(id)) {
      await chargeApprovedLeave(updated, deduction);
    }
    // The other employees of a Travel Order just approved hear that they go on it.
    if (updated?.type === 'Travel Order' && updated.status === 'Approved' && existing.status !== 'Approved') {
      await noticeCompanionsOfApproval(updated);
    }

    if (updated && role === 'employee' && updated.status === 'Pending') {
      await notifyHrOfSubmission(updated, req.user);
    }
    if (updated && role === 'employee' && updated.status === 'Withdrawn') {
      await notifyReviewersOfWithdrawal(updated, req.user, existing.status);
    }
    if (updated && role === 'hr_admin') {
      await textSupervisorsAboutForward(existing, updated);
      if (updated.status === FOR_PRE_APPROVAL && existing.status !== FOR_PRE_APPROVAL) await notifyHrOfCertification(updated, req.user);
    }
    if (updated && (role === 'hr_admin' || role === 'supervisor')) {
      await noticeRequestDecision(existing, updated, { reviewer: reviewerName(req), remarks: reviewRemarks(update) });
    }

    if (updated) {
      res.status(200).json({ success: true, request: updated });
    } else {
      res.status(404).json({ success: false, error: 'Request ID not found.' });
    }
  } catch (error) {
    sendServerError(res, error);
  }
};

export const bulkUpdateRequests = async (req, res) => {
  try {
    // The same review rules as for one request: nothing is saved if any update breaks them.
    // HR's steps record a certification or a recommendation, so HR takes them one request at a
    // time, not here.
    const previousById = new Map();
    for (const update of Array.isArray(req.body) ? req.body : []) {
      const existing = typeof update?.id === 'string' ? await Leave.findByCustomId(update.id) : null;
      const review = pickReviewUpdate(update);
      const problem = existing && (reviewUpdateProblem(existing.status, review, req.user?.accessLevel, { type: existing.type, hrTask: req.user?.hrTask })
        || (req.user?.accessLevel === 'hr_admin' && [FOR_PRE_APPROVAL, 'For Supervisor'].includes(review.status)
          ? 'Open the request to certify its leave credits or pre-approve it.' : null));
      if (problem) return res.status(409).json({ success: false, error: `${update.id}: ${problem}` });
      if (existing) previousById.set(update.id, existing);
    }
    const updated = await Leave.bulkUpdate(req.body);
    for (const request of updated) {
      await textSupervisorsAboutForward(previousById.get(request.id), request);
      const sent = req.body.find(update => update?.id === request.id);
      await noticeRequestDecision(previousById.get(request.id), request, { reviewer: reviewerName(req), remarks: reviewRemarks(sent) });
    }
    res.status(200).json({ success: true, requests: updated });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};
