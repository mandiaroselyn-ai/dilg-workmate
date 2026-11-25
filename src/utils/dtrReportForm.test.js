import assert from 'node:assert/strict';
import test from 'node:test';
import forge from 'node-forge';
import { PDFDocument } from 'pdf-lib';
import { readDigitalId, signPdfWithDigitalId } from './digitalIdSigning.js';
import { dtrReportMarks, fillDtrReport } from './dtrReportForm.js';
import { countSignatures, signedPdfProblem } from '../../backend/src/utils/signedPdf.js';
import { markerKindOf, signedFormMarker } from '../../shared/signedForms.js';
import { reportNotReady, reportOpenToHr, checksDtrs } from '../../shared/dtrReport.js';

// A self-signed digital ID in a password-protected .pfx, as Adobe or WorkMate makes one.
const makeDigitalId = (name, password) => {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = String(Date.now());
  cert.validity.notBefore = new Date(Date.now() - 60 * 1000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const attrs = [{ name: 'commonName', value: name }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: '3des' });
  return readDigitalId(Uint8Array.from(forge.asn1.toDer(p12).getBytes(), character => character.charCodeAt(0)), password);
};

// The cover tagged as WorkMate tags it for the PD's upload (utils/signedForms.js stampForSigning).
const stamped = async bytes => {
  const pdf = await PDFDocument.load(bytes);
  pdf.setKeywords([signedFormMarker(markerKindOf('dtr-report-pd'), '2026-10')]);
  return pdf.save({ useObjectStreams: false });
};
const row = index => ({ name: `Employee ${index}`, position: 'LGOO II', office: 'Office of the MLGOO - Boac', dtr: index % 3 ? 'Attached' : 'Not submitted' });

test('the PD signs the report as Approved by; its only signature, as HR signs nothing', async () => {
  const made = await fillDtrReport({ month: '2026-10', rows: [row(1), row(2), row(3)] });
  assert.equal(made.pageIndex, 0);
  const signed = await signPdfWithDigitalId(await stamped(made.bytes), { digitalId: makeDigitalId('Ivan Stephen F. Fadri, CESE', 'pd-pass'), pageIndex: made.pageIndex, marks: dtrReportMarks() });
  assert.equal(countSignatures(signed), 1);
  assert.equal(await signedPdfProblem(Buffer.from(signed), { kind: 'dtr-report-pd', ref: '2026-10', minSignatures: 1 }), '');
  // Another month's report is not this one.
  assert.match(await signedPdfProblem(Buffer.from(signed), { kind: 'dtr-report-pd', ref: '2026-09', minSignatures: 1 }), /not the form WorkMate made/);
});

test('a long list goes on to more pages, and the PD signs on the last', async () => {
  const rows = Array.from({ length: 70 }, (_, index) => row(index + 1));
  const made = await fillDtrReport({ month: '2026-10', rows });
  const pdf = await PDFDocument.load(made.bytes);
  assert.ok(pdf.getPageCount() >= 2);
  assert.equal(made.pageIndex, pdf.getPageCount() - 1);
  // Names with letters the standard font lacks are still written.
  const odd = await fillDtrReport({ month: '2026-10', rows: [{ ...row(1), name: 'Peña, José 🙂' }] });
  assert.ok(odd.bytes.length > 0);
});

test('the report waits for HR\'s checks, and only HR\'s desk prepares it', () => {
  const month = '2026-10';
  assert.match(reportNotReady([{ month, status: 'Submitted', employeeName: 'Juan' }, { month, status: 'Checked' }], month), /still waiting for you first: Juan/);
  assert.match(reportNotReady([{ month, status: 'Returned' }], month), /No checked DTR/);
  assert.equal(reportNotReady([{ month, status: 'Checked' }, { month: '2026-09', status: 'Submitted' }], month), '');
  assert.equal(reportOpenToHr(null), true);
  assert.equal(reportOpenToHr({ status: 'Returned to HR' }), true);
  assert.equal(reportOpenToHr({ status: 'For PD' }), false);
  assert.equal(checksDtrs({ accessLevel: 'hr_admin', hrTask: 'leave-credits' }), true);
  assert.equal(checksDtrs({ accessLevel: 'hr_admin', hrTask: 'pre-approval' }), false);
  assert.equal(checksDtrs({ accessLevel: 'supervisor' }), false);
});
