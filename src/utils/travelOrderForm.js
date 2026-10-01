import { PDFArray, PDFDocument, PDFName, PDFRef, StandardFonts, decodePDFRawStream, rgb } from 'pdf-lib';
import { drawGrid } from './leaveForm.js';

// Makes the Provincial Order (travel order) for one travel request, laid out like the
// Provincial Director's own orders: the answers are written in bold into the text, a long
// subject runs onto more lines, and everything under it (the date, the paragraph, and the
// Director's signature) moves down to make room. The page is src/assets/template/travelorder-template.pdf:
// its letterhead and footer stay, its signature is moved, and its fixed text is replaced.
// Every position is in PDF points from the bottom-left corner of the A4 page (595.5 x 842),
// measured from the template and from a signed order. To check a change, run
// `node scripts/preview-travel-order.mjs --grid` and open the PDF it writes.

const black = rgb(0, 0, 0);
const SIZE = 12;
// The Director's orders set the subject a little smaller than the rest.
const SUBJECT_SIZE = 11.5;
// Shown where an answer is missing.
const BLANK = '____________';

export const TRAVEL_ORDER_LAYOUT = {
  // Parts of the template kept as they are: the letterhead down to "PROVINCIAL ORDER"
  // (from `headerFrom` up) and the motto and telephone number (up to `footerTo`).
  headerFrom: 603.5,
  footerTo: 60,
  // The Director's signature, name, and title (between `bottom` and `top`), which sit
  // under "For your compliance and appropriate action." (baseline `compliance` on the
  // template) and move with it.
  signature: { bottom: 305, top: 372, compliance: 376.7 },
  // Text columns: labels, their colons, the answers, and the right margin.
  left: 72,
  colon: 144,
  value: 180.1,
  right: 523.6,
  // Baselines of "NO." and "TO"; the rows under them follow from the gaps below.
  orderNo: 592.4,
  to: 564.8,
  valueLineGap: 13.2, // between the lines of a long subject
  rowGap: 27.6, // from a row's last line to the next row
  ruleGap: 23.8, // from DATE to the "=====" line
  paragraphGap: 23.9, // from the "=====" line to the paragraph
  lineGap: 13.8, // between the paragraph's lines
  complianceGap: 23.8 // from the paragraph to "For your compliance..."
};

const toDate = value => {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};
const longDate = date => date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const weekdayOf = date => date.toLocaleDateString('en-US', { weekday: 'long' });

// The activity's date or dates, such as "October 5, 2026", "October 5-7, 2026", or
// "September 30 - October 2, 2026".
export const activityDates = (startValue, endValue) => {
  const start = toDate(startValue);
  if (!start) return '';
  const end = toDate(endValue);
  if (!end || end.getTime() === start.getTime()) return longDate(start);
  const month = date => date.toLocaleDateString('en-US', { month: 'long' });
  if (start.getFullYear() !== end.getFullYear()) return `${longDate(start)} - ${longDate(end)}`;
  if (start.getMonth() !== end.getMonth()) return `${month(start)} ${start.getDate()} - ${month(end)} ${end.getDate()}, ${end.getFullYear()}`;
  return `${month(start)} ${start.getDate()}-${end.getDate()}, ${end.getFullYear()}`;
};

// The day or days of the week, such as "Monday" or "Monday - Wednesday".
export const activityWeekdays = (startValue, endValue) => {
  const start = toDate(startValue);
  if (!start) return '';
  const end = toDate(endValue);
  return end && end.getTime() !== start.getTime() ? `${weekdayOf(start)} - ${weekdayOf(end)}` : weekdayOf(start);
};

// The activity time written the way the orders write it: "8:00 AM - 5:00 PM" becomes
// "8:00 a.m. to 5:00 p.m."; anything else is kept as typed.
export const formatTravelTime = value => String(value || '').trim()
  .replace(/\b(\d{1,2}(?::\d{2})?)\s*([ap])\.?\s*m\b\.?/gi, (_, time, half) => `${time} ${half.toLowerCase()}.m.`)
  .replace(/(m\.)\s*[-–]\s*(?=\d)/g, '$1 to ');

// Who the order is for, such as "LGOO II JUAN A. DELA CRUZ". A generic role is left out.
export const travelOrderAddressee = (person = {}, request = {}) => {
  const name = String(person.name || request.employeeName || '').trim();
  const role = String(person.role || person.position || '').trim();
  const shownRole = ['employee', 'dilg personnel'].includes(role.toLowerCase()) ? '' : role;
  return [shownRole, name].filter(Boolean).join(' ').toUpperCase();
};

// The order number: the one recorded on the request, or the year it was filed and the last
// three digits of the request ID (for example "2026-042").
export const travelOrderNumber = (request = {}) => {
  if (request.orderNo) return String(request.orderNo);
  const digits = String(request.id || '').replace(/\D/g, '');
  if (!digits) return '';
  const filed = toDate(request.submissionDate || request.createdAt) || new Date();
  return `${filed.getFullYear()}-${digits.slice(-3).padStart(3, '0')}`;
};

