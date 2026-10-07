import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Fills the CSC Form No. 6 template (src/assets/template/csc-form-6-template.pdf) for one leave
// request. Every position below is in PDF points measured from the bottom-left corner of
// the template's page (612 x 792, US Letter), and was taken from the template's own labels
// and lines. To move an answer, change its numbers here, then run
// `node scripts/preview-leave-form.mjs --grid` and open the PDF it writes to check.

const black = rgb(0, 0, 0);
const ANSWER_SIZE = 7.5;
const MIN_ANSWER_SIZE = 5;
const BOX_SIZE = 6.5;

export const LEAVE_FORM_LAYOUT = {
  // 1-5: answers sit in the empty space under or beside each label. Position has little
  // room before "5. SALARY", so a long title wraps onto two lines.
  office: { x: 90, y: 648, maxWidth: 140 },
  lastName: { center: 306.6, y: 648, maxWidth: 82 },
  firstName: { center: 393.1, y: 648, maxWidth: 70 },
  middleName: { center: 470.5, y: 648, maxWidth: 70 },
  filingDate: { x: 152, y: 625.8, maxWidth: 80 },
  position: { x: 290, y: 625.8, maxWidth: 62, lines: 2 },
  salary: { x: 398, y: 625.8, maxWidth: 145 },

  // 6.A: a checkbox left of each type of leave (y = the label's baseline).
  leaveTypeBoxX: 79,
  leaveTypes: {
    vacation: 573.7,
    mandatory: 560,
    sick: 546.3,
    maternity: 532.6,
    paternity: 519,
    specialPrivilege: 505.3,
    soloParent: 491.6,
    study: 477.9,
    vawc: 464.2,
    rehabilitation: 450.6,
    women: 437.2,
    calamity: 422.9,
    adoption: 407.9
  },
  others: { x: 105, y: 381.6, maxWidth: 228 },

  // 6.B: a checkbox left of each option; details go on the option's underline
  // (x = where the underline starts, lineEnd = where it ends).
  detailBoxX: 345.5,
  withinPhilippines: { x: 430.5, y: 561.1, lineEnd: 538.5 },
  abroad: { x: 414.5, y: 547.6, lineEnd: 535.1 },
  inHospital: { x: 451.5, y: 520, lineEnd: 540.2 },
  outPatient: { x: 451.5, y: 506.5, lineEnd: 534.2 },
  womenIllness: { x: 400.3, y: 465.1, lineEnd: 533.5 },
  study: { x: 354.4, y: 423, maxWidth: 185 },
  otherPurpose: { x: 354.4, y: 381.6, maxWidth: 185 },

  // 6.C: on the short lines under the heading and under INCLUSIVE DATES.
  workingDays: { center: 108.2, y: 337.5, maxWidth: 60 },
  inclusiveDates: { x: 95.3, y: 310.1, maxWidth: 238 },

  // 6.D: checkboxes, and the applicant's name over the signature line.
  notRequested: 337,
  requested: 323.5,
  applicantName: { center: 437.3, y: 309.4, maxWidth: 185 },

  // 7.B: Recommendation — supervisor's name over the signature line (right column of section 7).
  supervisorClearRect: { x: 305, y: 148, width: 238, height: 42 },
  supervisorSigLine: { x1: 310, x2: 540, y: 184 },
  supervisorName7B: { center: 427, y: 170, maxWidth: 225 },
};

const formatDate = value => {
  if (!value) return '';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
};

// Last, first, and middle name: the profile's own fields when HR filled them in,
// otherwise split from the full name ("Juan A. Dela Cruz, CESO V" -> Dela Cruz / Juan / A.).
export const splitApplicantName = person => {
  if (person?.lastName || person?.firstName) {
    return { last: person.lastName || '', first: person.firstName || '', middle: person.middleName || '' };
  }
  const parts = String(person?.name || '').split(',')[0].trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { last: parts[0] || '', first: '', middle: '' };
  const initialAt = parts.findIndex((part, index) => index > 0 && /^[A-Za-z]\.?$/.test(part));
  if (initialAt > 0 && initialAt < parts.length - 1) {
    return { first: parts.slice(0, initialAt).join(' '), middle: parts[initialAt], last: parts.slice(initialAt + 1).join(' ') };
  }
  return { first: parts.slice(0, -1).join(' '), middle: '', last: parts.at(-1) };
};

