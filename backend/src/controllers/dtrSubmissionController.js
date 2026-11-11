import { DtrSubmission, dtrContentHash } from '../models/dtrSubmissionModel.js';
import { DtrLog } from '../models/dtrLogModel.js';
import { Leave } from '../models/leaveModel.js';
import { User } from '../models/User.js';
import { Announcement } from '../models/announcementModel.js';
import { sendServerError } from '../middleware/requestSecurity.js';
import { noticeEmployee } from '../services/employeeNotices.js';
import { toRequesterProfile } from '../utils/passwordSecurity.js';
import { monthLabel } from '../utils/leaveCredits.js';
import { getManilaDateString } from '../../../shared/localDate.js';
import { travelOrderCovers } from '../../../shared/travelStatus.js';

// Monthly DTR submission (CSC Form No. 48) through WorkMate, e-signed. The employee certifies
// their DTR for an ended month with their signature and password, and the Supervisor, as the
// In-charge, verifies it the same way or returns it with remarks. Under the Electronic Commerce
// Act (RA 8792, Sec. 8) an electronic signature counts as a signature when it shows who signed
// and that they approved: here the signer's own account, their password at the moment of
// signing, and the time are kept with the signature.

const MAX_SIGNATURE_LENGTH = 300 * 1024;
const isSignatureImage = value => typeof value === 'string'
  && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value)
  && value.length <= MAX_SIGNATURE_LENGTH;
const isMonth = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));

// The month a year before `month`, so lists stay short.
const yearBefore = month => `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`;

// Why the signer's e-signature cannot be taken, or '' when it can: a signature image, and the
// signer's own password (an account made with Google sign-in sets one in Settings first).
const signerProblem = async (user, { signature, password }) => {
  if (!isSignatureImage(signature)) return 'Add your signature (draw it or upload a PNG or JPG under 300 KB).';
  if (!user?.password) return 'Set a WorkMate password in Settings first. You confirm your e-signature with it.';
  if (typeof password !== 'string' || !password || !(await User.verifyPassword(user, password))) {
    return 'Your password is incorrect. Enter it to confirm your e-signature.';
  }
  return '';
};

// Records whose offline Time In or Time Out still waits for HR's decision.
const pendingDays = records => records
  .filter(record => [record.offlineTimeIn, record.offlineTimeOut].some(entry => entry?.reviewReasons?.length && !entry.decision))
  .map(record => record.date)
  .sort();

const employeeOf = async submission => (await User.findByEmployeeId(submission.employeeId))
  || (submission.employeeEmail && await User.findByEmail(submission.employeeEmail))
  || null;

// An employee's own submissions, or everyone's from the past year for the Supervisor and HR.
// With ?id=, one submission with what its DTR is made from: the employee, the month's records,
// and the approved Travel Orders that include them.
export const getDtrSubmissions = async (req, res) => {
  try {
    const role = req.user?.accessLevel;
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (id) {
      const submission = await DtrSubmission.findById(id);
      const own = submission && role === 'employee' && submission.employeeId === req.user.employeeId;
      if (!submission || (!own && !['supervisor', 'hr_admin'].includes(role))) {
        return res.status(404).json({ success: false, error: 'DTR submission not found.' });
      }
      const employee = await employeeOf(submission);
      const person = employee || { employeeId: submission.employeeId, email: submission.employeeEmail, name: submission.employeeName };
      const records = await DtrLog.findMonthForEmployee({ employeeId: person.employeeId, email: person.email }, submission.month);
      const travelOrders = (await Leave.findAllRequests())
        .filter(request => request.type === 'Travel Order' && /approved/i.test(request.status || '') && travelOrderCovers(request, person));
      return res.status(200).json({
        success: true,
        submission,
        employee: employee ? { ...toRequesterProfile(employee), name: employee.name, employeeId: employee.employeeId } : person,
        records,
        travelOrders
      });
    }
    const list = role === 'employee'
      ? await DtrSubmission.findForEmployee(req.user.employeeId)
      : ['supervisor', 'hr_admin'].includes(role)
        ? await DtrSubmission.findAll({ since: yearBefore(getManilaDateString().slice(0, 7)) })
        : [];
    res.status(200).json({ success: true, submissions: list });
  } catch (error) {
    sendServerError(res, error);
  }
};

