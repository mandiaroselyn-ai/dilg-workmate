// Fills CSC Form No. 48 with sample data so positions can be checked without the app.
//   node scripts/preview-dtr.mjs          writes dtr-preview.pdf
//   node scripts/preview-dtr.mjs --grid   adds a coordinate grid
import fs from 'node:fs';
import { fillDTR } from '../src/utils/dtrForm.js';
import { drawGrid } from '../src/utils/leaveForm.js';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const grid = process.argv.includes('--grid');
const templateBytes = fs.readFileSync(new URL('../src/assets/template/dtr-template.pdf', import.meta.url));

const employee = {
  name: 'DELA CRUZ, JUAN A.',
  employeeId: 'DILG-2026-0001',
  office: 'Marinduque Provincial Office',
  role: 'LGOO VI',
};

// Sample August 2026 records (day 1 = Saturday, skip weekends)
const records = [
  { date: '2026-08-03', timeIn: '08:00 AM', timeOut: '05:00 PM' }, // Mon
  { date: '2026-08-04', timeIn: '08:15 AM', timeOut: '05:00 PM' }, // Tue — late
  { date: '2026-08-05', timeIn: '07:55 AM', timeOut: '04:30 PM' }, // Wed — early out
  { date: '2026-08-06', timeIn: '08:00 AM', timeOut: '05:00 PM' }, // Thu
  { date: '2026-08-07', timeIn: '08:00 AM', timeOut: '05:00 PM' }, // Fri
  { date: '2026-08-10', timeIn: '08:00 AM', timeOut: '05:00 PM' },
  { date: '2026-08-11', timeIn: '08:05 AM', timeOut: '05:00 PM' },
  { date: '2026-08-12', timeIn: '08:00 AM', timeOut: '05:00 PM' },
  { date: '2026-08-13', timeIn: '08:00 AM', timeOut: '04:00 PM' }, // early out
  { date: '2026-08-14', timeIn: '08:00 AM', timeOut: '05:00 PM' },
];

let pdfBytes = await fillDTR(templateBytes, employee, 2026, 8, records);

if (grid) {
  const pdf = await PDFDocument.load(pdfBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const page of pdf.getPages()) drawGrid(page, font);
  pdfBytes = await pdf.save();
}

const output = 'dtr-preview.pdf';
fs.writeFileSync(output, pdfBytes);
console.log(`Wrote ${output}${grid ? ' (with grid)' : ''}.`);
