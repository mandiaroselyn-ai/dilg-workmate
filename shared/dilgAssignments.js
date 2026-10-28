// Where DILG Marinduque people work and what their positions are called, from the office's
// own staff list (https://sites.google.com/view/dilg-one-marinduque/about-us). Every account
// form (sign-up, HR's employee and staff forms, and HR's own profile) takes the office from
// DILG_OFFICES, so the office filter and the reports group people the same way. Position
// titles and designations are only suggested: any title can be typed.

import { isRealDate } from './localDate.js';

export const DEFAULT_REGION = 'DILG Region IV-B - MIMAROPA';

// The provincial office's sections and units, and the MLGOO of each town in its cluster,
// as DILG Marinduque groups them.
export const DILG_OFFICE_GROUPS = [
  {
    label: 'Provincial Office',
    offices: [
      'Office of the Provincial Director',
      'Local Government Capability Development Section (LGCDS)',
      'Local Government Monitoring and Evaluation Section (LGMES)',
      'Finance and Administrative Section (FAS)',
      'ICT Unit',
      'Provincial Project Development and Management Unit (PPDMU)'
    ]
  },
  { label: 'Cluster 1', offices: ['Office of the MLGOO - Boac', 'Office of the MLGOO - Gasan', 'Office of the MLGOO - Mogpog'] },
  { label: 'Cluster 2', offices: ['Office of the MLGOO - Buenavista', 'Office of the MLGOO - Santa Cruz', 'Office of the MLGOO - Torrijos'] }
];
export const DILG_OFFICES = DILG_OFFICE_GROUPS.flatMap(group => group.offices);

// A new office must come from the list. An account saved before the list keeps its office
// (`previous`) until HR changes it. Returns the error message, or ''.
export const officeError = (office, previous = '') =>
  office && office !== previous && !DILG_OFFICES.includes(office) ? 'Choose the office from the list.' : '';

const ranks = (title, numerals) => numerals.map(numeral => `${title} ${numeral}`);

// Position titles, as on the appointment and CSC Form No. 6 ("Position"), written out in
// full: the staff list's LGOO II to VII, ADAS II (Administrative Assistant II), ISA I
// (Information Systems Analyst I), and Engineer III, with the other ranks of each for new
// hires, and the job order driver and utility worker.
export const POSITION_TITLES = [
  ...ranks('Local Government Operations Officer', ['II', 'III', 'IV', 'V', 'VI', 'VII']),
  ...ranks('Administrative Officer', ['I', 'II', 'III', 'IV', 'V']),
  ...ranks('Administrative Assistant', ['I', 'II', 'III']),
  ...ranks('Administrative Aide', ['I', 'II', 'III', 'IV', 'V', 'VI']),
  ...ranks('Information Systems Analyst', ['I', 'II', 'III']),
  ...ranks('Project Development Officer', ['I', 'II', 'III', 'IV']),
  ...ranks('Engineer', ['II', 'III']),
  'Driver',
  'Utility Worker'
];

// Designations are the work a person is assigned on top of their position, such as an
// LGOO VII designated Cluster Head, or an MLGOO who is also a Cluster Team Leader. They are
// not position titles.
export const DESIGNATIONS = [
  'Provincial Director',
  'Assistant Provincial Director',
  'Cluster Head',
  'Program Manager',
  'Cluster Team Leader',
  'Municipal Local Government Operations Officer (MLGOO)',
  'LGCDS Chief',
  'LGMES Chief',
  'FAS Chief'
];

// 09XXXXXXXXX or +639XXXXXXXXX, with any spaces, dashes, or brackets: a number SMS notices reach.
export const isPhilippineMobile = value => /^(09|\+?639)\d{9}$/.test(String(value || '').replace(/[\s()-]/g, ''));
// Leave approvals, account notices, and other SMS go to this number.
export const MOBILE_NUMBER_ERROR = 'Enter a mobile number, such as 0917 123 4567. SMS notices are sent there.';

// HR approves a sign-up only once it has what HR fills in when making an account itself.
// Returns the names of what is missing, or [] when the account can be approved.
export const missingApprovalDetails = (account = {}) => [
  [!String(account.role || '').trim(), 'position title'],
  [!String(account.office || '').trim(), 'office'],
  [!isPhilippineMobile(account.phoneNumber), 'mobile number'],
  [!isRealDate(String(account.dateHired || '')), 'date hired'],
  [!String(account.appointmentStatus || '').trim(), 'status of appointment']
].filter(([missing]) => missing).map(([, name]) => name);

// True when saving `accountStatus` approves a sign-up that was waiting (Pending) or turned down
// (Rejected). Reactivating an account that was deactivated is not an approval.
export const isSignUpApproval = (before, accountStatus) =>
  accountStatus === 'Active' && ['pending', 'rejected'].includes(String(before?.accountStatus || '').toLowerCase());
