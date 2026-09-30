import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { drawGrid } from './leaveForm.js';

// Fills the Provincial Order (travel order) template (src/assets/travelorder-template.pdf)
// for one travel request. Every position below is in PDF points measured from the
// bottom-left corner of the template's page (595.5 x 842, A4), and was taken from the
// template's own labels and underlines. To move an answer, change its numbers here, then
// run `node scripts/preview-travel-order.mjs --grid` and open the PDF it writes to check.

const black = rgb(0, 0, 0);
// The template's own text size; an answer shrinks (down to 7 pt) only when it does not fit.
const ANSWER_SIZE = 12;
const MIN_ANSWER_SIZE = 7;
// The template's line spacing at 12 pt.
const LINE_GAP = 1.8;

export const TRAVEL_ORDER_LAYOUT = {
  // Centred on the line after "NO.".
  orderNo: { x: 96.6, lineEnd: 163.3, y: 592.4 },
  // After the colons of TO, SUBJECT, and DATE (the colons end at x 148), up to the right
  // margin of the paragraph. A long subject continues on the line below.
  to: { x: 162, y: 564.8, maxWidth: 361.6 },
  subject: { x: 162, y: 537.1, maxWidth: 361.6, lines: 2 },
  date: { x: 162, y: 509.6, maxWidth: 361.6 },
  // The paragraph's blanks: each answer sits on its underline (baselines are 1.6 pt above
  // the lines), centred except the venue, which fills "at the ___" and then the next line.
  activityDate: { x: 380.9, lineEnd: 523.6, y: 448.1 },
  weekday: { x: 74.8, lineEnd: 164.8, y: 424.4 },
  time: { x: 202.8, lineEnd: 322.8, y: 424.4 },
  venue: [
    { x: 362.9, lineEnd: 522.8, y: 424.4 },
    { x: 72, lineEnd: 295.3, y: 400.5 }
  ]
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

  // The largest size at which `text` fits `width`.
  const sizeToFit = (text, font, width) => {
    for (let size = ANSWER_SIZE; size > MIN_ANSWER_SIZE; size -= 0.25) {
      if (font.widthOfTextAtSize(text, size) <= width) return size;
    }
    return MIN_ANSWER_SIZE;
  };
  const draw = (text, x, y, size, font) => page.drawText(text, { x, y, size, font, color: black });
  // The PDF's standard fonts cannot write every character (an arrow or an emoji, say);
  // those become "?" so the order is still produced.
  const printable = (value, font) => [...String(value ?? '').trim()].map(character => {
    try {
      font.widthOfTextAtSize(character, ANSWER_SIZE);
      return character;
    } catch {
      return '?';
    }
  }).join('');

  // An answer after a label: on one line, or wrapped downwards onto up to `lines` lines.
  const writeField = (value, { x, y, maxWidth, lines: maxLines = 1 }, font = bold) => {
    const text = printable(value, font);
    if (!text) return;
    for (let size = ANSWER_SIZE; size >= MIN_ANSWER_SIZE; size -= 0.25) {
      const lines = wrap(text, font, size, maxWidth);
      if (lines.length <= maxLines || size === MIN_ANSWER_SIZE) {
        lines.slice(0, maxLines).forEach((line, index) => draw(line, x, y - index * (size + LINE_GAP), size, font));
        return;
      }
    }
  };

  // An answer centred on one underline.
  const writeOnBlank = (value, { x, lineEnd, y }, font = regular) => {
    const text = printable(value, font);
    if (!text) return;
    const width = lineEnd - x;
    const size = sizeToFit(text, font, width - 4);
    draw(text, x + (width - font.widthOfTextAtSize(text, size)) / 2, y, size, font);
  };

  // An answer that fills one underline and continues on the next, at the largest size at
  // which it fits both.
  const writeAcrossBlanks = (value, blanks, font = regular) => {
    const words = printable(value, font).split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const widths = blanks.map(blank => blank.lineEnd - blank.x - 4);
    for (let size = ANSWER_SIZE; size >= MIN_ANSWER_SIZE; size -= 0.25) {
      const lines = [];
      let index = 0;
      for (const width of widths) {
        let line = '';
        while (index < words.length) {
          const joined = line ? `${line} ${words[index]}` : words[index];
          if (font.widthOfTextAtSize(joined, size) > width) break;
          line = joined;
          index += 1;
        }
        lines.push(line);
      }
      if (index === words.length || size === MIN_ANSWER_SIZE) {
        // Whatever still does not fit at the smallest size goes on the last line.
        if (index < words.length) lines[lines.length - 1] = [lines.at(-1), ...words.slice(index)].filter(Boolean).join(' ');
        lines.forEach((line, lineIndex) => {
          if (line) draw(line, blanks[lineIndex].x + 2, blanks[lineIndex].y, size, font);
        });
        return;
      }
    }
  };

  const venue = request.travelVenue || (request.detailsSpecify && request.detailsSpecify !== 'N/A' ? request.detailsSpecify : '');

  writeOnBlank(travelOrderNumber(request), L.orderNo, bold);
  writeField(travelOrderAddressee(person, request), L.to);
  writeField(travelSubject(request).toUpperCase(), L.subject);
  const filed = toDate(request.submissionDate || request.createdAt);
  writeField(filed ? longDate(filed) : '', L.date);
  writeOnBlank(activityDates(request.startDate, request.endDate), L.activityDate);
  writeOnBlank(activityWeekdays(request.startDate, request.endDate), L.weekday);
  writeOnBlank(request.travelTime, L.time);
  writeAcrossBlanks(venue, L.venue);

  if (grid) drawGrid(page, regular);
  return pdf.save();
}

// Words of `text` wrapped at spaces into lines no wider than `width` at `size`.
function wrap(text, font, size, width) {
  const lines = [];
  for (const word of text.split(/\s+/)) {
    const joined = lines.length ? `${lines.at(-1)} ${word}` : word;
    if (lines.length && font.widthOfTextAtSize(joined, size) <= width) lines[lines.length - 1] = joined;
    else lines.push(word);
  }
  return lines;
}
