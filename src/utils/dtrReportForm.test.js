import assert from 'node:assert/strict';
import test from 'node:test';
import forge from 'node-forge';
import { PDFDocument } from 'pdf-lib';
import { readDigitalId, signPdfWithDigitalId } from './digitalIdSigning.js';
import { dtrReportMarks, fillDtrReport } from './dtrReportForm.js';
import { countSignatures, keepsEarlierBytes, signedPdfProblem } from '../../backend/src/utils/signedPdf.js';
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

// The cover tagged as WorkMate tags it for HR's upload (utils/signedForms.js stampForSigning).
const stamped = async bytes => {
  const pdf = await PDFDocument.load(bytes);
  pdf.setKeywords([signedFormMarker(markerKindOf('dtr-report-hr'), '2026-10')]);
  return pdf.save({ useObjectStreams: false });
};
const row = index => ({ name: `Employee ${index}`, position: 'LGOO II', office: 'Office of the MLGOO - Boac', dtr: index % 3 ? 'Attached' : 'Not submitted' });

test('HR signs the report as Prepared by, then the PD signs the same file as Approved by', async () => {
  const made = await fillDtrReport({ month: '2026-10', rows: [row(1), row(2), row(3)], preparedBy: { name: 'Ma. Joane O. Salcedo', position: 'ADAS II' }, preparedAt: new Date('2026-11-03T02:00:00Z') });
  assert.equal(made.pageIndex, 0);
  const toSign = await stamped(made.bytes);

  const hrSigned = await signPdfWithDigitalId(toSign, { digitalId: makeDigitalId('Ma. Joane O. Salcedo', 'hr-pass'), pageIndex: made.pageIndex, marks: dtrReportMarks('hr') });
  assert.equal(await signedPdfProblem(Buffer.from(hrSigned), { kind: 'dtr-report-hr', ref: '2026-10', minSignatures: 1 }), '');

  // The PD's place is the last page of HR's file, found from the file alone.
  const pages = (await PDFDocument.load(hrSigned, { updateMetadata: false })).getPageCount();
  const pdSigned = await signPdfWithDigitalId(hrSigned, { digitalId: makeDigitalId('Ivan Stephen F. Fadri, CESE', 'pd-pass'), pageIndex: pages - 1, marks: dtrReportMarks('pd') });
  assert.equal(countSignatures(pdSigned), 2);
  assert.ok(keepsEarlierBytes(Buffer.from(pdSigned), Buffer.from(hrSigned)));
  assert.equal(await signedPdfProblem(Buffer.from(pdSigned), { kind: 'dtr-report-pd', ref: '2026-10', minSignatures: 2, before: Buffer.from(hrSigned) }), '');
  // Another month's report is not this one.
  assert.match(await signedPdfProblem(Buffer.from(pdSigned), { kind: 'dtr-report-pd', ref: '2026-09', minSignatures: 2 }), /not the form WorkMate made/);
});

test('a long list goes on to more pages, and both sign on the last', async () => {
  const rows = Array.from({ length: 70 }, (_, index) => row(index + 1));
  const made = await fillDtrReport({ month: '2026-10', rows, preparedBy: { name: 'HR' } });
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
