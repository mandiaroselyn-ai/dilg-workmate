import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { durationText, officeHoursText } from './dtrDay.js';
import { dayEntry, dtrRecordsByDay, monthDeductionText, monthDtrTotals, totalUndertimeMinutes } from './dtrMonth.js';

// Fills both duplicates on each page of the CSC Form No. 48 DTR template
// (src/assets/template/dtr-template.pdf) with one employee's monthly attendance data.
// Coordinates in PDF points from the bottom-left corner (page is 612 × 792 Letter portrait).
// Run `node scripts/preview-dtr.mjs --grid` to show the calibration grid.

const black = rgb(0, 0, 0);
const white = rgb(1, 1, 1);

const TIME_SIZE = 5.3;  // font size for time cells
const NAME_SIZE = 6.0;  // font size for employee name
const MONTH_SIZE = 4.2; // font size for month/year label
const SUMMARY_SIZE = 5.3; // font size for the month's summary under each copy
const NOTE_SIZE = 4.3;    // font size for the notes under the summary

// The month's summary goes in the blank part of the page under each copy, so the form's own
// boxes stay as the CSC prints them.
const SUMMARY_TOP = 113;     // baseline of the summary's heading
const SUMMARY_LINE = 7.5;    // points between summary rows
const SUMMARY_VALUE_X = 66;  // where values start, from the left edge of the copy

// Exact y-positions of each day row baseline, extracted from the template.
// The template uses August 2026 day-of-week labels (day 1 = Saturday).
const DAY_Y = [
  null,                                                             // 0 unused
  592, 579, 565, 552, 538, 525, 512,  // days  1-7  (sat–fri)
  499, 485, 472, 459, 445, 432, 419,  // days  8-14 (sat–fri)
  405, 392, 379, 366, 352, 339, 326,  // days 15-21 (sat–fri)
  312, 299, 286, 273, 259, 246, 233,  // days 22-28 (sat–fri)
  219, 206, 194,                      // days 29-31
];

// Layout for the two side-by-side duplicate columns on each page.
// `amArr` etc. are x-centers for the time data cells.
// The verifier name and "In-charge" are pre-printed on the template, so they are not drawn here.
const COLS = [
  {
    nameCenter: 187, nameY: 658.4, nameMaxWidth: 208,
    monthCenter: 215.5, monthY: 638.6, // sits on the blank line x 136.4–294.4, y 637.2
    hoursCenter: 164.5, hoursY: 631.4, hoursMaxWidth: 80, // blank x 122.8–206.2 before "(Regular days"
    dayNameX: 91,                   // x where day abbreviation text is placed
    dayCell: [86.9, 101.81],        // inside of the day-name cell, between its grid lines
    amArr: 127, amDep: 162, pmArr: 197, pmDep: 230,
    utHrs: 258, utMin: 282,
    totalY: 184,
    signCenter: 215.5, signY: 153.5, signMaxWidth: 150, // blank line x 136.4–294.4, y 151.2
    left: 79, right: 295,           // the copy's outer edges
  },
  {
    nameCenter: 420, nameY: 658.4, nameMaxWidth: 208,
    monthCenter: 450.5, monthY: 638.6, // sits on the blank line x 372.9–528.0, y 637.2
    hoursCenter: 399.1, hoursY: 631.4, hoursMaxWidth: 84, // blank x 355.2–443.0 before "(Regular days"
    dayNameX: 323,
    dayCell: [320.28, 338.28],
    amArr: 359, amDep: 394, pmArr: 429, pmDep: 462,
    utHrs: 490, utMin: 514,
    totalY: 184,
    signCenter: 450.5, signY: 153.5, signMaxWidth: 150, // blank line x 372.9–528.0, y 151.2
    left: 312, right: 529,          // the copy's outer edges
  },
];

// Day-of-week abbreviations (0 = Sunday … 6 = Saturday).
const DAY_ABBR = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Returns an array [1..daysInMonth] of day-of-week indexes (0=Sun).
function monthDayOfWeeks(year, month) {
  const days = new Date(year, month, 0).getDate(); // days in month
  return Array.from({ length: days }, (_, i) => new Date(year, month - 1, i + 1).getDay());
}

