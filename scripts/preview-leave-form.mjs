// Fills CSC Form No. 6 with sample answers so positions can be checked without the app.
//   node scripts/preview-leave-form.mjs          writes leave-form-preview.pdf
//   node scripts/preview-leave-form.mjs --grid   adds a grid of coordinates (in points)
// Positions live in LEAVE_FORM_LAYOUT in src/utils/leaveForm.js.
import fs from 'node:fs';
import { fillLeaveForm } from '../src/utils/leaveForm.js';

const grid = process.argv.includes('--grid');
const type = process.argv.find(arg => arg.startsWith('--type='))?.slice('--type='.length) || 'Vacation Leave';
const template = fs.readFileSync(new URL('../src/assets/template/csc-form-6-template.pdf', import.meta.url));

const applicant = {
  name: 'Juan A. Dela Cruz',
  office: 'DILG Marinduque - Boac',
  role: 'LGOO VI - Program Manager',
  salary: 'P 45,000.00'
};
const request = {
  leaveType: type,
  detailsType: type.toLowerCase().includes('sick') ? 'In Hospital' : 'Within Philippines',
  detailsSpecify: type.toLowerCase().includes('sick') ? 'Acute Gastroenteritis' : 'Baguio City',
  submissionDate: '2026-09-30',
  startDate: '2026-10-05',
  endDate: '2026-10-07',
  workingDays: 3,
  commutation: 'Not Requested'
};

const output = 'leave-form-preview.pdf';
fs.writeFileSync(output, await fillLeaveForm(template, request, applicant, { grid }));
console.log(`Wrote ${output} (${type}${grid ? ', with grid' : ''}).`);
