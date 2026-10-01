// Fills the travel order (Provincial Order) template with sample answers so positions can
// be checked without the app.
//   node scripts/preview-travel-order.mjs          writes travel-order-preview.pdf
//   node scripts/preview-travel-order.mjs --grid   adds a grid of coordinates (in points)
//   node scripts/preview-travel-order.mjs --long   uses long answers, to check wrapping
// Positions live in TRAVEL_ORDER_LAYOUT in src/utils/travelOrderForm.js.
import fs from 'node:fs';
import { fillTravelOrder } from '../src/utils/travelOrderForm.js';

const grid = process.argv.includes('--grid');
const long = process.argv.includes('--long');
const template = fs.readFileSync(new URL('../src/assets/template/travelorder-template.pdf', import.meta.url));

const person = { name: 'Juan A. Dela Cruz', role: 'LGOO II' };
const request = long
  ? {
    id: 'REQ-2026-0042',
    submissionDate: '2026-09-30',
    travelActivity: 'Provincial Orientation and Capacity Development Workshop on the Seal of Good Local Governance Assessment',
    startDate: '2026-09-30',
    endDate: '2026-10-02',
    travelTime: '8:00 AM - 5:00 PM daily',
    travelVenue: 'Session Hall, Sangguniang Panlalawigan Building, Provincial Capitol Compound, Boac, Marinduque'
  }
  : {
    id: 'REQ-2026-0042',
    submissionDate: '2026-09-30',
    travelActivity: 'Barangay Assembly Monitoring',
    startDate: '2026-10-05',
    travelTime: '8:00 AM - 5:00 PM',
    travelVenue: 'Barangay Hall, Brgy. Tabi, Boac'
  };

const output = 'travel-order-preview.pdf';
fs.writeFileSync(output, await fillTravelOrder(template, request, person, { grid }));
console.log(`Wrote ${output}${long ? ' (long answers)' : ''}${grid ? ' (with grid)' : ''}.`);
