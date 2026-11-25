import { zipSync } from 'fflate';
import dtrTemplate from '../assets/template/dtr-template.pdf';
import { DTR_STATUS } from '../../shared/dtrReport';
import { dtrFilename, fillDTR } from './dtrForm';
import { dtrSignatures } from './dtrSubmission';
import { markDtrDay } from './hrAttendance';
import { fetchSignedForm } from './signedForms';

// The month's DTR report on the HR and PD desks (see shared/dtrReport.js).

export const monthText = month => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

// What the report's cover says of each employee's DTR, from their submission (or none).
const dtrColumn = submission => {
  if (!submission) return 'Not submitted';
  if ([DTR_STATUS.checked, DTR_STATUS.verified].includes(submission.status)) return 'Attached';
  if (submission.status === DTR_STATUS.returned) return 'Returned to employee';
  return 'With HR';
};

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

// The report's signed cover: the PD's copy once signed, else HR's. Null when there is none.
export const fetchReportCover = async report => (report.signedForms?.pd ? await fetchSignedForm('dtr-report-pd', report.month) : null)
  || (report.signedForms?.hr ? await fetchSignedForm('dtr-report-hr', report.month) : null);

const fileSafe = value => String(value || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'file';

// Downloads the whole report as one ZIP for the Regional Office: the signed cover and each signed
// DTR, every file as signed (so their digital signatures stay valid). `submissions` are the
// month's. `onProgress(text)` tells how far it is.
export const downloadReportZip = async (report, submissions = [], onProgress = () => {}) => {
  const files = {};
  onProgress('Getting the signed report…');
  const cover = await fetchReportCover(report);
  if (!cover) throw new Error('The signed report is not available yet.');
  files[fileSafe(cover.fileName || `DTR_Report_${report.month}_signed.pdf`)] = cover.bytes;
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
