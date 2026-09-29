import { Leave } from '../models/leaveModel.js';
import { sendServerError } from '../middleware/requestSecurity.js';
import { User } from '../models/User.js';
import { toSafeUser } from '../utils/passwordSecurity.js';
import { buildEmployeeRequest, pickReviewUpdate } from '../utils/requestFields.js';

const enrichRequestEmployees = async (requests) => Promise.all(requests.map(async request => {
  const employee = request.employeeId
    ? await User.findByEmployeeId(request.employeeId)
    : request.employeeEmail
      ? await User.findByEmail(request.employeeEmail)
      : null;
  if (!employee) return request;
  const safeProfile = toSafeUser(employee);
  return { ...request, employee: safeProfile, employeeName: request.employeeName || safeProfile.name };
}));

export const getRequests = async (req, res) => {
  try {
    const list = await Leave.findAllRequests();
    const visible = req.user?.accessLevel === 'employee'
      ? list.filter(request => request.employeeId === req.user.employeeId || request.employeeEmail === req.user.email)
      : list;
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
    res.status(201).json({ success: true, request: newReq });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const updateRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Leave.updateStatus(id, pickReviewUpdate(req.body));

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
    const updated = await Leave.bulkUpdate(req.body);
    res.status(200).json({ success: true, requests: updated });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};
