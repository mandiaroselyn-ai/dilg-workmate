// Forms signed with the signer's Adobe digital ID (until PNPKI certificates are in use).
//
// WorkMate makes the form (CSC Form No. 6, Travel Order, or DTR), and the signer signs it in
// WorkMate with the digital ID they made in Adobe (see src/utils/digitalIdSigning.js). WorkMate
// keeps the signed PDF as the official copy that the employee and HR open.

// What each upload is, who may make it, and how many signatures the file must carry.
export const SIGNED_FORM_KINDS = {
  // CSC Form No. 6, signed by HR 2 at 7.A (certification of leave credits) and 7.B (recommendation).
  'leave-hr': { label: 'CSC Form No. 6 (7.A and 7.B)', role: 'hr_admin', signatures: 1 },
  // CSC Form No. 6, signed by the Head at 7.C and 7.D, on top of HR 2's signature.
  'leave-head': { label: 'CSC Form No. 6 (7.C and 7.D)', role: 'supervisor', signatures: 2 },
  // The Travel Order, signed by the Head.
  'travel-head': { label: 'Travel Order', role: 'supervisor', signatures: 1 },
  // The employee's DTR, verified and signed by the Head as the In-charge.
  'dtr-incharge': { label: 'Daily Time Record (CSC Form No. 48)', role: 'supervisor', signatures: 1 },
  // The month's DTR report (its cover list), which HR sends unsigned, signed by the Head as
  // "Approved by". HR signs nothing (the user, 2026-11-25: "walang pirma ang hr 1").
  'dtr-report-pd': { label: 'Monthly DTR Report (approved by the Head)', role: 'supervisor', signatures: 1 },
  // The month's Consolidated Report of Attendance (DILG Marinduque's template), which HR sends
  // unsigned with the DTR report, certified and signed by the Head.
  'dtr-consolidated-pd': { label: 'Consolidated Report of Attendance (certified by the Head)', role: 'supervisor', signatures: 1 }
};

// A short tag WorkMate writes into the PDF it makes, so an uploaded file can be matched to the
// form it came from. Adobe keeps it when it signs the file.
export const signedFormMarker = (kind, ref) => `workmate:${kind}:${ref}`;

// The tag of the form that is signed in a later step on the same PDF (the leave form is made
// for HR 2's step, and the Head signs that same file).
export const markerKindOf = kind => {
  if (kind === 'leave-head' || kind === 'leave-hr') return 'leave';
  if (kind === 'dtr-report-pd') return 'dtr-report';
  return kind;
};

export const MAX_SIGNED_PDF_BYTES = 3 * 1024 * 1024;