// Largest font size (down to 4.5 pt) at which `text` fits `maxWidth` in `font`.
function fitSize(text, font, maxWidth, maxSz = NAME_SIZE) {
  for (let sz = maxSz; sz >= 4.5; sz -= 0.25) {
    if (font.widthOfTextAtSize(text, sz) <= maxWidth) return sz;
  }
  return 4.5;
}

const timeText = minutes => (minutes ? durationText(minutes) : 'None');

// The rows of the month's summary: the late and undertime in the form's TOTAL, what they take
// from the employee, and the overtime, which is not deducted.
export function dtrSummaryRows(employee, year, month, recordsByDay) {
  const { late, early, overtime } = monthDtrTotals(recordsByDay);
  return [
    ['Late (tardiness)', timeText(late)],
    ['Undertime', timeText(early)],
    ['Deduction', monthDeductionText(employee, year, month, late + early)],
    ['Overtime (office order)', overtime ? `${durationText(overtime)}, not deducted` : 'None'],
  ];
}

// Draws the month's summary under one copy of the form.
function drawSummary(page, col, rows, font, bold) {
  const drawRow = (text, x, y, rowFont, size) => page.drawText(text, { x, y, size, font: rowFont, color: black });
  const x = col.left + 2;
  let y = SUMMARY_TOP;
  drawRow('SUMMARY FOR THE MONTH', x, y, bold, SUMMARY_SIZE);
  for (const [label, value] of rows) {
    y -= SUMMARY_LINE;
    drawRow(label, x, y, font, SUMMARY_SIZE);
    const valueX = col.left + SUMMARY_VALUE_X;
    drawRow(value, valueX, y, bold, fitSize(value, bold, col.right - valueX - 2, SUMMARY_SIZE));
  }
  for (const note of [
    'Late and undertime are charged by the CSC table (1 min = 0.002 day, 1 hour = 0.125 day).',
    'Saturdays, Sundays, and holidays have no late or undertime.',
    'Overtime needs an office order, and cannot offset late or undertime.',
  ]) {
    y -= SUMMARY_LINE - 1.5;
    drawRow(note, x, y, font, NOTE_SIZE);
  }
}

