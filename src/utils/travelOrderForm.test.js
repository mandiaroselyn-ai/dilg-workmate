import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import {
  activityDates,
  activityWeekdays,
  fillTravelOrder,
  travelOrderAddressee,
  travelOrderNumber,
  travelSubject
} from './travelOrderForm.js';

const template = fs.readFileSync(new URL('../assets/travelorder-template.pdf', import.meta.url));

test('activity dates read like the order: one day, or a range', () => {
  assert.equal(activityDates('2026-10-05'), 'October 5, 2026');
  assert.equal(activityDates('2026-10-05', '2026-10-05'), 'October 5, 2026');
  assert.equal(activityDates('2026-10-05', '2026-10-07'), 'October 5-7, 2026');
  assert.equal(activityDates('2026-09-30', '2026-10-02'), 'September 30 - October 2, 2026');
  assert.equal(activityDates('2026-12-30', '2027-01-02'), 'December 30, 2026 - January 2, 2027');
  assert.equal(activityDates(''), '');
});

test('weekdays match the activity dates', () => {
  assert.equal(activityWeekdays('2026-10-05'), 'Monday');
  assert.equal(activityWeekdays('2026-09-30', '2026-10-02'), 'Wednesday - Friday');
});

test('the order is addressed to the position and name, without a generic role', () => {
  assert.equal(travelOrderAddressee({ name: 'Juan A. Dela Cruz', role: 'LGOO II' }), 'LGOO II JUAN A. DELA CRUZ');
  assert.equal(travelOrderAddressee({ name: 'Maria Peñafiel', role: 'Employee' }), 'MARIA PEÑAFIEL');
  assert.equal(travelOrderAddressee(undefined, { employeeName: 'Ana Reyes' }), 'ANA REYES');
});

test('the order number is the recorded one, or the filing year and request number', () => {
  assert.equal(travelOrderNumber({ orderNo: 'PO-2026-117' }), 'PO-2026-117');
  assert.equal(travelOrderNumber({ id: 'REQ-2025-0042', submissionDate: '2025-12-01' }), '2025-042');
  assert.equal(travelOrderNumber({}), '');
});

test('the subject leaves out the "Official Travel." prefix of the purpose', () => {
  assert.equal(travelSubject({ purpose: 'Official Travel. Barangay Assembly Monitoring' }), 'Barangay Assembly Monitoring');
  assert.equal(travelSubject({ travelActivity: 'SGLG Assessment', purpose: 'Official Travel. Other' }), 'SGLG Assessment');
});

test("the filled order keeps the template's single A4 page, even with long or missing answers", async () => {
  for (const request of [
    {
      id: 'REQ-2026-0042',
      submissionDate: '2026-09-30',
      travelActivity: 'Provincial Orientation and Capacity Development Workshop on the Seal of Good Local Governance Assessment',
      startDate: '2026-09-30',
      endDate: '2026-10-02',
      travelTime: '8:00 AM - 5:00 PM daily',
      travelVenue: 'Session Hall, Sangguniang Panlalawigan Building, Provincial Capitol Compound, Boac, Marinduque, and the municipal halls of the five other towns'
    },
    // Characters the PDF font cannot write (an arrow, an emoji) do not stop the order.
    { travelActivity: 'Boac → Gasan 🚗', travelVenue: 'Brgy. Peñafiel', startDate: '2026-10-05' },
    {}
  ]) {
    const filled = await PDFDocument.load(await fillTravelOrder(template, request, { name: 'Juan A. Dela Cruz', role: 'LGOO II' }));
    assert.equal(filled.getPageCount(), 1);
    const { width, height } = filled.getPages()[0].getSize();
    assert.equal(Math.round(width), 596);
    assert.equal(Math.round(height), 842);
  }
});