// Which 6.A checkbox a leave type belongs to, or null for "Others".
export const leaveTypeKey = value => {
  const type = String(value || '').toLowerCase();
  if (type.includes('vacation')) return 'vacation';
  if (type.includes('mandatory') || type.includes('forced')) return 'mandatory';
  if (type.includes('sick')) return 'sick';
  if (type.includes('maternity')) return 'maternity';
  if (type.includes('paternity')) return 'paternity';
  if (type.includes('special privilege')) return 'specialPrivilege';
  if (type.includes('solo parent')) return 'soloParent';
  if (type.includes('study')) return 'study';
  if (type.includes('vawc')) return 'vawc';
  if (type.includes('rehabilitation')) return 'rehabilitation';
  if (type.includes('women')) return 'women';
  if (type.includes('emergency') || type.includes('calamity')) return 'calamity';
  if (type.includes('adoption')) return 'adoption';
  return null;
};

export async function fillLeaveForm(templateBytes, request = {}, applicant = {}, { grid = false } = {}) {
  const pdf = await PDFDocument.load(templateBytes);
  const page = pdf.getPages()[0];
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const L = LEAVE_FORM_LAYOUT;

  // Writes an answer in its space: on one line, or wrapped onto up to `lines` lines
  // centred on y, shrinking the text (down to 5 pt) only when it still does not fit.
  const write = (value, { x, center, y, maxWidth, lines: maxLines = 1 }, { font = bold } = {}) => {
    const text = String(value ?? '').trim();
    if (!text) return;
    const { size, lines } = fitText(text, font, maxWidth, maxLines);
    const lineHeight = size + 1;
    lines.forEach((line, index) => {
      const width = font.widthOfTextAtSize(line, size);
      const lineY = y + ((lines.length - 1) / 2 - index) * lineHeight;
      page.drawText(line, { x: center === undefined ? x : center - width / 2, y: lineY, size, font, color: black });
    });
  };
  const box = (x, baseline, checked) => {
    const y = baseline - 1;
    page.drawRectangle({ x, y, width: BOX_SIZE, height: BOX_SIZE, borderColor: black, borderWidth: 0.6 });
    if (!checked) return;
    page.drawLine({ start: { x: x + 1.2, y: y + 1.2 }, end: { x: x + BOX_SIZE - 1.2, y: y + BOX_SIZE - 1.2 }, thickness: 0.9, color: black });
    page.drawLine({ start: { x: x + 1.2, y: y + BOX_SIZE - 1.2 }, end: { x: x + BOX_SIZE - 1.2, y: y + 1.2 }, thickness: 0.9, color: black });
  };
  // An answer on a template line such as "Abroad (Specify) ______".
  const writeOnLine = (value, spot) => write(value, { x: spot.x, y: spot.y, maxWidth: spot.lineEnd - spot.x });

  // 1-5
  const name = splitApplicantName(applicant);
  write(applicant.office, L.office);
  write(name.last, L.lastName);
  write(name.first, L.firstName);
  write(name.middle, L.middleName);
  write(formatDate(request.submissionDate || request.dateFiled || request.createdAt), L.filingDate);
  write(applicant.role || applicant.position, L.position);
  write(applicant.salary, L.salary);

  // 6.A
  const typeKey = leaveTypeKey(request.leaveType || request.type);
  Object.entries(L.leaveTypes).forEach(([key, y]) => box(L.leaveTypeBoxX, y, key === typeKey));
  if (!typeKey) write(request.leaveType && request.leaveType !== 'Others' ? request.leaveType : request.detailsSpecify, L.others);

  // 6.B
  const detailsType = String(request.detailsType || '').toLowerCase();
  const details = request.detailsSpecify && request.detailsSpecify !== 'N/A' ? request.detailsSpecify : '';
  const isVacation = typeKey === 'vacation' || typeKey === 'specialPrivilege';
  const isAbroad = isVacation && detailsType.includes('abroad');
  box(L.detailBoxX, L.withinPhilippines.y, isVacation && !isAbroad);
  box(L.detailBoxX, L.abroad.y, isAbroad);
  if (isVacation) writeOnLine(details, isAbroad ? L.abroad : L.withinPhilippines);
  const inHospital = typeKey === 'sick' && detailsType.includes('hospital');
  box(L.detailBoxX, L.inHospital.y, inHospital);
  box(L.detailBoxX, L.outPatient.y, typeKey === 'sick' && !inHospital);
  if (typeKey === 'sick') writeOnLine(details, inHospital ? L.inHospital : L.outPatient);
  if (typeKey === 'women') writeOnLine(details, L.womenIllness);
  if (typeKey === 'study') {
    box(L.detailBoxX, L.study.y, true);
    write(detailsType.includes('bar') ? 'BAR/Board Examination Review' : "Completion of Master's Degree", L.study);
  }
  if (!isVacation && !['sick', 'women', 'study'].includes(typeKey)) write(details || request.purpose, L.otherPurpose, { font: regular });

  // 6.C
  const days = Number(request.workingDays) || 0;
  if (days) write(`${days} day${days === 1 ? '' : 's'}`, L.workingDays);
  const start = formatDate(request.startDate);
  const end = request.endDate && request.endDate !== request.startDate ? formatDate(request.endDate) : '';
  write(end ? `${start} - ${end}` : start, L.inclusiveDates);

  // 6.D
  box(L.detailBoxX, L.notRequested, request.commutation !== 'Requested');
  box(L.detailBoxX, L.requested, request.commutation === 'Requested');
  write([name.first, name.middle, name.last].filter(Boolean).join(' ').toUpperCase(), L.applicantName);

  // 7.B: Supervisor recommendation — erase the template placeholder then write the actual approver.
  const supervisorName = request.supervisorName;
  if (supervisorName) {
    page.drawRectangle({ x: L.supervisorClearRect.x, y: L.supervisorClearRect.y, width: L.supervisorClearRect.width, height: L.supervisorClearRect.height + 8, color: rgb(1, 1, 1) });
    const sigData = String(request.supervisorSignature || request.signatureData || '');
    if (sigData.startsWith('data:image/png;base64,')) {
      try {
        const base64 = sigData.slice('data:image/png;base64,'.length);
        const imgBytes = typeof Buffer !== 'undefined'
          ? Buffer.from(base64, 'base64')
          : Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const img = await pdf.embedPng(imgBytes);
        page.drawImage(img, { x: 355, y: 187, width: 100, height: 32 });
      } catch {}
    } else if (sigData.startsWith('type:')) {
      const sigNameDisplay = sigData.split(':').slice(2).join(':') || supervisorName;
      const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
      const sigSize = 9.5;
      const sigWidth = italic.widthOfTextAtSize(sigNameDisplay, sigSize);
      page.drawText(sigNameDisplay, { x: 427 - sigWidth / 2, y: 187, size: sigSize, font: italic, color: black });
    } else if (sigData.startsWith('stamp:')) {
      const parts = sigData.split(':');
      const initials = parts[1] || supervisorName.split(' ').filter(Boolean).map(w => w[0]).join('');
      const courier = await pdf.embedFont(StandardFonts.CourierBold);
      const initSize = 10;
      const iW = courier.widthOfTextAtSize(initials, initSize) + 6;
      const iX = 427 - iW / 2;
      page.drawRectangle({ x: iX, y: 186, width: iW, height: 12, borderColor: black, borderWidth: 0.5 });
      page.drawText(initials, { x: iX + 3, y: 188, size: initSize, font: courier, color: black });
    }
    page.drawLine({ start: { x: L.supervisorSigLine.x1, y: L.supervisorSigLine.y }, end: { x: L.supervisorSigLine.x2, y: L.supervisorSigLine.y }, thickness: 0.5, color: black });
    write(supervisorName.toUpperCase(), L.supervisorName7B);
  }

  if (grid) drawGrid(page, regular);
  return pdf.save();
}

