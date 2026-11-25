import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// The cover of a month's DTR report (see shared/dtrReport.js): the list of the office's employees
// with whether their DTR (CSC Form No. 48), signed by them, is attached, then "Approved by" (the
// Provincial Director). HR sends it unsigned; the PD's signature is its only one, in a fixed box
// on the last page.

const PAGE = [595.28, 841.89]; // A4
const MARGIN = 48;
const ROW = 15;
const TOP = PAGE[1] - MARGIN;
// The signature area at the bottom of the last page, and where the table must stop above it.
const SIGNATURE_AREA_TOP = 190;
const APPROVED = { label: 'Approved by:', x: 322, center: 430 };
const BOX = { bottom: 128, width: 160, height: 34 };
const NAME_Y = 118;
const POSITION_Y = 107;
const DATE_Y = 96;

// The columns: their title, left edge, and width.
const COLUMNS = [
  { key: 'no', title: 'No.', x: MARGIN, width: 24 },
  { key: 'name', title: 'Name of Employee', x: MARGIN + 24, width: 150 },
  { key: 'position', title: 'Position', x: MARGIN + 174, width: 108 },
  { key: 'office', title: 'Office / Station', x: MARGIN + 282, width: 118 },
  { key: 'dtr', title: 'DTR (CSC Form No. 48)', x: MARGIN + 400, width: 99 }
];

// Text the PDF's standard font can write: it has only the Latin-1 characters, so any other
// character (such as an emoji) becomes "?".
const writable = value => [...String(value ?? '')].map(character => {
  const code = character.charCodeAt(0);
  return (code >= 32 && code <= 126) || (code >= 160 && code <= 255) ? character : '?';
}).join('');
// `text` cut to fit `width` at `size`, ending in "..." when cut.
const fit = (font, text, size, width) => {
  const full = writable(text);
  if (font.widthOfTextAtSize(full, size) <= width - 4) return full;
  let shown = full;
  while (shown && font.widthOfTextAtSize(`${shown}...`, size) > width - 4) shown = shown.slice(0, -1);
  return `${shown.trimEnd()}...`;
};
const monthText = month => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// Where the PD's signature shows on the last page (see utils/digitalIdSigning.js), with their name
// and the date of signing written by the signature itself.
export const dtrReportMarks = () => [
  { type: 'signature', center: APPROVED.center, bottom: BOX.bottom, width: BOX.width, height: BOX.height },
  { type: 'text', text: '{name}', center: APPROVED.center, y: NAME_Y, size: 9, maxWidth: 200 },
  { type: 'text', text: 'Date: {date}', center: APPROVED.center, y: DATE_Y, size: 7.5, maxWidth: 200 }
];

// The cover as PDF bytes, with the index of its last page (where the PD signs):
// { month (YYYY-MM), rows: [{ name, position, office, dtr }] }. `dtr` is what the row's last
// column says ("Attached", "Not submitted"...).
export const fillDtrReport = async ({ month, rows = [] }) => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0, 0, 0);
  const grey = rgb(0.4, 0.4, 0.4);
  pdf.setTitle(`Monthly DTR Report - ${monthText(month)}`);
  pdf.setAuthor('DILG Marinduque Provincial Office');

  const centered = (page, text, y, size, face = font) => {
    const shown = writable(text);
    page.drawText(shown, { x: (PAGE[0] - face.widthOfTextAtSize(shown, size)) / 2, y, size, font: face, color: ink });
  };
  const tableHeader = (page, y) => {
    page.drawRectangle({ x: MARGIN, y: y - 4, width: PAGE[0] - MARGIN * 2, height: ROW, color: rgb(0.92, 0.92, 0.92) });
    for (const column of COLUMNS) page.drawText(column.title, { x: column.x + 2, y, size: 7.5, font: bold, color: ink });
    return y - ROW;
  };
  // A new page: the first with the heading; others continue the table, or (header false) hold
  // only what comes after it.
  const newPage = (first, header = true) => {
    const page = pdf.addPage(PAGE);
    let y = TOP;
    if (first) {
      centered(page, 'Republic of the Philippines', y, 9);
      centered(page, 'DEPARTMENT OF THE INTERIOR AND LOCAL GOVERNMENT', y - 13, 10, bold);
      centered(page, 'MIMAROPA Region', y - 26, 9);
      centered(page, 'Provincial Office of Marinduque', y - 38, 9);
      centered(page, 'MONTHLY REPORT ON THE DAILY TIME RECORDS', y - 70, 12, bold);
      centered(page, `For the month of ${monthText(month)}`, y - 86, 10);
      const note = 'Attached are the Daily Time Records (CSC Form No. 48) of the personnel below, each signed by the employee and verified by the In-charge as to the prescribed office hours.';
      let line = '';
      let lineY = y - 110;
      for (const word of note.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, 8.5) > PAGE[0] - MARGIN * 2) {
          page.drawText(line, { x: MARGIN, y: lineY, size: 8.5, font, color: ink });
          line = word;
          lineY -= 11;
        } else {
          line = next;
        }
      }
      if (line) page.drawText(line, { x: MARGIN, y: lineY, size: 8.5, font, color: ink });
      y = lineY - 20;
    }
    return { page, y: header ? tableHeader(page, y) : y };
  };

  let { page, y } = newPage(true);
  rows.forEach((row, index) => {
    // A row goes on the next page when it would run into the bottom margin.
    if (y < MARGIN + ROW) ({ page, y } = newPage(false));
    const cells = { no: String(index + 1), name: row.name, position: row.position, office: row.office, dtr: row.dtr };
    for (const column of COLUMNS) {
      page.drawText(fit(font, cells[column.key] || '', 7.5, column.width), { x: column.x + 2, y, size: 7.5, font, color: ink });
    }
    page.drawLine({ start: { x: MARGIN, y: y - 4 }, end: { x: PAGE[0] - MARGIN, y: y - 4 }, thickness: 0.3, color: grey });
    y -= ROW;
  });
  if (!rows.length) {
    page.drawText('No employee in service this month.', { x: MARGIN + 2, y, size: 8, font, color: grey });
    y -= ROW;
  }
  const attached = rows.filter(row => /^attached/i.test(row.dtr || '')).length;
  // The count and the signature go below the table, on a page of their own when there is no room
  // left above the signature area.
  if (y - 6 < SIGNATURE_AREA_TOP) ({ page, y } = newPage(false, false));
  page.drawText(writable(`DTRs attached: ${attached} of ${rows.length} employee${rows.length === 1 ? '' : 's'}.`), { x: MARGIN, y: y - 6, size: 8.5, font: bold, color: ink });
  page.drawText(APPROVED.label, { x: APPROVED.x, y: BOX.bottom + BOX.height + 10, size: 8.5, font, color: ink });
  const position = 'Provincial Director';
  page.drawText(position, { x: APPROVED.center - font.widthOfTextAtSize(position, 8) / 2, y: POSITION_Y, size: 8, font, color: ink });

  return { bytes: await pdf.save({ useObjectStreams: false }), pageIndex: pdf.getPageCount() - 1 };
};

export const dtrReportFilename = month => `DTR_Report_${month}.pdf`;
