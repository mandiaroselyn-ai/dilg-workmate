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

// Position titles, written exactly as DILG Marinduque's staff list writes them: the position,
// then after a slash the designation that goes with it ("LGOO VI / Program Manager"). An
// MLGOO's town is their office, so it is left out ("MLGOO / Cluster Team Leader"). The
// position goes on CSC Form No. 6 as it is chosen. The other ranks of each position, which
// no one on the list holds yet, follow for new hires.
export const POSITION_TITLE_GROUPS = [
  {
    label: 'DILG Marinduque staff list',
    titles: [
      'Provincial Director',
      'Assistant Provincial Director',
      'LGOO VII / Cluster Head',
      'LGOO VI / Program Manager',
      'LGOO V / LGCDS Chief',
      'LGOO II / LGMES Chief',
      'LGOO II',
      'MLGOO',
      'MLGOO / Cluster Team Leader',
      'ADAS II (Chief)',
      'ADAS II',
      'ISA I',
      'Engineer III',
      'Job Order (Utility)',
      'Job Order (Driver)'
    ]
  },
  {
    label: 'Other ranks',
    titles: [
      ...ranks('LGOO', ['III', 'IV', 'V', 'VI', 'VII']),
      ...ranks('ADAS', ['I', 'III']),
      ...ranks('Administrative Officer', ['I', 'II', 'III', 'IV', 'V']),
      ...ranks('Administrative Aide', ['I', 'II', 'III', 'IV', 'V', 'VI']),
      ...ranks('ISA', ['II', 'III']),
      ...ranks('Project Development Officer', ['I', 'II', 'III', 'IV']),
      'Engineer II'
    ]
  }
];
export const POSITION_TITLES = POSITION_TITLE_GROUPS.flatMap(group => group.titles);

// Designations are the work a person is assigned on top of their position, such as an LGOO VII
// designated Cluster Head, or an MLGOO who is also a Cluster Team Leader. The staff list's
// position titles already carry theirs after the slash; the Designation field is for one given
// later or one the list does not show.
export const DESIGNATIONS = [
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
