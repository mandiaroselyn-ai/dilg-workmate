import { Leave } from '../models/leaveModel.js';
import { sendServerError } from '../middleware/requestSecurity.js';
import { User } from '../models/User.js';
import { toSafeUser } from '../utils/passwordSecurity.js';
import { buildEmployeeDraftUpdate, buildEmployeeRequest, buildEmployeeWithdrawal, pickReviewUpdate, reviewUpdateProblem } from '../utils/requestFields.js';
import { leaveCreditDeduction } from '../utils/leaveCredits.js';
import { Announcement } from '../models/announcementModel.js';

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
  // The profile photo is left out: it would be repeated in every request.
  const { profilePicture, ...safeProfile } = toSafeUser(employee);
  return { ...request, employee: safeProfile, employeeName: request.employeeName || safeProfile.name };
}));

export const getRequests = async (req, res) => {
  try {
    const list = await Leave.findAllRequests();
    // A draft is the employee's own until they submit it.
    const visible = req.user?.accessLevel === 'employee'
      ? list.filter(request => request.employeeId === req.user.employeeId || request.employeeEmail === req.user.email)
      : list.filter(request => request.status !== 'Draft');
    res.status(200).json(await enrichRequestEmployees(visible));
  } catch (error) {
    sendServerError(res, error);
  }
};

export const createRequest = async (req, res) => {
  try {
    const requestBody = req.user?.accessLevel === 'employee'
      ? buildEmployeeRequest(req.body, req.user)
      : { ...req.body };
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
      // Employees may edit, submit, or discard their own drafts, and withdraw their own
      // requests that have not been decided yet.
      update = existing.status === 'Draft'
        ? buildEmployeeDraftUpdate(existing, req.body, req.user)
        : buildEmployeeWithdrawal(existing, req.body, req.user);
      if (!update) {
        return res.status(403).json({ success: false, error: 'You can only change your own drafts, or withdraw your own requests before they are approved or rejected.' });
      }
    } else if (role === 'supervisor' || role === 'hr_admin') {
      update = pickReviewUpdate(req.body);
      const problem = reviewUpdateProblem(existing.status, update, role);
      if (problem) return res.status(409).json({ success: false, error: problem });
    } else {
      return res.status(403).json({ success: false, error: 'You do not have permission to perform this action.' });
    }
    const updated = await Leave.updateStatus(id, update);

    // Deduct leave credits the first time a leave request is approved. The flag on the
    // request makes sure two approvals at the same moment cannot deduct twice.
    const deduction = leaveCreditDeduction(existing, updated);
    if (deduction && await Leave.markCreditsDeducted(id)) {
      await User.deductLeaveCredits({ employeeId: updated.employeeId, email: updated.employeeEmail }, deduction.field, deduction.days);
    }

    if (updated && role === 'employee' && updated.status === 'Pending') {
      await notifyHrOfSubmission(updated, req.user);
    }
    if (updated && role === 'employee' && updated.status === 'Withdrawn') {
      await notifyReviewersOfWithdrawal(updated, req.user, existing.status);
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
    for (const update of Array.isArray(req.body) ? req.body : []) {
      const existing = typeof update?.id === 'string' ? await Leave.findByCustomId(update.id) : null;
      const problem = existing && reviewUpdateProblem(existing.status, pickReviewUpdate(update), req.user?.accessLevel);
      if (problem) return res.status(409).json({ success: false, error: `${update.id}: ${problem}` });
    }
    const updated = await Leave.bulkUpdate(req.body);
    res.status(200).json({ success: true, requests: updated });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};
