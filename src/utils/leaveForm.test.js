import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PDFArray, PDFDocument, PDFName, decodePDFRawStream } from 'pdf-lib';
import { LEAVE_FORM_LAYOUT, fillLeaveForm, leaveTypeKey, splitApplicantName } from './leaveForm.js';

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
