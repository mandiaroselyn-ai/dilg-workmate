import { DtrReport } from '../models/dtrReportModel.js';
import { Announcement } from '../models/announcementModel.js';
import { sendServerError } from '../middleware/requestSecurity.js';
import { monthLabel } from '../utils/leaveCredits.js';
import { getManilaDateString } from '../../../shared/localDate.js';
import { DTR_REPORT_STATUS, checksDtrs } from '../../../shared/dtrReport.js';

// The monthly DTR reports (see shared/dtrReport.js). HR sends one, and the PD signs it, through
// the signed-form upload (signedDocumentController); here HR and the PD list them, the PD returns
// one to HR with remarks, and the PD marks a signed one as forwarded to the Regional Office.

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
