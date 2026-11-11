import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { fillDTR } from './dtrForm.js';

const template = fs.readFileSync(new URL('../assets/template/dtr-template.pdf', import.meta.url));
// A 1x1 PNG, as a signature drawn in WorkMate is saved.
const signatureImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const records = [{ date: '2026-10-05', timeIn: '07:55 AM', timeOut: '05:00 PM' }];
const employee = { name: 'Juan Dela Cruz', role: 'LGOO II', office: 'Office of the MLGOO - Boac' };

// The number of images on the first page, and its text drawing commands as one string.
const firstPage = async bytes => {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPages()[0];
  const xObjects = page.node.Resources().lookupMaybe(PDFName.of('XObject'), PDFDict);
  const images = xObjects ? xObjects.keys().filter(key => xObjects.lookup(key).dict?.get(PDFName.of('Subtype'))?.toString() === '/Image').length : 0;
  const contents = page.node.Contents();
  const streams = contents?.asArray ? contents.asArray().map(ref => pdf.context.lookup(ref)) : [contents];
  const text = streams.filter(stream => stream instanceof PDFRawStream).map(stream => new TextDecoder().decode(decodePDFRawStream(stream).decode())).join('\n');
  return { images, text };
};

test('a DTR without e-signatures has no signature images', async () => {
  const { images } = await firstPage(await fillDTR(template, employee, 2026, 10, records));
  assert.equal(images, 0);
});

test('the employee\'s and the In-charge\'s e-signatures go on both copies, with when each signed', async () => {
  const signatures = {
    employee: { image: signatureImage, name: 'Juan Dela Cruz', signedAt: '2026-11-02T01:15:00Z' },
    verification: { image: signatureImage, name: 'Ivan Stephen F. Fadri, CESE', signedAt: '2026-11-03T02:30:00Z' }
  };
  const { images, text } = await firstPage(await fillDTR(template, employee, 2026, 10, records, { signatures }));
  // Each signer's picture is drawn on both copies.
  assert.equal(images, 4);
  assert.equal((text.match(/ Do/g) || []).length, 4);
  // The Provincial Director's name is already printed on the form.
  assert.doesNotMatch(text, /IVAN STEPHEN F\. FADRI/);
});

test('another In-charge\'s name is written over the one the form prints', async () => {
  const signatures = {
    employee: { image: signatureImage, signedAt: '2026-11-02T01:15:00Z' },
    verification: { image: signatureImage, name: 'Maria Santos', signedAt: '2026-11-03T02:30:00Z' }
  };
  const bytes = await fillDTR(template, employee, 2026, 10, records, { signatures });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 2);
  const { images } = await firstPage(bytes);
  assert.equal(images, 4);
});

test('a signature that is not a PNG or JPEG picture is left off', async () => {
  const signatures = { employee: { image: 'not-a-picture', signedAt: '2026-11-02T01:15:00Z' } };
  const { images } = await firstPage(await fillDTR(template, employee, 2026, 10, records, { signatures }));
  assert.equal(images, 0);
});