// Fills one page of the template with the employee's DTR data (both columns).
async function fillPage(pdf, page, employee, year, month, recordsByDay, font, bold) {
  const dowByDay = monthDayOfWeeks(year, month);
  const totalDays = dowByDay.length;

  // Total undertime for the month.
  const totalUT = totalUndertimeMinutes(recordsByDay);
  const totalUTHrs = Math.floor(totalUT / 60);
  const totalUTMin = totalUT % 60;
  const summaryRows = dtrSummaryRows(employee, year, month, recordsByDay);

  for (const col of COLS) {
    // --- Employee name ---
    const nameText = (employee.name || '').toUpperCase();
    const nameSz = fitSize(nameText, bold, col.nameMaxWidth);
    const nameW = bold.widthOfTextAtSize(nameText, nameSz);
    page.drawText(nameText, {
      x: col.nameCenter - nameW / 2,
      y: col.nameY,
      size: nameSz,
      font: bold,
      color: black,
    });

    // --- Month + Year ---
    const MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    const monthLabel = `${MONTHS[month - 1]} ${year}`;
    const monthW = bold.widthOfTextAtSize(monthLabel, MONTH_SIZE);
    page.drawText(monthLabel, {
      x: col.monthCenter - monthW / 2,
      y: col.monthY,
      size: MONTH_SIZE,
      font: bold,
      color: black,
    });

    // --- Official hours for arrival and departure (regular days) ---
    const hoursText = officeHoursText();
    const hoursSz = fitSize(hoursText, font, col.hoursMaxWidth, 5);
    const hoursW = font.widthOfTextAtSize(hoursText, hoursSz);
    page.drawText(hoursText, { x: col.hoursCenter - hoursW / 2, y: col.hoursY, size: hoursSz, font, color: black });

    // --- Day rows ---
    for (let d = 1; d <= 31; d++) {
      const rowY = DAY_Y[d];
      if (!rowY) continue;

      // Overwrite the template's pre-printed day abbreviation with the correct one. The white
      // box stays inside the cell so the grid lines around it are not covered.
      const isInMonth = d <= totalDays;
      const dayAbbr = isInMonth ? DAY_ABBR[dowByDay[d - 1]] : '';
      const [cellLeft, cellRight] = col.dayCell;
      page.drawRectangle({ x: cellLeft + 0.3, y: rowY - 3, width: cellRight - cellLeft - 0.6, height: 9, color: white });
      if (dayAbbr) {
        page.drawText(dayAbbr, { x: col.dayNameX, y: rowY, size: TIME_SIZE, font, color: black });
      }

      if (!isInMonth) continue;

      const rec = recordsByDay[d];
      if (!rec?.timeIn) continue;

      const { amArr, amDep, pmArr, pmDep, undertime: ut } = dayEntry(rec);

      // Write each time value centred in its column.
      for (const [cx, text] of [
        [col.amArr, amArr], [col.amDep, amDep],
        [col.pmArr, pmArr], [col.pmDep, pmDep],
      ]) {
        if (!text) continue;
        const w = font.widthOfTextAtSize(text, TIME_SIZE);
        page.drawText(text, { x: cx - w / 2, y: rowY, size: TIME_SIZE, font, color: black });
      }

      // Undertime columns (only when there is undertime).
      if (ut > 0) {
        const utH = String(Math.floor(ut / 60));
        const utM = String(ut % 60);
        const wH = font.widthOfTextAtSize(utH, TIME_SIZE);
        const wM = font.widthOfTextAtSize(utM, TIME_SIZE);
        page.drawText(utH, { x: col.utHrs - wH / 2, y: rowY, size: TIME_SIZE, font, color: black });
        page.drawText(utM, { x: col.utMin - wM / 2, y: rowY, size: TIME_SIZE, font, color: black });
      }
    }

    // --- TOTAL row ---
    if (totalUTHrs > 0 || totalUTMin > 0) {
      const tH = String(totalUTHrs);
      const tM = String(totalUTMin);
      const wH = bold.widthOfTextAtSize(tH, TIME_SIZE);
      const wM = bold.widthOfTextAtSize(tM, TIME_SIZE);
      page.drawText(tH, { x: col.utHrs - wH / 2, y: col.totalY, size: TIME_SIZE, font: bold, color: black });
      page.drawText(tM, { x: col.utMin - wM / 2, y: col.totalY, size: TIME_SIZE, font: bold, color: black });
    }

    // --- Employee signature name (certification) ---
    const signText = nameText;
    const signSz = fitSize(signText, bold, col.signMaxWidth, 5);
    const signW = bold.widthOfTextAtSize(signText, signSz);
    page.drawText(signText, {
      x: col.signCenter - signW / 2,
      y: col.signY,
      size: signSz,
      font: bold,
      color: black,
    });

    // --- The month's late, undertime, deduction, and overtime ---
    drawSummary(page, col, summaryRows, font, bold);
  }
}

// Public: loads the template bytes, fills both pages with the employee's data, and
// returns the bytes of the completed PDF ready for download.
export async function fillDTR(templateBytes, employee = {}, year, month, attendanceRecords = []) {
  const pdf = await PDFDocument.load(templateBytes);
  const pages = pdf.getPages();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Index records by day-of-month for quick lookup (see dtrRecordsByDay).
  const recordsByDay = dtrRecordsByDay(attendanceRecords, year, month);

  for (let i = 0; i < pages.length; i++) {
    if (i % 2 === 0) {
      await fillPage(pdf, pages[i], employee, year, month, recordsByDay, font, bold);
    }
  }

  return pdf.save();
}

// Produces the suggested filename: "DTR_DELA-CRUZ_2026-08.pdf"
export function dtrFilename(employeeName, year, month) {
  const lastName = String(employeeName || 'Employee').split(/[\s,]+/)[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `DTR_${lastName}_${year}-${String(month).padStart(2, '0')}.pdf`;
}
