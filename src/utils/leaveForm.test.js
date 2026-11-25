import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PDFArray, PDFDocument, PDFName, decodePDFRawStream } from 'pdf-lib';
import { LEAVE_FORM_LAYOUT, fillLeaveForm, leaveTypeKey, ownLeavePurpose, receiptStamp, splitApplicantName } from './leaveForm.js';

test('a leave\'s purpose is optional, and the form writes only the employee\'s own words', () => {
  assert.equal(ownLeavePurpose('Leave Type: Mandatory/Forced Leave.'), '');
  assert.equal(ownLeavePurpose('Leave Type: Others. Monetization of 10 days'), 'Monetization of 10 days');
  assert.equal(ownLeavePurpose('Family matter'), 'Family matter');
  assert.equal(ownLeavePurpose(undefined), '');
});

const template = fs.readFileSync(new URL('../assets/template/csc-form-6-template.pdf', import.meta.url));

test('names are split into last, first, and middle', () => {
  assert.deepEqual(splitApplicantName({ name: 'Juan A. Dela Cruz' }), { first: 'Juan', middle: 'A.', last: 'Dela Cruz' });
  assert.deepEqual(splitApplicantName({ name: 'John Erick J. Matining' }), { first: 'John Erick', middle: 'J.', last: 'Matining' });
  assert.deepEqual(splitApplicantName({ name: 'German F. Yap, CESO V' }), { first: 'German', middle: 'F.', last: 'Yap' });
  assert.deepEqual(splitApplicantName({ name: 'Aldrey Perjes' }), { first: 'Aldrey', middle: '', last: 'Perjes' });
  assert.deepEqual(splitApplicantName({ name: 'Madonna' }), { first: '', middle: '', last: 'Madonna' });
});

test('the name fields HR filled in are used as they are', () => {
  const person = { name: 'Ana Reyes Santos', firstName: 'Ana', middleName: 'Reyes', lastName: 'Santos' };
  assert.deepEqual(splitApplicantName(person), { first: 'Ana', middle: 'Reyes', last: 'Santos' });
});

test('every leave type in the request form has its own checkbox', () => {
  const expected = {
    'Vacation Leave': 'vacation',
    'Sick Leave': 'sick',
    'Mandatory / Forced Leave': 'mandatory',
    'Special Privilege Leave': 'specialPrivilege',
    'Maternity Leave': 'maternity',
    'Paternity Leave': 'paternity',
    'Solo Parent Leave': 'soloParent',
    'Study Leave': 'study',
    '10-Day VAWC Leave': 'vawc',
    'Rehabilitation Privilege': 'rehabilitation',
    'Special Leave Benefits for Women': 'women',
    'Special Emergency (Calamity) Leave': 'calamity',
    // Saved before the name was corrected.
    'Special Emergency Lease': 'calamity',
    'Adoption Leave': 'adoption',
    Others: null
  };
  for (const [type, key] of Object.entries(expected)) assert.equal(leaveTypeKey(type), key, type);
  for (const key of Object.values(expected).filter(Boolean)) assert.ok(LEAVE_FORM_LAYOUT.leaveTypes[key], key);
});

test('the filled form keeps the template\'s single US Letter page', async () => {
  const bytes = await fillLeaveForm(template, {
    leaveType: 'Sick Leave',
    detailsType: 'In Hospital',
    detailsSpecify: 'Acute Gastroenteritis',
    submissionDate: '2026-09-30',
    startDate: '2026-10-05',
    endDate: '2026-10-07',
    workingDays: 3,
    commutation: 'Requested'
  }, { name: 'Juan A. Dela Cruz', office: 'DILG Marinduque', role: 'LGOO VI - Program Manager with a very long position title' });
  const filled = await PDFDocument.load(bytes);
  assert.equal(filled.getPageCount(), 1);
  const { width, height } = filled.getPages()[0].getSize();
  assert.equal(Math.round(width), 612);
  assert.equal(Math.round(height), 792);
});

// The content of a filled form's page, and how many images and white boxes it draws.
const pageContent = async bytes => {
  const pdf = await PDFDocument.load(bytes);
  const entry = pdf.getPages()[0].node.get(PDFName.of('Contents'));
  const refs = entry instanceof PDFArray ? entry.asArray() : [entry];
  return refs.map(ref => Buffer.from(decodePDFRawStream(pdf.context.lookup(ref)).decode()).toString('latin1')).join('\n');
};
const imagesIn = content => [...content.matchAll(/\/\S+ Do/g)].length;
// A 1 x 1 PNG, as the Supervisor's drawn or uploaded signature is saved.
const pngSignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test('the Supervisor signs over the approving official\'s name once they decide, and 7.B is left as it is', async () => {
  const leave = { leaveType: 'Vacation Leave', startDate: '2026-11-09', endDate: '2026-11-10', workingDays: 2, supervisorName: 'IVAN STEPHEN F. FADRI, CESE', supervisorSignature: pngSignature };
  const waiting = await pageContent(await fillLeaveForm(template, { ...leave, status: 'For Supervisor' }));
  const approved = await pageContent(await fillLeaveForm(template, { ...leave, status: 'Approved' }));
  const disapproved = await pageContent(await fillLeaveForm(template, { ...leave, status: 'Rejected' }));
  assert.equal(imagesIn(approved), imagesIn(waiting) + 1);
  assert.equal(imagesIn(disapproved), imagesIn(waiting) + 1);
  // The signature sits over the name at the bottom (from y 72), not in 7.B.
  assert.match(approved, /1 0 0 1 \S+ 72 cm/);
  // Nothing in 7.B is covered: no white box is drawn over the recommending officer's name, so
  // the page has only the white fills of a form the Supervisor has not touched.
  const whiteFills = content => [...content.matchAll(/(^|\n)1 1 1 rg/g)].length;
  const untouched = await pageContent(await fillLeaveForm(template, { leaveType: 'Vacation Leave', startDate: '2026-11-09' }));
  assert.equal(whiteFills(approved), whiteFills(untouched));
});

