// The monthly DTR flow at DILG Marinduque (as the user set it on 2026-11-25: "DTR of employee to
// HR, then whole monthly report from HR with employees' signature pass to PD, then pass to
// regional"):
// 1. The employee signs their DTR (CSC Form No. 48) for an ended month: it goes to HR.
// 2. HR (the HR/Admin desk) checks it, or returns it to the employee with remarks.
// 3. HR signs the month's report, a cover list of every employee's DTR, as "Prepared by" and
//    sends it with the checked DTRs to the Provincial Director (PD).
// 4. The PD signs the report as "Approved by" and each DTR as the In-charge, or returns the report
//    to HR with remarks.
// 5. The PD sends the signed report and DTRs to the Regional Office (outside WorkMate, which has
//    no Regional Office accounts) and marks it forwarded.

import { usesHr2Desk } from './hrSteps.js';

// Who checks the DTRs and prepares the report: HR on the HR/Admin desk. HR 2's desk is for leave
// only (shared/hrSteps.js).
export const checksDtrs = user => user?.accessLevel === 'hr_admin' && !usesHr2Desk(user);

// A DTR's status: with HR, checked by HR (waiting for the report), verified by the PD, or returned.
export const DTR_STATUS = {
  submitted: 'Submitted',
  checked: 'Checked',
  verified: 'Verified',
  returned: 'Returned'
};

// A month's report's status.
export const DTR_REPORT_STATUS = {
  forPd: 'For PD',
  returned: 'Returned to HR',
  signed: 'Signed by PD',
  forwarded: 'Forwarded to Regional Office'
};

// The report's reference: its month (YYYY-MM), so the PDF HR signs is tagged before it is saved.
export const isReportMonth = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));

// Whether HR may still check or return the DTRs of a month whose report is `report` (or none):
// only before it goes to the PD, or after the PD returns it.
export const reportOpenToHr = report => !report || report.status === DTR_REPORT_STATUS.returned;

// Why HR cannot send the report of `month` yet, from the month's DTR submissions, or '' when it
// can: none may still wait for HR's check, and at least one must be checked.
export const reportNotReady = (submissions = [], month) => {
  const ofMonth = submissions.filter(item => item?.month === month);
  const waiting = ofMonth.filter(item => item.status === DTR_STATUS.submitted);
  if (waiting.length) {
    return `Check or return the DTR${waiting.length === 1 ? '' : 's'} still waiting for you first: ${waiting.map(item => item.employeeName || item.employeeId).join(', ')}.`;
  }
  if (!ofMonth.some(item => item.status === DTR_STATUS.checked)) return 'No checked DTR to send yet. Check the DTRs the employees submitted first.';
  return '';
};
