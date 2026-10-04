import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { countsInDtr, dtrTimeOut } from './hrAttendance.js';

// Fills both duplicates on each page of the CSC Form No. 48 DTR template
// (src/assets/template/dtr-template.pdf) with one employee's monthly attendance data.
// Coordinates in PDF points from the bottom-left corner (page is 612 × 792 Letter portrait).
// Run `node scripts/preview-dtr.mjs --grid` to show the calibration grid.

const black = rgb(0, 0, 0);
const white = rgb(1, 1, 1);

const TIME_SIZE = 5.3;  // font size for time cells
const NAME_SIZE = 6.0;  // font size for employee name
const MONTH_SIZE = 4.2; // font size for month/year label

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
    dayNameX: 91,                   // x where day abbreviation text is placed
    dayCell: [86.9, 101.81],        // inside of the day-name cell, between its grid lines
    amArr: 127, amDep: 162, pmArr: 197, pmDep: 230,
    utHrs: 258, utMin: 282,
    totalY: 184,
    signCenter: 215.5, signY: 153.5, signMaxWidth: 150, // blank line x 136.4–294.4, y 151.2
  },
  {
    nameCenter: 420, nameY: 658.4, nameMaxWidth: 208,
    monthCenter: 450.5, monthY: 638.6, // sits on the blank line x 372.9–528.0, y 637.2
    dayNameX: 323,
    dayCell: [320.28, 338.28],
    amArr: 359, amDep: 394, pmArr: 429, pmDep: 462,
    utHrs: 490, utMin: 514,
    totalY: 184,
    signCenter: 450.5, signY: 153.5, signMaxWidth: 150, // blank line x 372.9–528.0, y 151.2
  },
];

// Day-of-week abbreviations (0 = Sunday … 6 = Saturday).
const DAY_ABBR = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Returns an array [1..daysInMonth] of day-of-week indexes (0=Sun).
function monthDayOfWeeks(year, month) {
  const days = new Date(year, month, 0).getDate(); // days in month
  return Array.from({ length: days }, (_, i) => new Date(year, month - 1, i + 1).getDay());
}

// Parses "08:05 AM" → { h: 8, min: 5 } in 24-hour values, or null.
function parseTime(value) {
  const m = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(String(value || '').trim());
  if (!m) return null;
  const h = (Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0);
  return { h, min: Number(m[2]) };
}

// Formats as "8:05" (no AM/PM, no seconds), as used in Philippine DTR forms.
function fmt(t) {
  if (!t) return '';
  return `${t.h % 12 || 12}:${String(t.min).padStart(2, '0')}`;
}

// Breaks a day's timeIn/timeOut into the four DTR columns.
function dtrTimes(timeIn, timeOut) {
  const tin = parseTime(timeIn);
  const tout = parseTime(timeOut);
  if (!tin) return { amArr: '', amDep: '', pmArr: '', pmDep: '' };

  if (tin.h < 12 && tout && tout.h >= 13) {
    // Full day: morning arrival, afternoon departure.
    return { amArr: fmt(tin), amDep: '12:00', pmArr: '1:00', pmDep: fmt(tout) };
  }
  if (tin.h < 12) {
    // Morning only, or incomplete (no time-out).
    return { amArr: fmt(tin), amDep: tout ? fmt(tout) : '', pmArr: '', pmDep: '' };
  }
  // Afternoon only.
  return { amArr: '', amDep: '', pmArr: fmt(tin), pmDep: tout ? fmt(tout) : '' };
}

// Undertime in minutes for one day (0 if none or if record is incomplete).
function undertimeMins(timeIn, timeOut) {
  const tin = parseTime(timeIn);
  const tout = parseTime(timeOut);
  if (!tin || !tout) return 0;
  const tinM = tin.h * 60 + tin.min;
  const toutM = tout.h * 60 + tout.min;
  const isFullDay = tin.h < 12 && tout.h >= 13;
  const worked = toutM - tinM - (isFullDay ? 60 : 0); // subtract lunch break
  const required = isFullDay ? 480 : 240;             // 8h or 4h
  return Math.max(0, required - worked);
}

// Largest font size (down to 4.5 pt) at which `text` fits `maxWidth` in `font`.
function fitSize(text, font, maxWidth, maxSz = NAME_SIZE) {
  for (let sz = maxSz; sz >= 4.5; sz -= 0.25) {
    if (font.widthOfTextAtSize(text, sz) <= maxWidth) return sz;
  }
  return 4.5;
}

// Fills one page of the template with the employee's DTR data (both columns).
async function fillPage(pdf, page, employee, year, month, recordsByDay, font, bold) {
  const dowByDay = monthDayOfWeeks(year, month);
  const totalDays = dowByDay.length;

  // Total undertime for the month.
  let totalUT = 0;
  for (let d = 1; d <= totalDays; d++) {
    const rec = recordsByDay[d];
    if (rec?.timeIn) totalUT += undertimeMins(rec.timeIn, rec.timeOut);
  }
  const totalUTHrs = Math.floor(totalUT / 60);
  const totalUTMin = totalUT % 60;

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

      const { amArr, amDep, pmArr, pmDep } = dtrTimes(rec.timeIn, rec.timeOut);
      const ut = undertimeMins(rec.timeIn, rec.timeOut);

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
  }
}

// Public: loads the template bytes, fills both pages with the employee's data, and
// returns the bytes of the completed PDF ready for download.
export async function fillDTR(templateBytes, employee = {}, year, month, attendanceRecords = []) {
  const pdf = await PDFDocument.load(templateBytes);
  const pages = pdf.getPages();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Index records by day-of-month for quick lookup. An offline Time In that HR has not
  // approved (or rejected) is left out, and so is an offline Time Out waiting for HR.
  const recordsByDay = {};
  for (const rec of attendanceRecords) {
    if (!rec.date || !countsInDtr(rec)) continue;
    const date = new Date(`${rec.date}T00:00:00`);
    if (date.getFullYear() === year && date.getMonth() + 1 === month) {
      recordsByDay[date.getDate()] = { ...rec, timeOut: dtrTimeOut(rec) };
    }
  }

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
