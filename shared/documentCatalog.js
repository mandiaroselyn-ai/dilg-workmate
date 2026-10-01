// The kinds of employee documents kept in WorkMate, shared by the app and the server.
// Leave applications, travel orders, and DTRs are not stored here: they are made from the
// requests and attendance already in the app.

// Certificates an employee can ask HR for. HR answers by uploading the signed copy.
export const CERTIFICATE_TYPES = [
  'Certificate of Employment',
  'Certified Service Record',
  'Statement of Leave Credits'
];

export const DOCUMENT_CATEGORIES = {
  '201': {
    label: '201 File',
    types: [
      'Personal Data Sheet (CS Form 212)',
      'Work Experience Sheet',
      'Appointment',
      'Oath of Office',
      'Certificate of Assumption to Duty',
      'Position Description Form',
      'Notice of Salary Adjustment (NOSA)',
      'Notice of Step Increment (NOSI)',
      'Service Record',
      'SALN',
      'Other'
    ]
  },
  performance: {
    label: 'Performance Rating',
    types: ['IPCR', 'Performance Rating', 'Other']
  },
  training: {
    label: 'Training Certificate',
    types: ['Training / Seminar', 'Webinar', 'Certificate of Completion', 'Other']
  },
  certificate: {
    label: 'Certificate',
    types: CERTIFICATE_TYPES
  }
};

export const DOCUMENT_CATEGORY_IDS = Object.keys(DOCUMENT_CATEGORIES);

// HR uploads to every category except certificates, which HR releases from a request.
export const HR_UPLOAD_CATEGORIES = ['201', 'performance', 'training'];
// Employees add only their own training certificates.
export const EMPLOYEE_UPLOAD_CATEGORIES = ['training'];

// A certificate request is Requested until HR releases the signed copy or declines it.
// Every uploaded document is Filed.
export const DOCUMENT_STATUSES = ['Filed', 'Requested', 'Released', 'Declined'];

// Uploads are PDFs or photos of the paper copy. The cap keeps an upload, sent as text,
// inside the 4.5 MB request limit of the hosting.
export const DOCUMENT_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;
