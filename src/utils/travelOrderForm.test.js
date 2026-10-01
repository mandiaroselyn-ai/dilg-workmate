import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PDFArray, PDFDocument, PDFName, decodePDFRawStream } from 'pdf-lib';
import {
  activityDates,
  activityWeekdays,
  fillTravelOrder,
  formatTravelTime,
  travelOrderAddressee,
  travelOrderNumber,
  travelSubject
} from './travelOrderForm.js';

// The filled page's content streams, as text.
const contentsOf = async bytes => {
  const pdf = await PDFDocument.load(bytes);
  const entry = pdf.getPages()[0].node.get(PDFName.of('Contents'));
  const refs = entry instanceof PDFArray ? entry.asArray() : [entry];
  return refs.map(ref => Buffer.from(decodePDFRawStream(pdf.context.lookup(ref)).decode()).toString('latin1'));
};

const template = fs.readFileSync(new URL('../assets/template/travelorder-template.pdf', import.meta.url));

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

test('the time is written the way the orders write it', () => {
  assert.equal(formatTravelTime('8:00 AM - 5:00 PM'), '8:00 a.m. to 5:00 p.m.');
  assert.equal(formatTravelTime('8:00 a.m. to 5:00 p.m.'), '8:00 a.m. to 5:00 p.m.');
  assert.equal(formatTravelTime('1:30pm–4pm'), '1:30 p.m. to 4 p.m.');
  assert.equal(formatTravelTime('Whole day'), 'Whole day');
});

test("the template's blanks and fixed text are replaced, and the signature moves under the paragraph", async () => {
  const short = await contentsOf(await fillTravelOrder(template, { travelActivity: 'Barangay Assembly Monitoring', startDate: '2026-10-05', travelTime: '8:00 a.m. to 5:00 p.m.', travelVenue: 'Brgy. Tabi, Boac' }));
  const long = await contentsOf(await fillTravelOrder(template, {
    travelActivity: 'Provision of Technical Assistance to Provincial Health Board (PHB) of Marinduque regarding the Review and Enhancement of its Internal Rules and Procedures (IRP)',
    startDate: '2026-09-02',
    travelTime: '8:00 a.m. to 5:00 p.m.',
    travelVenue: '2nd Floor, Rural Health Unit (RHU), Mogpog, Marinduque'
  }));
  // The template's own underlines under "NO." and in the paragraph (template y 251.15 and
  // 395.5 to 443.15) are gone; the web address's underline (y 180.7) stays.
  const shortText = short.join('\n');
  assert.doesNotMatch(shortText, /(96\.6 251\.15|380\.85 395\.5|72 443\.15|74\.75 419\.25|202\.8 419\.25|362\.85 419\.25) m/);
  assert.match(shortText, /231\.6 180\.7 m/);
  // The signature is drawn once, moved down by more when the subject takes more lines.
  const shift = streams => -Number(/q\r1 0 0 1 0 (\S+) cm\rq\r1 0 0 -1 0 842 cm/.exec(streams.join('\n'))[1]);
  assert.ok(shift(long) > shift(short) + 30, `${shift(long)} vs ${shift(short)}`);
  assert.equal([...short.join('\n').matchAll(/\/IM23 Do/g)].length, 1);
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
