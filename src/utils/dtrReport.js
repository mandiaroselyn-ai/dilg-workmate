import { zipSync } from 'fflate';
import bagongPilipinasLogo from '../assets/Bagong_Pilipinas-logo.png';
import dilgSeal from '../assets/dilg-seal.png';
import dtrTemplate from '../assets/template/dtr-template.pdf';
import { DTR_STATUS, dtrColumn } from '../../shared/dtrReport';
import { consolidatedPdfFilename, fillConsolidatedPdf } from './consolidatedReportPdf';
import { dtrFilename, fillDTR } from './dtrForm';
import { dtrReportFilename, fillDtrReport } from './dtrReportForm';
import { dtrSignatures } from './dtrSubmission';
import { markDtrDay } from './hrAttendance';
import { fetchSignedForm } from './signedForms';

// The month's DTR report on the HR and PD desks (see shared/dtrReport.js), with the month's
// Consolidated Report of Attendance that goes with it.

export const monthText = month => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

// The cover's rows for the employees in service in the month (`staff`), in name order.
export const reportRows = (staff = [], submissions = [], month) => [...staff]
  .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  .map(employee => {
    const submission = submissions.find(item => item.month === month && item.employeeId === employee.employeeId) || null;
    return {
      employeeId: employee.employeeId,
      name: employee.name || employee.email || 'Employee',
      position: employee.role || employee.position || '',
      office: employee.assignedStation || employee.office || '',
      dtr: dtrColumn(submission),
      submission
    };
  });

// A submission's DTR as { fileName, fileType, bytes }: the copy the PD signed once verified, or
// else filled in from the records the server sends (`openSubmission(id)`), with the employee's
// signature.
export const makeSubmissionDtr = async (submission, openSubmission) => {
  const signed = submission.status === DTR_STATUS.verified && submission.signedForm ? await fetchSignedForm('dtr-incharge', submission.id) : null;
  if (signed) return { fileName: signed.fileName || `DTR_${submission.id}.pdf`, fileType: 'application/pdf', bytes: signed.bytes };
  const { employee, records, travelOrders = [], leaves = [] } = await openSubmission(submission.id);
  const [year, month] = submission.month.split('-').map(Number);
  const template = await (await fetch(dtrTemplate)).arrayBuffer();
  // A half day an approved leave or Travel Order covers is not tardiness or undertime.
  const days = records.map(record => markDtrDay(record, { requests: [...travelOrders, ...leaves] }));
  const bytes = await fillDTR(template, employee, year, month, days, { travelOrders, signatures: dtrSignatures(submission) });
  return { fileName: dtrFilename(employee?.name || submission.employeeName, year, month), fileType: 'application/pdf', bytes };
};

// The report's cover as { fileName, fileType, bytes }: the copy the PD signed, or before that the
// cover made from the list HR sent (unsigned; HR signs nothing).
export const reportCover = async report => {
  const signed = report.signedForms?.pd ? await fetchSignedForm('dtr-report-pd', report.month) : null;
  if (signed) return { fileName: signed.fileName || dtrReportFilename(report.month), fileType: 'application/pdf', bytes: signed.bytes, signed: true };
  const made = await fillDtrReport({ month: report.month, rows: report.rows || [] });
  return { fileName: dtrReportFilename(report.month), fileType: 'application/pdf', bytes: made.bytes, pageIndex: made.pageIndex, signed: false };
};

// What HR sends of the month's Consolidated Report of Attendance (`report`, the attendance report
// of utils/reports.js) with the DTR report: the PD's name, the vacant positions HR typed, the
// counts, and the rows, as the PD will certify them.
export const consolidatedToSend = (report, { director = '', vacant = '' } = {}) => ({
  director,
  vacant,
  counts: { personnel: report.counts.personnel, male: report.counts.male, female: report.counts.female },
  rows: report.rows.map(({ no, name, position, station, vl, sl, tardy, undertime, halfDay, remarks }) => ({ no, name, position, station, vl, sl, tardy, undertime, halfDay, remarks }))
});

// The PNG bytes of the report's two logos; a logo that cannot be loaded is left out.
const reportLogos = async () => (await Promise.all([dilgSeal, bagongPilipinasLogo].map(async url => {
  try {
    const response = await fetch(url);
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  } catch {
    return null;
  }
}))).filter(Boolean);

// The Consolidated Report of Attendance of `month` as a PDF to view or sign, made from
// `consolidated` (see consolidatedToSend): { fileName, fileType, bytes, pageIndex, marks }.
export const makeConsolidatedPdf = async (month, consolidated) => ({
  fileName: consolidatedPdfFilename(month),
  fileType: 'application/pdf',
  ...(await fillConsolidatedPdf({ monthLabel: monthText(month), consolidated, logos: await reportLogos() })),
  signed: false
});

// The Consolidated Report of Attendance sent with `report`: the copy the PD signed, or before that
// the one made from what HR sent (unsigned).
export const consolidatedDocument = async report => {
  const signed = report.signedForms?.consolidated ? await fetchSignedForm('dtr-consolidated-pd', report.month) : null;
  if (signed) return { fileName: signed.fileName || consolidatedPdfFilename(report.month), fileType: 'application/pdf', bytes: signed.bytes, signed: true };
  return makeConsolidatedPdf(report.month, report.consolidated);
};

const fileSafe = value => String(value || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'file';

// Downloads the whole report as one ZIP for the Regional Office: the signed cover, the signed
// Consolidated Report of Attendance, and each signed DTR, every file as signed (so their digital
// signatures stay valid). `submissions` are the month's. `onProgress(text)` tells how far it is.
export const downloadReportZip = async (report, submissions = [], onProgress = () => {}) => {
  const files = {};
  onProgress('Getting the signed report…');
  const cover = await reportCover(report);
  if (!cover.signed) throw new Error('The report is not signed by the Provincial Director yet.');
  files[fileSafe(cover.fileName || `DTR_Report_${report.month}_signed.pdf`)] = cover.bytes;
  if (report.signedForms?.consolidated) {
    onProgress('Getting the signed Consolidated Report of Attendance…');
    const consolidated = await fetchSignedForm('dtr-consolidated-pd', report.month);
    if (consolidated) files[fileSafe(consolidated.fileName || consolidatedPdfFilename(report.month))] = consolidated.bytes;
  }
  const included = report.submissionIds.map(id => submissions.find(item => item.id === id)).filter(Boolean);
  for (const [index, submission] of included.entries()) {
    onProgress(`Getting DTR ${index + 1} of ${included.length}…`);
    const signed = await fetchSignedForm('dtr-incharge', submission.id);
    if (signed) files[`DTRs/${fileSafe(signed.fileName || `${submission.employeeName}_DTR_${report.month}.pdf`)}`] = signed.bytes;
  }
  // PDFs are already compressed: stored as they are.
  const zip = zipSync(files, { level: 0 });
  const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `DTR_Report_${report.month}_DILG_Marinduque.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  onProgress('');
};
