import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { countSignatures, keepsEarlierBytes, signedPdfProblem } from './signedPdf.js';
import { signedFormMarker } from '../../../shared/signedForms.js';

// A PDF as WorkMate makes it, with its tag, and the same file after a signature is added in
// Adobe: an incremental update appended to the end, with the signature's byte range.
const madePdf = async (kind, ref) => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdf.setKeywords([signedFormMarker(kind, ref)]);
  return Buffer.from(await pdf.save());
};
const sign = (bytes, n = 1) => Buffer.concat([bytes, Buffer.from(`\n${90 + n} 0 obj\n<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 1000 2000 300] /Contents <3082> >>\nendobj\n%%EOF\n`, 'latin1')]);

test('a signed form WorkMate made for the same request is taken', async () => {
  const signed = sign(await madePdf('leave', 'REQ-1'));
  assert.equal(countSignatures(signed), 1);
  assert.equal(await signedPdfProblem(signed, { kind: 'leave-hr', ref: 'REQ-1', minSignatures: 1 }), '');
});

test('an unsigned file, another request\'s form, or a file that is not a PDF is refused', async () => {
  const made = await madePdf('leave', 'REQ-1');
  assert.match(await signedPdfProblem(made, { kind: 'leave-hr', ref: 'REQ-1', minSignatures: 1 }), /no digital signature/);
  assert.match(await signedPdfProblem(sign(made), { kind: 'leave-hr', ref: 'REQ-2', minSignatures: 1 }), /not the form WorkMate made/);
  assert.match(await signedPdfProblem(sign(await madePdf('travel-head', 'REQ-1')), { kind: 'leave-hr', ref: 'REQ-1', minSignatures: 1 }), /not the form WorkMate made/);
  assert.match(await signedPdfProblem(Buffer.from('hello'), { kind: 'leave-hr', ref: 'REQ-1', minSignatures: 1 }), /not a PDF/);
});

test("the Head's signature must be added on top of HR 2's signed file, unchanged", async () => {
  const byHr = sign(await madePdf('leave', 'REQ-1'));
  const byHead = sign(byHr, 2);
  assert.equal(countSignatures(byHead), 2);
  assert.ok(keepsEarlierBytes(byHead, byHr));
  assert.equal(await signedPdfProblem(byHead, { kind: 'leave-head', ref: 'REQ-1', minSignatures: 2, before: byHr }), '');
  // HR 2's file again, with no new signature.
  assert.match(await signedPdfProblem(byHr, { kind: 'leave-head', ref: 'REQ-1', minSignatures: 2, before: byHr }), /missing a digital signature/);
  // A file rebuilt with two signatures, which no longer keeps what HR 2 signed.
  const other = await PDFDocument.create();
  other.addPage();
  other.addPage();
  other.setKeywords([signedFormMarker('leave', 'REQ-1')]);
  const changed = sign(sign(Buffer.from(await other.save())), 2);
  assert.match(await signedPdfProblem(changed, { kind: 'leave-head', ref: 'REQ-1', minSignatures: 2, before: byHr }), /changed what was already signed/);
});
