import { isRealDate } from './localDate.js';

// An employee's separation from the service: the last day of service (`separationDate`,
// YYYY-MM-DD) and its cause, which HR records when the employee leaves. Up to that day the
// employee still counts (their last month's DTR, absences, and leave credits, earned for the days
// of service that month), as long as HR keeps the account Inactive rather than deleting it. The
// causes are the usual ones for leaving government service.
export const SEPARATION_REASONS = [
  'Resignation',
  'Retirement',
  'Transfer to another office',
  'End of contract or appointment',
  'Dropped from the rolls',
  'Dismissal',
  'Death',
  'Other'
];

const statusOf = person => String(person?.accountStatus || 'Active').trim().toLowerCase();
const separationOf = person => (isRealDate(String(person?.separationDate || '')) ? person.separationDate : '');

// Whether `person` was in the service on `date` (YYYY-MM-DD): up to their separation date when
// they have one (an Active or Inactive account), or else while their account is Active.
export const inServiceOn = (person, date) => {
  const separated = separationOf(person);
  if (separated) return ['active', 'inactive'].includes(statusOf(person)) && Boolean(date) && date <= separated;
  return statusOf(person) === 'active';
};

// Whether `person` was in the service on any day from `from` (YYYY-MM-DD) on.
export const inServiceSince = (person, from) => {
  const separated = separationOf(person);
  if (separated) return ['active', 'inactive'].includes(statusOf(person)) && (!from || from <= separated);
  return statusOf(person) === 'active';
};

export const employeesInServiceOn = (employees = [], date) => employees.filter(person => inServiceOn(person, date));
export const employeesInServiceSince = (employees = [], from) => employees.filter(person => inServiceSince(person, from));

// Checks HR's separation fields: both empty, or a real date (not before the date hired) with one
// of the causes. Returns { value: { separationDate, separationReason } } or { error }.
export const normalizeSeparation = (body = {}, dateHired = '') => {
  const separationDate = typeof body.separationDate === 'string' ? body.separationDate.trim() : '';
  const separationReason = typeof body.separationReason === 'string' ? body.separationReason.trim() : '';
  if (!separationDate && !separationReason) return { value: { separationDate: '', separationReason: '' } };
  if (!isRealDate(separationDate)) return { error: 'Enter the date of separation, like 2026-11-15.' };
  if (dateHired && isRealDate(dateHired) && separationDate < dateHired) return { error: 'The date of separation cannot be before the date hired.' };
  if (!SEPARATION_REASONS.includes(separationReason)) return { error: 'Choose the cause of separation.' };
  return { value: { separationDate, separationReason } };
};

// "Nov 15, 2026 · Resignation", or '' when not separated.
export const separationText = person => {
  const separated = separationOf(person);
  if (!separated) return '';
  const date = new Date(`${separated}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return [date, person.separationReason].filter(Boolean).join(' · ');
};