// The largest size (7.5 pt down to 5 pt) at which the text fits maxWidth, on one line or,
// when allowed, wrapped at spaces onto up to maxLines lines.
function fitText(text, font, maxWidth, maxLines) {
  for (let size = ANSWER_SIZE; size >= MIN_ANSWER_SIZE; size -= 0.25) {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return { size, lines: [text] };
    if (maxLines > 1) {
      const lines = [];
      for (const word of text.split(/\s+/)) {
        const joined = lines.length ? `${lines.at(-1)} ${word}` : word;
        if (lines.length && font.widthOfTextAtSize(joined, size) <= maxWidth) lines[lines.length - 1] = joined;
        else lines.push(word);
      }
      if (lines.length <= maxLines && lines.every(line => font.widthOfTextAtSize(line, size) <= maxWidth)) return { size, lines };
    }
  }
  return { size: MIN_ANSWER_SIZE, lines: [text] };
}

// Light gridlines every 10 points, labelled every 50, to read positions off the preview.
export function drawGrid(page, font) {
  const { width, height } = page.getSize();
  const faint = rgb(0.2, 0.5, 1);
  for (let x = 0; x <= width; x += 10) {
    page.drawLine({ start: { x, y: 0 }, end: { x, y: height }, thickness: x % 50 ? 0.1 : 0.35, color: faint, opacity: 0.6 });
    if (x % 50 === 0) page.drawText(String(x), { x: x + 1, y: 3, size: 5, font, color: faint });
  }
  for (let y = 0; y <= height; y += 10) {
    page.drawLine({ start: { x: 0, y }, end: { x: width, y }, thickness: y % 50 ? 0.1 : 0.35, color: faint, opacity: 0.6 });
    if (y % 50 === 0) page.drawText(String(y), { x: 2, y: y + 1, size: 5, font, color: faint });
  }
}
