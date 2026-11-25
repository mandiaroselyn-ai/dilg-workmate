import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { CERTIFICATION, LETTERHEAD, REPORT_HEADING } from './consolidatedReportFiles.js';

// The Consolidated Report of Attendance as a PDF, laid out like DILG Marinduque's template, for the
// Provincial Director to certify and sign in WorkMate with the month's DTR report (see
// shared/dtrReport.js). HR sends it unsigned; the PD's signature goes above the PD's name, the
// only signature on it.

const PAGE = [1008, 612]; // Legal, landscape
const MARGIN = { x: 36, top: 28, bottom: 30 };
const WIDTH = PAGE[0] - MARGIN.x * 2;
const SIZE = 8.5;
const LINE = 10.5;
const HEADER_ROWS = [17, 15];
// The columns: their title, width, and whether their text is centered.
const COLUMNS = [
  { key: 'no', title: 'NO', width: 28, center: true },
  { key: 'name', title: 'NAME', width: 150 },
  { key: 'position', title: 'POSITION/DESIGNATION', width: 140 },
  { key: 'station', title: 'STATION', width: 100 },
  { key: 'vl', title: 'VL', width: 70, center: true, leave: true },
  { key: 'sl', title: 'SL', width: 70, center: true, leave: true },
  { key: 'tardy', title: 'TARDY', width: 105, center: true },
  { key: 'undertime', title: 'UNDER TIME', width: 105, center: true },
  { key: 'halfDay', title: 'HALF DAY', width: 60, center: true },
  { key: 'remarks', title: 'REMARKS', width: 108 }
];
// The columns fill the page between the margins.
if (COLUMNS.reduce((total, column) => total + column.width, 0) !== PAGE[0] - MARGIN.x * 2) throw new Error('The report\'s columns do not fill the page.');
// The signature block: the PD signs above the name, at the right, as on the template.
const SIGN_CENTER = 790;
// The room the certification, the PD's name, the counts, and the motto take below the table.
const FOOTER_HEIGHT = 205;

const ink = rgb(0, 0, 0);

// Text the PDF's standard fonts can write (Latin-1); any other character becomes "?".
const writable = value => [...String(value ?? '')].map(character => {
  if (character === '“' || character === '”') return '"';
  if (character === '‘' || character === '’') return "'";
  const code = character.charCodeAt(0);
  return (code >= 32 && code <= 126) || (code >= 160 && code <= 255) ? character : '?';
}).join('');

