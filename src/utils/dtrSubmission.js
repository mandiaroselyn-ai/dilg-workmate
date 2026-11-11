// A DTR (CSC Form No. 48) signed through WorkMate, as the pages show it and the form prints it.

// What the employee certifies by signing, as CSC Form No. 48 words it.
export const DTR_CERTIFICATION = 'I CERTIFY on my honor that the above is a true and correct report of the hours of work performed, record of which was made daily at the time of arrival and departure from office.';

// What the Supervisor, as the In-charge, certifies by signing.
export const DTR_VERIFICATION = 'VERIFIED as to the prescribed office hours.';

// The signatures a submission puts on the form ({ employee, verification }), or null when it has none.
export const dtrSignatures = submission => (submission?.employeeSignature
  ? { employee: submission.employeeSignature, verification: submission.status === 'Verified' ? submission.verification : null }
  : null);

const when = value => (value
  ? new Date(value).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
  : '');

// Where a submission stands, in a few words ('' when there is none).
export const dtrStatusText = submission => {
  if (!submission) return '';
  if (submission.status === 'Verified') return `Verified by ${submission.verification?.name || 'the Supervisor'} on ${when(submission.verification?.signedAt)}`;
  if (submission.status === 'Returned') return `Returned: ${submission.remarks || 'fix it and sign again'}`;
  return `Signed ${when(submission.employeeSignature?.signedAt)}, waiting for the Supervisor's verification`;
};
