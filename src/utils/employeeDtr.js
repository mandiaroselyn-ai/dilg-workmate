import dtrTemplate from '../assets/template/dtr-template.pdf';
import { travelOrderCovers } from '../../shared/travelStatus';
import { dtrFilename, fillDTR } from './dtrForm';
import { dtrSignatures } from './dtrSubmission';
import { fetchSignedForm } from './signedForms';
import { recordsForEmployees } from './hrAttendance';

// The month's DTR an employee signed through WorkMate, if they did.
export const dtrSubmissionFor = (submissions = [], employee, month) =>
  submissions.find(item => item.month === month && item.employeeId === employee?.employeeId) || null;

// An employee's DTR (CSC Form No. 48) for `month` (YYYY-MM), as { fileName, fileType, bytes }.
// A DTR the Provincial Director verified is the copy they signed; any other is filled in from
// the employee's attendance and Travel Orders, with the signatures it has so far.
export const makeEmployeeDtr = async ({ employee, month, attendance = [], requests = [], submission = null }) => {
  const signed = submission?.status === 'Verified' && submission.signedForm ? await fetchSignedForm('dtr-incharge', submission.id) : null;
  if (signed) return { fileName: signed.fileName || `DTR_${month}_signed.pdf`, fileType: 'application/pdf', bytes: signed.bytes };
  const [year, monthNumber] = month.split('-').map(Number);
  const response = await fetch(dtrTemplate);
  const bytes = await fillDTR(await response.arrayBuffer(), employee, year, monthNumber, recordsForEmployees(attendance, [employee]), {
    summary: true,
    travelOrders: requests.filter(request => travelOrderCovers(request, employee)),
    signatures: dtrSignatures(submission)
  });
  return { fileName: dtrFilename(employee?.name, year, monthNumber), fileType: 'application/pdf', bytes };
};