// What the activity is: the travel subject, or the purpose without its "Official Travel." prefix.
export const travelSubject = (request = {}) => String(request.travelActivity || request.purpose || '')
  .replace(/^Official Travel\.\s*/i, '')
  .trim();

export async function fillTravelOrder(templateBytes, request = {}, person = {}, { grid = false } = {}) {
  const pdf = await PDFDocument.load(templateBytes);
  const page = pdf.getPages()[0];
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const L = TRAVEL_ORDER_LAYOUT;

  // The PDF's standard fonts cannot write every character (an arrow or an emoji, say);
  // those become "?" so the order is still produced.
  const printableAsIs = (value, font) => [...String(value ?? '')].map(character => {
    try {
      font.widthOfTextAtSize(character, SIZE);
      return character;
    } catch {
      return '?';
    }
  }).join('');
  const printable = (value, font) => printableAsIs(value, font).trim();

  // Everything the order writes, laid out first: the signature's new place depends on how
  // long the subject and the paragraph turn out.
  const texts = [];
  const put = (text, x, y, font = bold, size = SIZE) => texts.push({ text, x, y, font, size });

  // A row such as "SUBJECT : ...": the answer wraps within its column, and the next row
  // starts rowGap under its last line.
  const row = (label, value, y, size = SIZE) => {
    put(label, L.left, y);
    put(':', L.colon, y);
    const lines = wrapWords(printable(value, bold), bold, L.right - L.value, size);
    lines.forEach((line, index) => put(line, L.value, y - index * L.valueLineGap, bold, size));
    return y - (Math.max(lines.length, 1) - 1) * L.valueLineGap - L.rowGap;
  };

  put(`NO. ${printable(travelOrderNumber(request), bold) || BLANK}`, L.left, L.orderNo);
  let y = row('TO', travelOrderAddressee(person, request), L.to);
  y = row('SUBJECT', travelSubject(request).toUpperCase(), y, SUBJECT_SIZE);
  const filed = toDate(request.submissionDate || request.createdAt);
  const dateY = y;
  row('DATE', filed ? longDate(filed) : '', dateY);

  const ruleY = dateY - L.ruleGap;
  put('================================================================', L.left, ruleY, regular);

  // The paragraph, justified between the margins, with the answers in bold.
  const dates = activityDates(request.startDate, request.endDate);
  const weekdays = activityWeekdays(request.startDate, request.endDate);
  const time = formatTravelTime(request.travelTime);
  const venue = String(request.travelVenue || (request.detailsSpecify && request.detailsSpecify !== 'N/A' ? request.detailsSpecify : '')).trim();
  const paragraph = [
    ['In the exigency of public service so requiring, the above mentioned personnel is hereby directed to attend the above-mentioned activity on ', regular],
    [dates ? `${dates}${weekdays ? ` (${weekdays})` : ''}` : BLANK, bold],
    [', from ', regular],
    [`${time || BLANK},`, bold],
    [' at the ', regular],
    [venue ? (/[.!?]$/.test(venue) ? venue : `${venue}.`) : `${BLANK}.`, bold]
  ].map(([text, font]) => [printableAsIs(text, font), font]);
  let lineY = ruleY - L.paragraphGap;
  justifyLines(paragraph, regular, L.right - L.left).forEach((line, index) => {
    if (index) lineY -= L.lineGap;
    line.forEach(({ text, font, x }) => put(text, L.left + x, lineY, font));
  });

  const complianceY = lineY - L.complianceGap;
  put('For your compliance and appropriate action.', L.left, complianceY, regular);

  // The template's own content: its letterhead and footer, and its signature moved down
  // under the new "For your compliance..." line. Then the order's text over it.
  const { base, signature } = splitTemplateContent(pdf, page);
  const dy = L.signature.compliance - complianceY;
  replaceContents(pdf, page, [
    base,
    `q\r1 0 0 1 0 ${(-dy).toFixed(2)} cm\rq\r1 0 0 -1 0 ${page.getHeight()} cm\r${signature}\rQ\rQ`
  ]);
  for (const { text, x, y: textY, font, size } of texts) page.drawText(text, { x, y: textY, size, font, color: black });

  if (grid) drawGrid(page, regular);
  return pdf.save();
}

const bytesToText = bytes => {
  let text = '';
  for (let index = 0; index < bytes.length; index += 8192) text += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return text;
};
const textToBytes = text => Uint8Array.from(text, character => character.charCodeAt(0));

// The content streams of `page`, and their references (to remove them when replaced).
const pageContents = (pdf, page) => {
  const entry = page.node.get(PDFName.of('Contents'));
  const refs = entry instanceof PDFArray ? entry.asArray() : [entry];
  return refs.map(ref => ({ ref: ref instanceof PDFRef ? ref : null, stream: pdf.context.lookup(ref) }));
};