// `text` in lines that fit `width`: its own lines first, then wrapped at spaces.
const wrap = (font, text, size, width) => String(text ?? '').split('\n').flatMap(paragraph => {
  const lines = [];
  let line = '';
  for (const word of writable(paragraph).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    while (line.length > 1 && font.widthOfTextAtSize(line, size) > width) {
      let cut = line.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut -= 1;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  lines.push(line);
  return lines;
});

const centered = (page, font, text, size, center, y) => {
  const shown = writable(text);
  page.drawText(shown, { x: center - font.widthOfTextAtSize(shown, size) / 2, y, size, font, color: ink });
};

export const consolidatedPdfFilename = month => `Consolidated_Report_of_Attendance_${month}.pdf`;

// The report as PDF bytes, with the index of its last page and where the PD signs on it (`marks`,
// see utils/digitalIdSigning.js). `consolidated` is what HR sent: { director, vacant, counts,
// rows } (see the DTR report's `consolidated`); `monthLabel` is "October 2026"; `logos` are the
// PNG bytes of the DILG seal and the Bagong Pilipinas logo.
export const fillConsolidatedPdf = async ({ monthLabel, consolidated = {}, logos = [] }) => {
  const { director = '', vacant = '', counts = {}, rows = [] } = consolidated;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Consolidated Report of Attendance - ${monthLabel}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const images = [];
  for (const bytes of logos) {
    if (bytes?.length) images.push(await pdf.embedPng(bytes));
  }
  const month = `Month/Year : ${String(monthLabel || '').toUpperCase()}`;

  const tableHeader = (page, top) => {
    let x = MARGIN.x;
    const [first, second] = HEADER_ROWS;
    const bottom = top - first - second;
    for (const column of COLUMNS) {
      if (column.key === 'vl') {
        // "LEAVE OF ABSENCE" over VL and SL.
        const both = COLUMNS.filter(item => item.leave).reduce((total, item) => total + item.width, 0);
        page.drawRectangle({ x, y: top - first, width: both, height: first, borderColor: ink, borderWidth: 0.6 });
        centered(page, bold, 'LEAVE OF ABSENCE', 7.5, x + both / 2, top - first + 5.5);
      }
      if (column.leave) {
        page.drawRectangle({ x, y: bottom, width: column.width, height: second, borderColor: ink, borderWidth: 0.6 });
        centered(page, bold, column.title, 7.5, x + column.width / 2, bottom + 4.5);
      } else {
        page.drawRectangle({ x, y: bottom, width: column.width, height: first + second, borderColor: ink, borderWidth: 0.6 });
        const lines = wrap(bold, column.title, 7.5, column.width - 4);
        lines.forEach((line, index) => centered(page, bold, line, 7.5, x + column.width / 2, bottom + (first + second) / 2 + (lines.length / 2 - index - 1) * 9 + 2.5));
      }
      x += column.width;
    }
    page.drawLine({ start: { x: MARGIN.x, y: bottom }, end: { x: MARGIN.x + WIDTH, y: bottom }, thickness: 1.4, color: ink });
    return bottom;
  };

  // A new page: the letterhead on the first, the month on the others; then the table's headings.
  const newPage = (first, withTable = true) => {
    const page = pdf.addPage(PAGE);
    let y = PAGE[1] - MARGIN.top;
    if (first) {
      if (images.length) {
        const height = 52;
        const widths = images.map(image => image.width * (height / image.height));
        let x = PAGE[0] / 2 - (widths.reduce((total, width) => total + width, 0) + 10 * (images.length - 1)) / 2;
        images.forEach((image, index) => {
          page.drawImage(image, { x, y: y - height, width: widths[index], height });
          x += widths[index] + 10;
        });
        y -= height + 12;
      }
      LETTERHEAD.forEach((line, index) => {
        const strong = index === 1 || index === 2;
        centered(page, strong ? bold : font, line, strong ? 10 : 9, PAGE[0] / 2, y);
        y -= 11.5;
      });
      y -= 8;
      centered(page, bold, REPORT_HEADING, 11, PAGE[0] / 2, y);
      y -= 20;
    }
    page.drawText(writable(first ? month : `${month} (continued)`), { x: MARGIN.x, y, size: 10.5, font: bold, color: ink });
    y -= 10;
    return { page, y: withTable ? tableHeader(page, y) : y };
  };

  let { page, y } = newPage(true);
  const shown = rows.length ? rows : [{ name: 'No employees are listed.' }];
  for (const row of shown) {
    const cells = COLUMNS.map(column => wrap(font, row[column.key] ?? '', SIZE, column.width - 6));
    const height = Math.max(20, Math.max(...cells.map(lines => lines.length)) * LINE + 8);
    if (y - height < MARGIN.bottom) ({ page, y } = newPage(false));
    let x = MARGIN.x;
    COLUMNS.forEach((column, index) => {
      page.drawRectangle({ x, y: y - height, width: column.width, height, borderColor: ink, borderWidth: 0.5 });
      const lines = cells[index];
      const top = y - (height - lines.length * LINE) / 2 - SIZE;
      lines.forEach((line, number) => {
        const lineY = top - number * LINE + 1;
        if (column.center) centered(page, font, line, SIZE, x + column.width / 2, lineY);
        else page.drawText(line, { x: x + 3, y: lineY, size: SIZE, font, color: ink });
      });
      x += column.width;
    });
    y -= height;
  }
  page.drawLine({ start: { x: MARGIN.x, y }, end: { x: MARGIN.x + WIDTH, y }, thickness: 1.4, color: ink });

  // The certification, the PD's name, the counts, and the motto, on a page of their own when
  // there is no room left under the table.
  if (y - FOOTER_HEIGHT < MARGIN.bottom) ({ page, y } = newPage(false, false));
  let line = y - 22;
  centered(page, font, CERTIFICATION, 9.5, PAGE[0] / 2, line);
  const nameY = line - 60;
  const signature = { type: 'signature', center: SIGN_CENTER, bottom: nameY + 11, width: 190, height: 40 };
  if (director) centered(page, bold, director.toUpperCase(), 10.5, SIGN_CENTER, nameY);
  centered(page, font, 'Provincial Director', 9.5, SIGN_CENTER, nameY - 12);
  line = nameY - 32;
  for (const text of [
    `No. organic personnel : ${counts.personnel ?? 0}`,
    `No. of Filled Positions: ${counts.personnel ?? 0}`,
    `No. of Vacant Positions: ${vacant}`,
    `No. of Male Employees: ${counts.male ?? 0}`,
    `No. of Female Employees: ${counts.female ?? 0}`
  ]) {
    page.drawText(writable(text), { x: MARGIN.x, y: line, size: 9.5, font: bold, color: ink });
    line -= 12;
  }
  line -= 10;
  centered(page, bold, '"Matino, Mahusay at Maasahan"', 9.5, PAGE[0] / 2, line);
  centered(page, bold, 'Telephone Number (042) 754-58-81', 9.5, PAGE[0] / 2, line - 12);

  return {
    bytes: await pdf.save({ useObjectStreams: false }),
    pageIndex: pdf.getPageCount() - 1,
    // With no Provincial Director's account to name, the signer's own name goes under the signature.
    marks: director ? [signature] : [signature, { type: 'text', text: '{name}', center: SIGN_CENTER, y: nameY, size: 10.5, maxWidth: 260 }]
  };
};
