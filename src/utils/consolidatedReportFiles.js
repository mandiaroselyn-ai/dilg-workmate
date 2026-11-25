import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

// The Consolidated Report of Attendance as DILG Marinduque's own Excel template
// (src/assets/template/consolidated-attendance-template.xlsx, made from the office's workbook)
// and as a page to print. The template has the letterhead and column headings in rows 1 to 18,
// and the certification, the Provincial Director's name, the number of personnel, and the
// office's motto from row 19 down; the employees' rows go in between. Every name on it comes
// from WorkMate's accounts: the template has none. The PD signs above his name: WorkMate puts
// no signature on it.

const FIRST_ROW = 19;
const TEMPLATE_LAST_ROW = 38;
const COLUMNS = [
  ['A', 'no'], ['B', 'name'], ['C', 'position'], ['D', 'station'], ['E', 'vl'],
  ['F', 'sl'], ['G', 'tardy'], ['H', 'undertime'], ['I', 'halfDay'], ['J', 'remarks']
];
// Column widths in the template, in characters, to know how many lines a cell takes.
const WIDTHS = { A: 5.7, B: 29.7, C: 28, D: 19.7, E: 12.9, F: 11.3, G: 9.7, H: 11, I: 11.3, J: 25.6 };
// The template's cell styles for an employee's row, and for the last row, which closes the table
// with a heavy line.
const ROW_STYLES = { A: 54, B: 55, C: 55, D: 55, E: 58, F: 58, G: 58, H: 58, I: 58, J: 59 };
const LAST_ROW_STYLES = { A: 49, B: 60, C: 60, D: 60, E: 62, F: 62, G: 62, H: 62, I: 62, J: 80 };

// The letterhead and the words of the template, for the printed page.
export const LETTERHEAD = ['Republic of the Philippines', 'DEPARTMENT OF THE INTERIOR AND LOCAL GOVERNMENT', 'MIMAROPA REGION', 'Province of Marinduque', 'Capitol Compund, Boac, Marinduque, 4900'];
export const REPORT_HEADING = 'CONSOLIDATED REPORT OF ATTENDANCE BASED ON CS FORM 48 AND COVERAGE OF FIELD OFFICERS';
export const CERTIFICATION = 'I hereby certify that the foregoing is a true report of attendance of all personnel assigned in this office/province based on CS Form 48 on file.';
const DIRECTOR_POSITION = 'Provincial Director';
const MOTTO = '“Matino, Mahusay at Maasahan”';
const TELEPHONE = 'Telephone Number (042) 754-58-81';