// The template's page content, split up: `base` keeps the letterhead and footer, and
// `signature` holds the Director's signature, name, and title. Everything else the template
// writes (the labels, the paragraph with its blanks, "For your compliance...") is dropped,
// because the order writes it. The template draws with y measured from the top of the page
// (it starts with "1 0 0 -1 0 842 cm"), so its y is the page height minus a page y. Each of
// its texts is a "BT ... Tm ... ET" block placed by its Tm, each line an "x y m", "x y l",
// "S" sequence, and each image a "q ... cm" line followed by "/Name Do Q".
function splitTemplateContent(pdf, page) {
  const height = page.getHeight();
  const lines = pageContents(pdf, page)
    .flatMap(({ stream }) => bytesToText(decodePDFRawStream(stream).decode()).split(/\r\n|\r|\n/));
  const { headerFrom, footerTo, signature } = TRAVEL_ORDER_LAYOUT;
  const partAt = pageY => (pageY >= headerFrom || pageY <= footerTo ? 'base'
    : pageY >= signature.bottom && pageY <= signature.top ? 'signature' : 'drop');
  const base = [];
  const moved = [];
  const place = (part, block) => {
    if (part === 'base') base.push(...block);
    if (part === 'signature') moved.push(...block);
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const textEnd = line === 'BT' ? lines.indexOf('ET', index) : -1;
    if (textEnd > index) {
      const block = lines.slice(index, textEnd + 1);
      const tm = block.find(item => item.endsWith(' Tm'));
      const part = tm ? partAt(height - Number(tm.split(' ').at(-2))) : 'base';
      place(part, part === 'signature' ? ['q', ...block, 'Q'] : block);
      index = textEnd;
      continue;
    }
    const move = /^(\S+) (\S+) m$/.exec(line);
    const strokeEnd = move ? lines.indexOf('S', index) : -1;
    if (strokeEnd > index) {
      const part = partAt(height - Number(move[2]));
      if (part === 'base') base.push(...lines.slice(index, strokeEnd + 1));
      index = strokeEnd;
      continue;
    }
    const image = /^q (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) cm$/.exec(line);
    if (image && /^\/\S+ Do Q$/.test(lines[index + 1] || '')) {
      const top = Number(image[6]);
      place(partAt(height - Math.max(top, top + Number(image[4]))), [line, lines[index + 1]]);
      index += 1;
      continue;
    }
    base.push(line);
  }
  return { base: base.join('\r'), signature: moved.join('\r') };
}

// Replaces the page's content streams with new ones, removing the old streams from the file.
function replaceContents(pdf, page, texts) {
  for (const { ref } of pageContents(pdf, page)) if (ref) pdf.context.delete(ref);
  const refs = texts.map(text => pdf.context.register(pdf.context.flateStream(textToBytes(text))));
  page.node.set(PDFName.of('Contents'), pdf.context.obj(refs));
}

// The words of `text` in lines no wider than `width` at `size`.
function wrapWords(text, font, width, size) {
  const lines = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const joined = lines.length ? `${lines.at(-1)} ${word}` : word;
    if (lines.length && font.widthOfTextAtSize(joined, size) <= width) lines[lines.length - 1] = joined;
    else lines.push(word);
  }
  return lines;
}

// Lays out runs of [text, font] as justified lines no wider than `width`: every line but the
// last is spread to the full width. Text that touches across runs (such as a bold date and
// the comma after it) stays together. Returns each line's pieces with their x positions.
function justifyLines(runs, spaceFont, width) {
  // Words, each made of the pieces of runs between spaces.
  const words = [];
  let joinNext = false;
  for (const [text, font] of runs) {
    text.split(' ').forEach((part, index) => {
      if (index > 0) joinNext = false;
      if (!part) return;
      const piece = { text: part, font, width: font.widthOfTextAtSize(part, SIZE) };
      if (joinNext && words.length) words.at(-1).push(piece);
      else words.push([piece]);
      joinNext = true;
    });
    if (text.endsWith(' ')) joinNext = false;
  }
  const wordWidth = word => word.reduce((sum, piece) => sum + piece.width, 0);
  const space = spaceFont.widthOfTextAtSize(' ', SIZE);

  const lines = [];
  for (const word of words) {
    const line = lines.at(-1);
    const used = line ? line.reduce((sum, item) => sum + wordWidth(item), 0) + space * line.length : 0;
    if (line && used + wordWidth(word) <= width) line.push(word);
    else lines.push([word]);
  }
  return lines.map((line, index) => {
    const natural = line.reduce((sum, word) => sum + wordWidth(word), 0);
    const gap = index < lines.length - 1 && line.length > 1 ? (width - natural) / (line.length - 1) : space;
    let x = 0;
    return line.flatMap(word => {
      const pieces = word.map(piece => {
        const placed = { text: piece.text, font: piece.font, x };
        x += piece.width;
        return placed;
      });
      x += gap;
      return pieces;
    });
  });
}
