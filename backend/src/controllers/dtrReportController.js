import { DtrReport } from '../models/dtrReportModel.js';
import { DtrSubmission } from '../models/dtrSubmissionModel.js';
import { Announcement } from '../models/announcementModel.js';
import { sendServerError } from '../middleware/requestSecurity.js';
import { monthLabel } from '../utils/leaveCredits.js';
import { getManilaDateString } from '../../../shared/localDate.js';
import { DTR_REPORT_STATUS, DTR_STATUS, checksDtrs, dtrColumn, isReportMonth, reportNotReady, reportOpenToHr } from '../../../shared/dtrReport.js';
import { dtrChanged, employeeOfSubmission } from './signedDocumentController.js';

// The monthly DTR reports (see shared/dtrReport.js). Here HR and the PD list them, HR sends one to
// the PD (HR signs nothing), the PD returns one to HR with remarks, and the PD marks a signed one
// as forwarded to the Regional Office. The PD signs it through the signed-form upload
// (signedDocumentController).

const yearBefore = month => `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`;
const sees = user => checksDtrs(user) || user?.accessLevel === 'supervisor';

const notifyHr = (title, message) => Announcement.createNotification({ title, message, type: 'attendance', recipientRole: 'hr_admin' })
  .catch(error => console.error(`Unable to notify HR (${title}):`, error));

// GET: the past year's reports, newest month first.
export const getDtrReports = async (req, res) => {
  try {
    if (!sees(req.user)) return res.status(403).json({ success: false, error: 'Only HR and the Provincial Director see the DTR reports.' });
    const reports = await DtrReport.findAll({ since: yearBefore(getManilaDateString().slice(0, 7)) });
    res.status(200).json({ success: true, reports });
  } catch (error) {
    sendServerError(res, error);
  }
};

const MAX_ROWS = 500;
const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

// POST { month, rows: [{ employeeId, name, position, office }] }: HR sends the month's report to
// the PD with the month's checked DTRs. `rows` are the employees in service that month, as HR's
// list shows them; what each row says of the DTR is the server's. None may still wait for HR's
// check, and each DTR sent must still be the one its employee signed.
export const sendDtrReport = async (req, res) => {
  try {
    if (!checksDtrs(req.user)) return res.status(403).json({ success: false, error: 'Only HR (the HR/Admin desk) sends the DTR report.' });
    const month = text(req.body?.month, 7);
    if (!isReportMonth(month) || month >= getManilaDateString().slice(0, 7)) {
      return res.status(400).json({ success: false, error: 'Choose a month that has ended.' });
    }
    const given = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!given || !given.length || given.length > MAX_ROWS) return res.status(400).json({ success: false, error: 'The report needs the list of employees.' });
    const existing = await DtrReport.findByMonth(month);
    if (!reportOpenToHr(existing)) {
      return res.status(409).json({ success: false, error: `The DTR report for ${monthLabel(month)} is already ${existing.status === DTR_REPORT_STATUS.forPd ? 'with the Provincial Director' : existing.status.toLowerCase()}.` });
    }
    const submissions = await DtrSubmission.findMonth(month);
    const notReady = reportNotReady(submissions, month);
    if (notReady) return res.status(409).json({ success: false, error: notReady });
    const checked = submissions.filter(item => item.status === DTR_STATUS.checked);
    const changed = [];
    for (const submission of checked) {
      if (await dtrChanged(submission, await employeeOfSubmission(submission))) changed.push(submission.employeeName || submission.employeeId);
    }
    if (changed.length) {
      return res.status(409).json({ success: false, error: `These DTRs changed after the employee signed them (for example, a record was corrected): ${changed.join(', ')}. Return them so the employees sign the corrected DTR.` });
    }
    const rows = given.map(row => {
      const employeeId = text(row?.employeeId, 64);
      return {
        employeeId,
        name: text(row?.name, 150) || 'Employee',
        position: text(row?.position, 150),
        office: text(row?.office, 150),
        dtr: dtrColumn(employeeId ? submissions.find(item => item.employeeId === employeeId) : null)
      };
    });
    const report = await DtrReport.send({
      month,
      submissionIds: checked.map(item => item.id),
      rows,
      sentBy: { name: req.user.name || '', position: req.user.role || '', at: new Date() }
    });
    if (!report) return res.status(409).json({ success: false, error: `The DTR report for ${monthLabel(month)} was already sent.` });
    await Announcement.createNotification({
      title: 'DTR Report to Sign',
      message: `${req.user.name || 'HR'} sent the DTR report for ${monthLabel(month)} with ${checked.length} DTR${checked.length === 1 ? '' : 's'}. Sign the report and the DTRs, or return it to HR.`,
      type: 'attendance',
      recipientRole: 'supervisor',
      view: 'supervisor'
    }).catch(error => console.error('Unable to notify the Supervisor about a DTR report:', error));
    res.status(200).json({ success: true, report });
  } catch (error) {
    sendServerError(res, error);
  }
};

// PATCH { id, action: 'return', remarks } or { id, action: 'forward', reference }, by the PD.
export const reviewDtrReport = async (req, res) => {
  try {
    if (req.user?.accessLevel !== 'supervisor') {
      return res.status(403).json({ success: false, error: 'Only the Provincial Director returns or forwards the DTR report.' });
    }
    const { id, action } = req.body || {};
    const report = typeof id === 'string' ? await DtrReport.findById(id) : null;
    if (!report) return res.status(404).json({ success: false, error: 'DTR report not found.' });
    const label = monthLabel(report.month);
    const by = req.user.name || 'The Provincial Director';

    if (action === 'return') {
      if (report.status !== DTR_REPORT_STATUS.forPd) return res.status(409).json({ success: false, error: `This DTR report is ${report.status.toLowerCase()}.` });
      const remarks = typeof req.body.remarks === 'string' ? req.body.remarks.trim() : '';
      if (!remarks) return res.status(400).json({ success: false, error: 'Write in the remarks what HR needs to fix.' });
      if (remarks.length > 500) return res.status(400).json({ success: false, error: 'The remarks must be 500 characters or fewer.' });
      const returned = await DtrReport.returnToHr(report.id, { by, remarks });
      if (!returned) return res.status(409).json({ success: false, error: 'This DTR report is no longer waiting for you.' });
      await notifyHr('DTR Report Returned', `${by} returned the DTR report for ${label}. Fix it in DTR Records, then sign and send it again. Remarks: ${remarks}`);
      return res.status(200).json({ success: true, report: returned });
    }

    if (action === 'forward') {
      if (report.status !== DTR_REPORT_STATUS.signed) {
        return res.status(409).json({ success: false, error: report.status === DTR_REPORT_STATUS.forwarded ? 'This DTR report was already forwarded.' : 'Sign the DTR report first.' });
      }
      const reference = typeof req.body.reference === 'string' ? req.body.reference.trim() : '';
      if (reference.length > 200) return res.status(400).json({ success: false, error: 'The reference must be 200 characters or fewer.' });
      const forwarded = await DtrReport.forward(report.id, { by, reference });
      if (!forwarded) return res.status(409).json({ success: false, error: 'This DTR report is no longer waiting to be forwarded.' });
      await notifyHr('DTR Report Forwarded', `${by} forwarded the signed DTR report for ${label} to the Regional Office.${reference ? ` Reference: ${reference}` : ''}`);
      return res.status(200).json({ success: true, report: forwarded });
    }

    res.status(400).json({ success: false, error: 'Choose to return the DTR report to HR or mark it forwarded.' });
  } catch (error) {
    sendServerError(res, error);
  }
};
