import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { LEAVE_FORM_LAYOUT, fillLeaveForm, leaveTypeKey, splitApplicantName } from './leaveForm.js';

const template = fs.readFileSync(new URL('../assets/csc-form-6-template.pdf', import.meta.url));

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

test('every answer position is on the page', () => {
  const spots = Object.values(LEAVE_FORM_LAYOUT).filter(value => value && typeof value === 'object' && 'y' in value);
  for (const spot of spots) {
    assert.ok(spot.y > 0 && spot.y < 792, JSON.stringify(spot));
    const x = spot.x ?? spot.center ?? spot.labelX;
    assert.ok(x > 0 && x < 612, JSON.stringify(spot));
  }
});
