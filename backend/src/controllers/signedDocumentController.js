import { Leave } from '../models/leaveModel.js';
import { DtrSubmission, dtrContentHash } from '../models/dtrSubmissionModel.js';
import { DtrLog } from '../models/dtrLogModel.js';
import { User } from '../models/User.js';
import { SignedDocument, signedNote } from '../models/signedDocumentModel.js';
import { sendServerError } from '../middleware/requestSecurity.js';
import { noticeEmployee } from '../services/employeeNotices.js';
import { finishReview } from './requestController.js';
import { countSignatures, sha256, signedPdfProblem } from '../utils/signedPdf.js';
import { monthLabel } from '../utils/leaveCredits.js';
import { MAX_SIGNED_PDF_BYTES, SIGNED_FORM_KINDS } from '../../../shared/signedForms.js';
import { FOR_PRE_APPROVAL, awaitsHead, doesHrStep } from '../../../shared/hrSteps.js';
import { getManilaDateString } from '../../../shared/localDate.js';
import { DTR_REPORT_STATUS, DTR_STATUS, isReportMonth } from '../../../shared/dtrReport.js';
import { DtrReport } from '../models/dtrReportModel.js';
import { Announcement } from '../models/announcementModel.js';

// Forms signed in Adobe and uploaded back to WorkMate (see shared/signedForms.js):
// - HR 2 uploads a certified leave's CSC Form No. 6 signed at 7.A and 7.B, which sends it to the Head;
// - the Head uploads that form signed at 7.C and 7.D with the decision, or a Travel Order (which
//   comes straight to the Head) signed to approve it, or an employee's DTR signed as the In-charge
//   to verify it;
// - the Head uploads the month's DTR report, which HR sent unsigned, signed as "Approved by" (see
//   shared/dtrReport.js), after the Consolidated Report of Attendance HR sent with it, which the
//   Head certifies and signs.
// The upload is the official copy that the employee and HR then view and download.

const FINAL_KINDS = ['leave-head', 'travel-head', 'dtr-incharge'];
const safeFileName = value => String(value || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 150) || 'signed-form.pdf';

// The uploaded file's bytes from base64 (a data: link is fine too), or { error }.
const readUpload = data => {
  const base64 = typeof data === 'string' ? data.replace(/^data:application\/pdf;base64,/, '') : '';
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return { error: 'Choose the signed PDF to upload.' };
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MAX_SIGNED_PDF_BYTES) return { error: 'The signed PDF is too large (3 MB at most). Save it in Adobe without extra pages or pictures, then upload it again.' };
  return { bytes };
};

const ownsRequest = (user, request) => request.employeeId === user.employeeId
  || (request.employeeEmail && request.employeeEmail === user.email)
  || (request.type === 'Travel Order' && (request.companions || []).some(companion => companion?.employeeId === user.employeeId));

const uploader = user => ({ name: user?.name || '', position: user?.role || '', email: user?.email || '' });

export const employeeOfSubmission = async submission => (await User.findByEmployeeId(submission.employeeId))
  || (submission.employeeEmail && await User.findByEmail(submission.employeeEmail))
  || { employeeId: submission.employeeId, email: submission.employeeEmail };

// GET ?kind=&ref=: the signed PDF, as { document: { fileName, data (base64), ... } }. HR and the
// Supervisor see every one; an employee sees the final signed copy of their own forms.
export const getSignedDocument = async (req, res) => {
  try {
    const kind = String(req.query.kind || '');
    const ref = String(req.query.ref || '');
    if (!SIGNED_FORM_KINDS[kind] || !ref) return res.status(400).json({ success: false, error: 'Choose a signed form.' });
    const role = req.user?.accessLevel;
    if (role === 'employee') {
      const owner = kind === 'dtr-incharge'
        ? (await DtrSubmission.findById(ref))?.employeeId === req.user.employeeId
        : FINAL_KINDS.includes(kind) && (await Leave.findByCustomId(ref).then(request => request && ownsRequest(req.user, request)));
      if (!owner) return res.status(404).json({ success: false, error: 'Signed form not found.' });
    } else if (!['hr_admin', 'supervisor'].includes(role)) {
      return res.status(403).json({ success: false, error: 'You do not have permission to view this form.' });
    }
    const document = await SignedDocument.find(kind, ref);
    if (!document) return res.status(404).json({ success: false, error: 'Signed form not found.' });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      success: true,
      document: { ...signedNote(document), data: document.data.toString('base64') }
    });
  } catch (error) {
    sendServerError(res, error);
  }
};