test('HR 1\'s certification fills 7.A and HR 2\'s recommendation 7.B, each with its own signatory', async () => {
  const whiteFills = content => [...content.matchAll(/(^|\n)1 1 1 rg/g)].length;
  const leave = { leaveType: 'Vacation Leave', startDate: '2026-11-09', endDate: '2026-11-10', workingDays: 2 };
  const creditCertification = {
    asOf: '2026-11-08',
    vacationLeave: { earned: 10, less: 2, balance: 8 },
    sickLeave: { earned: 5, less: 0, balance: 5 },
    certifiedBy: { name: 'Ma. Joane O. Salcedo', position: 'ADAS II' }
  };
  const recommendation = { decision: 'disapproval', reason: 'Exigency of the service', recommendedBy: { name: 'John Erick J. Matining', position: 'LGOO VI / Program Manager' } };
  const untouched = whiteFills(await pageContent(await fillLeaveForm(template, leave)));
  // The template's names in 7.A and 7.B are covered (name and position) only once someone signs there.
  const certified = await pageContent(await fillLeaveForm(template, { ...leave, creditCertification }));
  assert.equal(whiteFills(certified), untouched + 2);
  const both = await pageContent(await fillLeaveForm(template, { ...leave, creditCertification, recommendation }));
  assert.equal(whiteFills(both), untouched + 4);
  // The recommendation's check is drawn as two short lines.
  assert.ok((both.match(/ l\n/g) || []).length > (certified.match(/ l\n/g) || []).length);
});

test('every answer position is on the page', () => {
  const spots = Object.values(LEAVE_FORM_LAYOUT).filter(value => value && typeof value === 'object' && 'y' in value);
  for (const spot of spots) {
    assert.ok(spot.y > 0 && spot.y < 792, JSON.stringify(spot));
    // A line (such as a signature line) runs from x1 to x2.
    const x = spot.x ?? spot.center ?? spot.labelX ?? spot.x1;
    assert.ok(x > 0 && x < 612, JSON.stringify(spot));
    if (spot.x2 !== undefined) assert.ok(spot.x2 > spot.x1 && spot.x2 < 612, JSON.stringify(spot));
  }
});

test('the stamp of the date of receipt shows when the leave was last submitted, in Philippine time', () => {
  // 02:42 UTC is 10:42 AM in Manila.
  assert.deepEqual(receiptStamp({ status: 'Pending', submittedAt: '2026-11-25T02:42:00.000Z', submissionDate: '2026-11-25' }), { date: 'NOV 25, 2026', time: '10:42 AM' });
  // 17:30 UTC on Nov 25 is already Nov 26 in Manila.
  assert.deepEqual(receiptStamp({ status: 'Approved', submittedAt: '2026-11-25T17:30:00.000Z' }), { date: 'NOV 26, 2026', time: '1:30 AM' });
  // A leave from before the time was kept: its date only.
  assert.deepEqual(receiptStamp({ status: 'For Supervisor', submissionDate: '2026-11-03' }), { date: 'NOV 3, 2026', time: '' });
  // Not received yet: a draft, or no date at all.
  assert.equal(receiptStamp({ status: 'Draft', submittedAt: '2026-11-25T02:42:00.000Z' }), null);
  assert.equal(receiptStamp({ status: 'Pending' }), null);
});

test('a submitted leave\'s form carries the stamp; a draft\'s does not', async () => {
  const template = fs.readFileSync(new URL('../assets/template/csc-form-6-template.pdf', import.meta.url));
  const textOf = async bytes => {
    const pdf = await PDFDocument.load(bytes);
    const contents = pdf.getPages()[0].node.lookup(PDFName.of('Contents'));
    const streams = contents instanceof PDFArray ? contents.asArray().map(ref => pdf.context.lookup(ref)) : [contents];
    return streams.map(stream => Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')).join('\n');
  };
  const leave = { type: 'Leave Request', leaveType: 'Vacation Leave', workingDays: 1, startDate: '2026-12-01', endDate: '2026-12-01', submissionDate: '2026-11-25', submittedAt: '2026-11-25T02:42:00.000Z' };
  const hex = text => Buffer.from(text, 'latin1').toString('hex').toUpperCase();
  const submitted = await textOf(await fillLeaveForm(template, { ...leave, status: 'Pending' }, { name: 'Juan Dela Cruz' }));
  assert.ok(submitted.includes(hex('RECEIVED')) && submitted.includes(hex('NOV 25, 2026')));
  const draft = await textOf(await fillLeaveForm(template, { ...leave, status: 'Draft' }, { name: 'Juan Dela Cruz' }));
  assert.equal(draft.includes(hex('RECEIVED')), false);
});
