// Emails on the agency domain (or one of its subdomains, such as a regional office) are
// DILG accounts, whose passwords HR resets. Set AGENCY_EMAIL_DOMAIN to change it.
const DEFAULT_AGENCY_EMAIL_DOMAIN = 'dilg.gov.ph';

export const isAgencyEmailAddress = (email, domain = process.env.AGENCY_EMAIL_DOMAIN || DEFAULT_AGENCY_EMAIL_DOMAIN) => {
  const normalized = String(email || '').trim().toLowerCase();
  const agencyDomain = String(domain || '').trim().toLowerCase().replace(/^@/, '');
  if (!agencyDomain || !/^[^\s@]+@[^\s@]+$/.test(normalized)) return false;
  const emailDomain = normalized.split('@')[1];
  return emailDomain === agencyDomain || emailDomain.endsWith(`.${agencyDomain}`);
};
