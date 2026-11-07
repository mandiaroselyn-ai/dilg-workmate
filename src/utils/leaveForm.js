import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { drawSignature } from './formSignature.js';

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

  // 7.A: HR 1's certification of the leave credits: the date on the "As of" line, each figure in
  // the table's Vacation Leave and Sick Leave columns (x = the column's centre) and rows (y = the
  // row's baseline), and HR 1's name and position in place of the template's.
  creditsAsOf: { x: 110, y: 252.3, maxWidth: 93 },
  creditColumns: { vacation: 203.6, sick: 275 },
  creditRows: { earned: 228.6, less: 218.9, balance: 209.1 },
  certifier: { center: 202, nameY: 171.7, positionY: 160.8, maxWidth: 212, coverX: 94, coverWidth: 216 },

  // 7.B: HR 2's recommendation: a check in the narrow space left of the chosen line (x = the
  // check's left edge, y = the line's baseline), a disapproval's reason after "due to" and on the
  // lines under it, and HR 2's name and position in place of the template's.
  recommendationCheckX: 338.1,
  forApproval: 246.9,
  forDisapproval: 233.4,
  disapprovalReason: [
    { x: 421, y: 234.4, maxWidth: 99 },
    { x: 343, y: 224.6, maxWidth: 178 },
    { x: 343, y: 214.9, maxWidth: 178 },
    { x: 343, y: 205.1, maxWidth: 178 }
  ],
  recommender: { center: 432, nameY: 173.1, positionY: 160.8, maxWidth: 196, coverX: 340, coverWidth: 196 },

  // 7.C/7.D: the Supervisor's signature, just over the approving official's name that the
  // template prints at the bottom (its baseline is y 63.4), under 7.D's last line (y 107.6).
  approverSignature: { center: 309, bottom: 72, width: 150, height: 32 },
};

// The template's sizes for a signatory's name (bold) and position under it.
const SIGNATORY_NAME_SIZE = 8.4;
const SIGNATORY_POSITION_SIZE = 7.65;
// Leave credits as the certification writes them, to three places.
const creditFigure = value => (Number.isFinite(Number(value)) ? Number(value).toFixed(3) : '');

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

// The employee's own words in a leave's purpose, without the "Leave Type: …." the app puts
// before them: '' when they wrote none, since the purpose is optional.
export const ownLeavePurpose = purpose => String(purpose || '').replace(/^Leave Type:[^.]*\.\s*/, '').trim();

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
  if (!isVacation && !['sick', 'women', 'study'].includes(typeKey)) write(details || ownLeavePurpose(request.purpose), L.otherPurpose, { font: regular });

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

  // A signatory's name and position, written over the template's own (covered in white) at the
  // template's sizes, shrinking only when a long name does not fit.
  const writeSignatory = (signer, spot) => {
    if (!signer?.name) return;
    page.drawRectangle({ x: spot.coverX, y: spot.nameY - 1.2, width: spot.coverWidth, height: 8.6, color: rgb(1, 1, 1) });
    page.drawRectangle({ x: spot.coverX, y: spot.positionY - 1.8, width: spot.coverWidth, height: 7.4, color: rgb(1, 1, 1) });
    for (const [text, font, size, y] of [[signer.name.toUpperCase(), bold, SIGNATORY_NAME_SIZE, spot.nameY], [signer.position || '', regular, SIGNATORY_POSITION_SIZE, spot.positionY]]) {
      if (!text) continue;
      let fitted = size;
      while (fitted > MIN_ANSWER_SIZE && font.widthOfTextAtSize(text, fitted) > spot.maxWidth) fitted -= 0.25;
      page.drawText(text, { x: spot.center - font.widthOfTextAtSize(text, fitted) / 2, y, size: fitted, font, color: black });
    }
  };

  // 7.A: HR 1's certification of the employee's leave credits, once HR 1 has certified them.
  const certification = request.creditCertification;
  if (certification) {
    write(formatDate(certification.asOf), L.creditsAsOf);
    for (const [row, y] of Object.entries(L.creditRows)) {
      write(creditFigure(certification.vacationLeave?.[row]), { center: L.creditColumns.vacation, y, maxWidth: 66 });
      write(creditFigure(certification.sickLeave?.[row]), { center: L.creditColumns.sick, y, maxWidth: 66 });
    }
    writeSignatory(certification.certifiedBy, L.certifier);
  }

  // 7.B: HR 2's recommendation, once HR 2 has pre-approved the leave.
  const recommendation = request.recommendation;
  if (recommendation) {
    const y = recommendation.decision === 'approval' ? L.forApproval : L.forDisapproval;
    const x = L.recommendationCheckX;
    page.drawLine({ start: { x, y: y + 2.6 }, end: { x: x + 1.3, y: y + 0.6 }, thickness: 0.9, color: black });
    page.drawLine({ start: { x: x + 1.3, y: y + 0.6 }, end: { x: x + 3.3, y: y + 5.2 }, thickness: 0.9, color: black });
    if (recommendation.decision === 'disapproval') {
      // The reason after "due to", then on the lines under it, word by word.
      const lines = L.disapprovalReason;
      let line = 0;
      let current = '';
      const flush = () => {
        if (current && line < lines.length) write(current, { ...lines[line], maxWidth: lines[line].maxWidth }, { font: regular });
        line += 1;
        current = '';
      };
      for (const word of String(recommendation.reason || '').split(/\s+/).filter(Boolean)) {
        const joined = current ? `${current} ${word}` : word;
        if (current && regular.widthOfTextAtSize(joined, ANSWER_SIZE) > (lines[line]?.maxWidth || 0)) {
          flush();
          current = word;
        } else {
          current = joined;
        }
      }
      flush();
    }
    writeSignatory(recommendation.recommendedBy, L.recommender);
  }

  // 7.C/7.D: once the Supervisor approves or disapproves, their signature goes over the
  // approving official's name. Before that the form has no signature.
  if (['Approved', 'Rejected'].includes(request.status)) {
    await drawSignature(pdf, page, request.supervisorSignature || request.signatureData, L.approverSignature);
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