const statusEntry = (status, user) => ({ status, date: getManilaDateString(), actor: user?.name || '' });

// HR 2 uploads a certified leave's form signed at 7.A and 7.B: it goes to the Head.
const uploadHrLeave = async (req, res, { ref, bytes, fileName }) => {
  if (req.user?.accessLevel !== 'hr_admin' || !doesHrStep(req.user.hrTask, 'pre-approval')) {
    return res.status(403).json({ success: false, error: 'Only HR 2 signs 7.A and 7.B of a leave.' });
  }
  const existing = await Leave.findByCustomId(ref);
  if (!existing || existing.type !== 'Leave Request') return res.status(404).json({ success: false, error: 'Leave not found.' });
  if (existing.status !== FOR_PRE_APPROVAL || !existing.creditCertification) {
    return res.status(409).json({ success: false, error: existing.status === 'For Supervisor' ? 'This leave was already sent to the Head.' : 'Certify the leave credits first. That makes the form to sign.' });
  }
  const problem = await signedPdfProblem(bytes, { kind: 'leave-hr', ref, minSignatures: 1 });
  if (problem) return res.status(400).json({ success: false, error: problem });
  const signatures = countSignatures(bytes);
  await SignedDocument.save({ kind: 'leave-hr', ref, fileName, bytes, signatures, sha256: sha256(bytes), uploadedBy: uploader(req.user) });
  const note = { ...signedNote({ fileName, size: bytes.length, signatures, uploadedBy: uploader(req.user), uploadedAt: new Date() }) };
  const remarks = typeof req.body?.remarks === 'string' ? req.body.remarks.trim().slice(0, 1000) : '';
  const update = {
    status: 'For Supervisor',
    approver: 'Supervisor Review Desk',
    ...(remarks ? { remarks } : {}),
    signedForms: { ...(existing.signedForms || {}), hr: note },
    statusHistory: [...(existing.statusHistory || []), statusEntry('For Supervisor', req.user)]
  };
  const updated = await finishReview({ id: ref, existing, update, req });
  return res.status(200).json({ success: true, request: updated });
};

// The Head uploads a leave signed at 7.C and 7.D (approved or disapproved), or a Travel Order
// signed to approve it.
const uploadHeadDecision = async (req, res, { kind, ref, bytes, fileName }) => {
  if (req.user?.accessLevel !== 'supervisor') return res.status(403).json({ success: false, error: 'Only the Head (Supervisor) signs this form.' });
  const existing = await Leave.findByCustomId(ref);
  const type = kind === 'leave-head' ? 'Leave Request' : 'Travel Order';
  if (!existing || existing.type !== type) return res.status(404).json({ success: false, error: `${type === 'Leave Request' ? 'Leave' : 'Travel Order'} not found.` });
  // A leave HR 2 sent, or a Travel Order, which comes straight to the Head (shared/hrSteps.js).
  if (!awaitsHead(existing)) {
    return res.status(409).json({ success: false, error: `This request is ${existing.status || 'not waiting for you'}. Only a leave HR 2 sent to you, or a submitted Travel Order, is signed.` });
  }
  const decision = kind === 'travel-head' ? 'Approved' : req.body?.decision;
  if (!['Approved', 'Rejected'].includes(decision)) return res.status(400).json({ success: false, error: 'Choose your decision: approved or disapproved.' });
  const remarks = typeof req.body?.remarks === 'string' ? req.body.remarks.trim().slice(0, 1000) : '';
  if (decision === 'Rejected' && !remarks) return res.status(400).json({ success: false, error: 'Write the reason for disapproving the leave in the remarks.' });
  // A leave HR 2 signed in Adobe is signed again on the same file; one HR sent before signed
  // uploads began has no earlier file.
  const before = kind === 'leave-head' ? await SignedDocument.find('leave-hr', ref) : null;
  const problem = await signedPdfProblem(bytes, {
    kind,
    ref,
    minSignatures: before ? countSignatures(before.data) + 1 : 1,
    before: before?.data || null
  });
  if (problem) return res.status(400).json({ success: false, error: problem });
  const signatures = countSignatures(bytes);
  await SignedDocument.save({ kind, ref, fileName, bytes, signatures, sha256: sha256(bytes), uploadedBy: uploader(req.user) });
  const note = signedNote({ fileName, size: bytes.length, signatures, uploadedBy: uploader(req.user), uploadedAt: new Date() });
  const finalRemarks = remarks || (decision === 'Approved' ? 'Approved.' : '');
  const update = {
    status: decision,
    stage: decision === 'Approved' ? 'Supervisor Approved' : 'Rejected',
    approver: 'Supervisor Review Desk',
    remarks: finalRemarks,
    supervisorRemarks: finalRemarks,
    supervisorApprovedAt: getManilaDateString(),
    supervisorName: req.user.name || 'Supervisor',
    signedForms: { ...(existing.signedForms || {}), head: note },
    statusHistory: [...(existing.statusHistory || []), statusEntry(decision, req.user)]
  };
  const updated = await finishReview({ id: ref, existing, update, req });
  return res.status(200).json({ success: true, request: updated });
};