const xmlText = value => String(value ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// How many lines `text` takes in a cell of column `column`, wrapped.
const linesOf = (text, column) => {
  const perLine = Math.max(1, Math.floor(WIDTHS[column] * 0.85));
  return String(text ?? '').split('\n').reduce((lines, line) => lines + Math.max(1, Math.ceil(line.length / perLine)), 0);
};

const rowXml = (row, number, styles) => {
  const lines = Math.max(...COLUMNS.map(([column, key]) => linesOf(row[key], column)));
  const height = Math.max(24.75, lines * 15.75 + 6);
  const cells = COLUMNS.map(([column, key]) => {
    const ref = `${column}${number}`;
    const value = row[key];
    if (value === undefined || value === null || value === '') return `<c r="${ref}" s="${styles[column]}"/>`;
    if (typeof value === 'number') return `<c r="${ref}" s="${styles[column]}"><v>${value}</v></c>`;
    return `<c r="${ref}" s="${styles[column]}" t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
  });
  return `<row r="${number}" spans="1:10" ht="${height}" customHeight="1">${cells.join('')}</row>`;
};

// The sheet's name: "OCTOBER 2026".
const sheetName = monthLabel => String(monthLabel || 'Consolidated Report').toUpperCase().replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);

// The template (the .xlsx file's bytes) filled in with `report` (see buildReport), the number
// of vacant positions HR typed (`vacant`), and the Provincial Director's name (`director`, see
// provincialDirectorName; '' leaves it blank), as the bytes of a new .xlsx file.
export const fillConsolidatedXlsx = (template, report, { vacant = '', director = '' } = {}) => {
  const files = unzipSync(template);
  const rows = report.rows.length ? report.rows : [{}];
  const added = rows.length;
  const move = number => (Number(number) >= FIRST_ROW ? Number(number) + added : Number(number));

  let sheet = strFromU8(files['xl/worksheets/sheet1.xml'])
    .replace(/<row r="(\d+)"/g, (all, number) => `<row r="${move(number)}"`)
    .replace(/<c r="([A-Z]+)(\d+)"/g, (all, column, number) => `<c r="${column}${move(number)}"`)
    .replace(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/g, (all, c1, r1, c2, r2) => `<mergeCell ref="${c1}${move(r1)}:${c2}${move(r2)}"/>`)
    .replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A2:J${TEMPLATE_LAST_ROW + added}"/>`);
  const employees = rows.map((row, index) => rowXml(row, FIRST_ROW + index, index === rows.length - 1 ? LAST_ROW_STYLES : ROW_STYLES)).join('');
  const footerAt = sheet.indexOf(`<row r="${FIRST_ROW + added}"`);
  sheet = `${sheet.slice(0, footerAt)}${employees}${sheet.slice(footerAt)}`;

  const { personnel = 0, male = 0, female = 0 } = report.counts || {};
  const values = {
    MONTH: String(report.monthLabel || '').toUpperCase(),
    DIRECTOR: String(director || '').toUpperCase(),
    ORGANIC: personnel,
    FILLED: personnel,
    VACANT: vacant,
    MALE: male,
    FEMALE: female
  };
  sheet = sheet.replace(/\{\{([A-Z]+)\}\}/g, (all, key) => xmlText(values[key] ?? ''));
  files['xl/worksheets/sheet1.xml'] = strToU8(sheet);
  files['xl/workbook.xml'] = strToU8(strFromU8(files['xl/workbook.xml'])
    .replace('name="Consolidated Report"', `name="${xmlText(sheetName(report.monthLabel))}"`));
  return zipSync(files, { level: 6 });
};

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

// The report as a page to print on legal paper, laid out like the template. `logos` are the
// URLs of the DILG seal and the Bagong Pilipinas logo; `vacant` and `director` as for the
// Excel file.
export const consolidatedHtml = (report, { vacant = '', director = '', logos = [] } = {}) => {
  const { personnel = 0, male = 0, female = 0 } = report.counts || {};
  const cell = (value, className = '') => `<td${className ? ` class="${className}"` : ''}>${escapeHtml(value)}</td>`;
  const body = report.rows.length
    ? report.rows.map(row => `<tr>${cell(row.no, 'c')}${cell(row.name)}${cell(row.position)}${cell(row.station)}${cell(row.vl, 'c')}${cell(row.sl, 'c')}${cell(row.tardy, 'c')}${cell(row.undertime, 'c')}${cell(row.halfDay, 'c')}${cell(row.remarks)}</tr>`).join('')
    : '<tr><td colspan="10" class="c">No employees match these filters.</td></tr>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Consolidated Report of Attendance - ${escapeHtml(report.monthLabel)}</title>
<style>
  @page { size: legal landscape; margin: 12mm 15mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; margin: 0; }
  .logos { text-align: center; } .logos img { height: 70px; margin: 0 6px; }
  .letterhead { text-align: center; margin-top: 4px; } .letterhead p { margin: 0; font-size: 10pt; }
  .letterhead .b { font-weight: bold; font-size: 11pt; }
  h1 { font-size: 12pt; text-align: center; margin: 14px 0 10px; }
  .month { font-weight: bold; font-size: 12pt; margin: 6px 0 8px; }
  table { width: 100%; border-collapse: collapse; border: 2px solid #000; font-size: 10.5pt; }
  th, td { border: 1px solid #000; padding: 3px 5px; vertical-align: middle; white-space: pre-line; }
  th { font-weight: bold; text-align: center; }
  thead tr:last-child th { border-bottom: 2px solid #000; }
  .c { text-align: center; }
  .certify { text-align: center; font-size: 11pt; margin: 18px 0 0; }
  .sign { margin: 48px 0 0 64%; font-size: 12pt; } .sign b { display: block; }
  .counts { font-weight: bold; font-size: 11pt; margin-top: 18px; } .counts p { margin: 2px 0; }
  .footer { text-align: center; font-weight: bold; font-size: 11pt; margin-top: 18px; } .footer p { margin: 0; }
  tr { break-inside: avoid; }
</style></head><body>
<div class="logos">${logos.map(src => `<img src="${escapeHtml(src)}" alt="">`).join('')}</div>
<div class="letterhead">${LETTERHEAD.map((line, index) => `<p${index === 1 || index === 2 ? ' class="b"' : ''}>${escapeHtml(line)}</p>`).join('')}</div>
<h1>${escapeHtml(REPORT_HEADING)}</h1>
<p class="month">Month/Year : ${escapeHtml(String(report.monthLabel || '').toUpperCase())}</p>
<table>
<thead>
<tr><th rowspan="2">NO</th><th rowspan="2">NAME</th><th rowspan="2">POSITION/DESIGNATION</th><th rowspan="2">STATION</th><th colspan="2">LEAVE OF ABSENCE</th><th rowspan="2">TARDY</th><th rowspan="2">UNDER TIME</th><th rowspan="2">HALF DAY</th><th rowspan="2">REMARKS</th></tr>
<tr><th>VL</th><th>SL</th></tr>
</thead>
<tbody>${body}</tbody>
</table>
<p class="certify">${escapeHtml(CERTIFICATION)}</p>
<div class="sign"><b>${escapeHtml(String(director || '').toUpperCase()) || '&nbsp;'}</b>${escapeHtml(DIRECTOR_POSITION)}</div>
<div class="counts">
<p>No. organic personnel : ${personnel}</p>
<p>No. of Filled Positions: ${personnel}</p>
<p>No. of Vacant Positions: ${escapeHtml(vacant)}</p>
<p>No. of Male Employees: ${male}</p>
<p>No. of Female Employees: ${female}</p>
</div>
<div class="footer"><p>${escapeHtml(MOTTO)}</p><p>${escapeHtml(TELEPHONE)}</p></div>
</body></html>`;
};