// The employee signs and submits their DTR for an ended month: { month, signature, password }.
// A returned one is signed and submitted again. The Supervisor is told.
export const submitDtr = async (req, res) => {
  try {
    if (req.user?.accessLevel !== 'employee') {
      return res.status(403).json({ success: false, error: 'Only employees submit their own DTR.' });
    }
    const month = typeof req.body?.month === 'string' ? req.body.month.trim() : '';
    if (!isMonth(month)) return res.status(400).json({ success: false, error: 'Choose the month of the DTR, like 2026-10.' });
    if (month >= getManilaDateString().slice(0, 7)) {
      return res.status(400).json({ success: false, error: 'Only a month that has ended can be submitted. Submit this month\'s DTR once it is over.' });
    }
    const problem = await signerProblem(req.user, req.body || {});
    if (problem) return res.status(400).json({ success: false, error: problem });
    const records = await DtrLog.findMonthForEmployee({ employeeId: req.user.employeeId, email: req.user.email }, month);
    const waiting = pendingDays(records);
    if (waiting.length) {
      return res.status(409).json({ success: false, error: `HR still has to decide your offline Time In or Time Out on ${waiting.join(', ')}. Submit the DTR once HR has.` });
    }
    const signature = { image: req.body.signature, name: req.user.name || '', position: req.user.role || '', signedAt: new Date() };
    const submission = await DtrSubmission.submit({ employee: req.user, month, signature, contentHash: dtrContentHash(records, month) });
    if (!submission) {
      const existing = await DtrSubmission.findOne(req.user.employeeId, month);
      return res.status(409).json({ success: false, error: existing?.status === 'Verified' ? `Your DTR for ${monthLabel(month)} is already verified.` : `Your DTR for ${monthLabel(month)} is already submitted and waiting for the Supervisor.` });
    }
    await Announcement.createNotification({
      title: 'DTR for Verification',
      message: `${req.user.name || 'An employee'} signed and submitted their DTR for ${monthLabel(month)} for your verification.`,
      type: 'attendance',
      recipientRole: 'supervisor',
      view: 'supervisor'
    }).catch(error => console.error('Unable to notify the Supervisor about a DTR:', error));
    res.status(201).json({ success: true, submission });
  } catch (error) {
    sendServerError(res, error);
  }
};

// The Supervisor verifies a submitted DTR ({ id, action: 'verify', signature, password }) or
// returns it to the employee ({ id, action: 'return', remarks }). A DTR whose attendance changed
// after the employee signed it cannot be verified: it is returned so they sign the corrected one.
export const reviewDtrSubmission = async (req, res) => {
  try {
    if (req.user?.accessLevel !== 'supervisor') {
      return res.status(403).json({ success: false, error: 'Only the Supervisor (In-charge) verifies DTRs.' });
    }
    const { id, action } = req.body || {};
    const submission = typeof id === 'string' ? await DtrSubmission.findById(id) : null;
    if (!submission) return res.status(404).json({ success: false, error: 'DTR submission not found.' });
    if (submission.status !== 'Submitted') {
      return res.status(409).json({ success: false, error: `This DTR is already ${submission.status.toLowerCase()}.` });
    }
    const label = monthLabel(submission.month);
    const employee = await employeeOf(submission);
    const person = employee || { employeeId: submission.employeeId, email: submission.employeeEmail };

    if (action === 'verify') {
      const problem = await signerProblem(req.user, req.body);
      if (problem) return res.status(400).json({ success: false, error: problem });
      const records = await DtrLog.findMonthForEmployee({ employeeId: person.employeeId, email: person.email }, submission.month);
      if (dtrContentHash(records, submission.month) !== submission.contentHash) {
        return res.status(409).json({ success: false, error: 'This DTR changed after the employee signed it (for example, HR corrected a record). Return it so the employee signs the corrected DTR.' });
      }
      const verified = await DtrSubmission.verify(id, { image: req.body.signature, name: req.user.name || '', position: req.user.role || '', signedAt: new Date() });
      if (!verified) return res.status(409).json({ success: false, error: 'This DTR is no longer waiting for verification.' });
      await noticeEmployee(person, {
        title: 'DTR Verified',
        message: `Your DTR for ${label} was verified by ${req.user.name || 'the Supervisor'}.`,
        type: 'attendance',
        view: 'documents'
      });
      return res.status(200).json({ success: true, submission: verified });
    }

    if (action === 'return') {
      const remarks = typeof req.body.remarks === 'string' ? req.body.remarks.trim() : '';
      if (!remarks) return res.status(400).json({ success: false, error: 'Write in the remarks what the employee needs to fix.' });
      if (remarks.length > 300) return res.status(400).json({ success: false, error: 'The remarks must be 300 characters or fewer.' });
      const returned = await DtrSubmission.returnToEmployee(id, { by: req.user.name || 'Supervisor', remarks });
      if (!returned) return res.status(409).json({ success: false, error: 'This DTR is no longer waiting for verification.' });
      await noticeEmployee(person, {
        title: 'DTR Returned',
        message: `Your DTR for ${label} was returned by ${req.user.name || 'the Supervisor'}. Fix it, then sign and submit it again in Documents. Remarks: ${remarks}`,
        type: 'attendance',
        view: 'documents'
      });
      return res.status(200).json({ success: true, submission: returned });
    }

    res.status(400).json({ success: false, error: 'Choose to verify the DTR or return it to the employee.' });
  } catch (error) {
    sendServerError(res, error);
  }
};