// Why DTR `submission` cannot be verified now, or '': the employee's records changed since they
// signed it. `person` is its employee.
export const dtrChanged = async (submission, person) => {
  const records = await DtrLog.findMonthForEmployee({ employeeId: person.employeeId, email: person.email }, submission.month);
  return dtrContentHash(records, submission.month) !== submission.contentHash;
};

// The Head uploads an employee's DTR signed as the In-charge: it is verified. Only a DTR HR checked
// and sent in the month's report, while the report is with the Head (see shared/dtrReport.js).
const uploadDtrVerification = async (req, res, { ref, bytes, fileName }) => {
  if (req.user?.accessLevel !== 'supervisor') return res.status(403).json({ success: false, error: 'Only the Supervisor (In-charge) verifies DTRs.' });
  const submission = await DtrSubmission.findById(ref);
  if (!submission) return res.status(404).json({ success: false, error: 'DTR submission not found.' });
  if (submission.status !== DTR_STATUS.checked) {
    return res.status(409).json({ success: false, error: submission.status === DTR_STATUS.submitted ? 'HR has not checked this DTR yet. It comes to you in the month\'s DTR report.' : `This DTR is already ${submission.status.toLowerCase()}.` });
  }
  const report = await DtrReport.findByMonth(submission.month);
  if (report?.status !== DTR_REPORT_STATUS.forPd || !report.submissionIds.includes(submission.id)) {
    return res.status(409).json({ success: false, error: 'This DTR is not in a DTR report waiting for your signature.' });
  }
  const person = await employeeOfSubmission(submission);
  if (await dtrChanged(submission, person)) {
    return res.status(409).json({ success: false, error: 'This DTR changed after the employee signed it (for example, HR corrected a record). Return the report to HR so the employee signs the corrected DTR.' });
  }
  const problem = await signedPdfProblem(bytes, { kind: 'dtr-incharge', ref, minSignatures: 1 });
  if (problem) return res.status(400).json({ success: false, error: problem });
  const signatures = countSignatures(bytes);
  await SignedDocument.save({ kind: 'dtr-incharge', ref, fileName, bytes, signatures, sha256: sha256(bytes), uploadedBy: uploader(req.user) });
  const note = signedNote({ fileName, size: bytes.length, signatures, uploadedBy: uploader(req.user), uploadedAt: new Date() });
  const verified = await DtrSubmission.verify(ref, { image: '', name: req.user.name || '', position: req.user.role || '', signedAt: new Date() }, note);
  if (!verified) return res.status(409).json({ success: false, error: 'This DTR is no longer waiting for verification.' });
  await noticeEmployee(person, {
    title: 'DTR Verified',
    message: `Your DTR for ${monthLabel(submission.month)} was verified and signed by ${req.user.name || 'the Supervisor'}. The signed copy is in Documents.`,
    type: 'attendance',
    view: 'documents'
  });
  return res.status(200).json({ success: true, submission: verified });
};

