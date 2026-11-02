import { MARINDUQUE_MUNICIPALITIES } from './marinduqueLocations.js';

// A home address is chosen as the town in Marinduque, then its barangay, then the house
// number and street, or typed in full under Other (outside the province). It is saved as
// one line, as before: "House No./Street, Barangay, Town, Marinduque", or as typed.
export const OTHER_ADDRESS = 'Other';
const PROVINCE = 'Marinduque';

const sameText = (a, b) => a.toLowerCase() === b.toLowerCase();

export const joinHomeAddress = ({ town = '', barangay = '', street = '', other = '' } = {}) => {
  if (town === OTHER_ADDRESS) return other.trim();
  if (!town) return '';
  return [street.trim(), barangay, town, PROVINCE].filter(Boolean).join(', ');
};

// The parts of a saved address. One not written that way (typed before the dropdowns, or
// outside Marinduque) comes back as Other with its text, so nothing is lost.
export const splitHomeAddress = (text = '') => {
  const value = String(text || '').trim();
  if (!value) return { town: '', barangay: '', street: '', other: '' };
  const parts = value.split(',').map(part => part.trim());
  const town = parts.length >= 2 && sameText(parts[parts.length - 1], PROVINCE)
    ? Object.keys(MARINDUQUE_MUNICIPALITIES).find(name => sameText(name, parts[parts.length - 2]))
    : null;
  if (!town) return { town: OTHER_ADDRESS, barangay: '', street: '', other: value };
  const before = parts.slice(0, -2);
  const barangay = before.length
    ? MARINDUQUE_MUNICIPALITIES[town].find(name => sameText(name, before[before.length - 1])) || ''
    : '';
  return { town, barangay, street: (barangay ? before.slice(0, -1) : before).join(', '), other: '' };
};