// The PD signs the month's report (made from the list HR sent; HR signs nothing) as "Approved by",
// after signing each of its DTRs as the In-charge: the report is ready for the Regional Office.
const uploadDtrReportPd = async (req, res, { ref: month, bytes, fileName }) => {
  if (req.user?.accessLevel !== 'supervisor') return res.status(403).json({ success: false, error: 'Only the Provincial Director signs the DTR report.' });
  const report = isReportMonth(month) ? await DtrReport.findByMonth(month) : null;
  if (!report) return res.status(404).json({ success: false, error: 'DTR report not found.' });
  if (report.status !== DTR_REPORT_STATUS.forPd) return res.status(409).json({ success: false, error: `This DTR report is ${report.status.toLowerCase()}.` });
  const submissions = await DtrSubmission.findMonth(month);
  const unsigned = report.submissionIds
    .map(id => submissions.find(item => item.id === id))
    .filter(item => item && item.status !== DTR_STATUS.verified);
  if (unsigned.length) {
    return res.status(409).json({ success: false, error: `Sign these DTRs as the In-charge first: ${unsigned.map(item => item.employeeName || item.employeeId).join(', ')}.` });
  }
  if (report.consolidated && !report.signedForms?.consolidated) {
    return res.status(409).json({ success: false, error: 'Sign the Consolidated Report of Attendance sent with this report first.' });
  }
  const problem = await signedPdfProblem(bytes, { kind: 'dtr-report-pd', ref: month, minSignatures: 1 });
  if (problem) return res.status(400).json({ success: false, error: problem });
  const signatures = countSignatures(bytes);
  await SignedDocument.save({ kind: 'dtr-report-pd', ref: month, fileName, bytes, signatures, sha256: sha256(bytes), uploadedBy: uploader(req.user) });
  const note = signedNote({ fileName, size: bytes.length, signatures, uploadedBy: uploader(req.user), uploadedAt: new Date() });
  const approved = await DtrReport.approve(report.id, { approvedBy: { name: req.user.name || '', position: req.user.role || '', at: new Date() }, signedForm: note });
  if (!approved) return res.status(409).json({ success: false, error: 'This DTR report is no longer waiting for your signature.' });
  await Announcement.createNotification({
    title: 'DTR Report Signed',
    message: `${req.user.name || 'The Provincial Director'} signed the DTR report for ${monthLabel(month)} and its ${report.submissionIds.length} DTR${report.submissionIds.length === 1 ? '' : 's'}. It is ready for the Regional Office.`,
    type: 'attendance',
    recipientRole: 'hr_admin'
  }).catch(error => console.error('Unable to notify HR about a signed DTR report:', error));
  return res.status(200).json({ success: true, report: approved });
};

// The PD certifies and signs the month's Consolidated Report of Attendance (made from what HR sent
// with the DTR report; HR signs nothing), before signing the report itself.
const uploadDtrConsolidatedPd = async (req, res, { ref: month, bytes, fileName }) => {
  if (req.user?.accessLevel !== 'supervisor') return res.status(403).json({ success: false, error: 'Only the Provincial Director signs the Consolidated Report of Attendance.' });
  const report = isReportMonth(month) ? await DtrReport.findByMonth(month) : null;
  if (!report?.consolidated) return res.status(404).json({ success: false, error: 'No Consolidated Report of Attendance was sent with this DTR report.' });
  if (report.status !== DTR_REPORT_STATUS.forPd) return res.status(409).json({ success: false, error: `This DTR report is ${report.status.toLowerCase()}.` });
  const problem = await signedPdfProblem(bytes, { kind: 'dtr-consolidated-pd', ref: month, minSignatures: 1 });
  if (problem) return res.status(400).json({ success: false, error: problem });
  const signatures = countSignatures(bytes);
  await SignedDocument.save({ kind: 'dtr-consolidated-pd', ref: month, fileName, bytes, signatures, sha256: sha256(bytes), uploadedBy: uploader(req.user) });
  const note = signedNote({ fileName, size: bytes.length, signatures, uploadedBy: uploader(req.user), uploadedAt: new Date() });
  const signed = await DtrReport.signConsolidated(report.id, note);
  if (!signed) return res.status(409).json({ success: false, error: 'This DTR report is no longer waiting for your signature.' });
  return res.status(200).json({ success: true, report: signed });
};

// POST { kind, ref, fileName, data (base64 PDF), decision?, remarks? }.
export const uploadSignedDocument = async (req, res) => {
  try {
    const kind = String(req.body?.kind || '');
    const ref = String(req.body?.ref || '');
    if (!SIGNED_FORM_KINDS[kind] || !ref) return res.status(400).json({ success: false, error: 'Choose the form you signed.' });
    const upload = readUpload(req.body?.data);
    if (upload.error) return res.status(400).json({ success: false, error: upload.error });
    const args = { kind, ref, bytes: upload.bytes, fileName: safeFileName(req.body?.fileName) };
    if (kind === 'leave-hr') return await uploadHrLeave(req, res, args);
    if (kind === 'dtr-incharge') return await uploadDtrVerification(req, res, args);
    if (kind === 'dtr-report-pd') return await uploadDtrReportPd(req, res, args);
    if (kind === 'dtr-consolidated-pd') return await uploadDtrConsolidatedPd(req, res, args);
    return await uploadHeadDecision(req, res, args);
  } catch (error) {
    sendServerError(res, error);
  }
};
