import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import forge from 'node-forge';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { createDigitalId, DigitalIdError, readDigitalId, rectOfSpot, signPdfWithDigitalId } from './digitalIdSigning.js';
import { dtrInChargeMarks } from './dtrForm.js';
import { fillLeaveForm, leaveHeadMarks, leaveHrMarks } from './leaveForm.js';
import { countSignatures, keepsEarlierBytes, signedPdfProblem } from '../../backend/src/utils/signedPdf.js';
import { signedFormMarker } from '../../shared/signedForms.js';

// A digital ID like the one Adobe makes: a self-signed RSA certificate in a password-protected .pfx.
const makeDigitalId = (name, password, { years = 5 } = {}) => {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = String(Date.now());
  cert.validity.notBefore = new Date(Date.now() - 60 * 1000);
  cert.validity.notAfter = new Date(Date.now() + years * 365 * 24 * 60 * 60 * 1000);
  const attrs = [{ name: 'commonName', value: name }, { name: 'organizationName', value: 'DILG Marinduque' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: '3des' });
  return Uint8Array.from(forge.asn1.toDer(p12).getBytes(), character => character.charCodeAt(0));
};

const makeForm = async ({ objectStreams = false, marker = '' } = {}) => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  page.drawText('TRAVEL ORDER', { x: 72, y: 760, size: 14, font: await pdf.embedFont(StandardFonts.Helvetica) });
  if (marker) pdf.setKeywords([marker]);
  return pdf.save({ useObjectStreams: objectStreams });
};

// Every signature in the PDF checked as Adobe would: its byte range, its digest, and its RSA
// signature over the signed attributes. Returns [{ name, coversAllButContents, endsAt }].
const checkSignatures = bytes => {
  const text = Buffer.from(bytes).toString('latin1');
  const found = [];
  for (const match of text.matchAll(/\/ByteRange\s*\[\s*0\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)) {
    const [a, b, c] = match.slice(1).map(Number);
    const data = Buffer.concat([Buffer.from(bytes.subarray(0, a)), Buffer.from(bytes.subarray(b, b + c))]);
    const hex = text.slice(a + 1, b - 1);
    assert.match(text.slice(a, a + 1), /</);
    const der = forge.util.hexToBytes(hex);
    const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(der, { parseAllBytes: false }));
    const cert = p7.certificates[0];
    const attrs = p7.rawCapture.authenticatedAttributes;
    const digestAttr = attrs.find(attr => forge.asn1.derToOid(attr.value[0].value) === forge.pki.oids.messageDigest);
    const digest = digestAttr.value[1].value[0].value;
    assert.equal(Buffer.from(digest, 'binary').toString('hex'), crypto.createHash('sha256').update(data).digest('hex'), 'the digest covers the byte range');
    const signedAttrs = forge.asn1.toDer(forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, attrs)).getBytes();
    const md = forge.md.sha256.create();
    md.update(signedAttrs);
    assert.equal(cert.publicKey.verify(md.digest().bytes(), p7.rawCapture.signature), true, 'the RSA signature is valid');
    found.push({ name: cert.subject.getField('CN').value, endsAt: b + c });
  }
  return found;
};

test('a digital ID is read with its password, and refused with the wrong one', () => {
  const file = makeDigitalId('GERMAN F. YAP', 'secret123');
  const id = readDigitalId(file, 'secret123');
  assert.equal(id.name, 'GERMAN F. YAP');
  assert.throws(() => readDigitalId(file, 'wrong'), error => error instanceof DigitalIdError && /password/.test(error.message));
  assert.throws(() => readDigitalId(new Uint8Array([1, 2, 3]), 'secret123'), DigitalIdError);
});

test('a form signed in WorkMate carries a valid signature, in its box, that the server accepts', async () => {
  const marker = signedFormMarker('travel-head', 'TO-2026-0001');
  const form = await makeForm({ marker });
  const id = readDigitalId(makeDigitalId('GERMAN F. YAP', 'pw'), 'pw');
  // A 1 x 1 PNG with transparency, as the signature pad saves it.
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const rect = rectOfSpot({ center: 161.8, bottom: 339, width: 142, height: 32 });
  const signed = await signPdfWithDigitalId(form, { digitalId: id, rect, image, reason: 'Approved Travel Order TO-2026-0001', location: 'DILG Marinduque' });

  // The form WorkMate made is still the start of the file, byte for byte.
  assert.equal(keepsEarlierBytes(signed, form), true);
  assert.equal(countSignatures(signed), 1);
  const [signature] = checkSignatures(signed);
  assert.equal(signature.name, 'GERMAN F. YAP');
  assert.equal(signature.endsAt, signed.length, 'the signature covers the whole file');
  assert.equal(await signedPdfProblem(signed, { kind: 'travel-head', ref: 'TO-2026-0001', minSignatures: 1 }), '');

  // The field is in the form, with its box where the Director signs.
  const reread = await PDFDocument.load(signed);
  const fields = reread.catalog.lookup(PDFName.of('AcroForm')).lookup(PDFName.of('Fields')).asArray();
  assert.equal(fields.length, 1);
  const widget = reread.context.lookup(fields[0]);
  // The box, with a point to spare around it.
  assert.deepEqual(widget.lookup(PDFName.of('Rect')).asArray().map(value => Math.round(value.asNumber())), [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1].map(Math.round));
  assert.equal(reread.getPages()[0].node.lookup(PDFName.of('Annots')).size(), 1);
});

test('a second signature keeps the first one valid, as the Head signs after HR 2', async () => {
  const form = await makeForm({ marker: signedFormMarker('leave', 'LV-1') });
  // Without a signature image, the box shows the name and date only.
  const hr = readDigitalId(makeDigitalId('JOHN ERICK J. MATINING', 'a'), 'a');
  const head = readDigitalId(makeDigitalId('GERMAN F. YAP', 'b'), 'b');
  const once = await signPdfWithDigitalId(form, { digitalId: hr, rect: [60, 100, 200, 130], fieldName: 'HR 2' });
  const twice = await signPdfWithDigitalId(once, { digitalId: head, rect: [300, 100, 440, 130], fieldName: 'HR 2' });

  assert.equal(keepsEarlierBytes(twice, once), true);
  assert.equal(countSignatures(twice), 2);
  const [first, second] = checkSignatures(twice);
  assert.equal(first.name, 'JOHN ERICK J. MATINING');
  assert.equal(first.endsAt, once.length, 'the first signature still covers exactly what HR 2 signed');
  assert.equal(second.endsAt, twice.length);
  // Two fields, with their own names.
  const reread = await PDFDocument.load(twice);
  const names = reread.catalog.lookup(PDFName.of('AcroForm')).lookup(PDFName.of('Fields')).asArray()
    .map(ref => reread.context.lookup(ref).lookup(PDFName.of('T')).decodeText());
  assert.deepEqual(names, ['HR 2', 'HR 2 2']);
});

test('a PDF written with a cross-reference stream is signed with one too', async () => {
  const form = await makeForm({ objectStreams: true });
  const id = readDigitalId(makeDigitalId('Signer', 'pw'), 'pw');
  const signed = await signPdfWithDigitalId(form, { digitalId: id, rect: [50, 50, 150, 80] });
  assert.equal(keepsEarlierBytes(signed, form), true);
  assert.equal(checkSignatures(signed).length, 1);
  assert.match(Buffer.from(signed.subarray(form.length)).toString('latin1'), /\/Type \/XRef/);
  const reread = await PDFDocument.load(signed);
  assert.equal(reread.catalog.lookup(PDFName.of('AcroForm')).lookup(PDFName.of('Fields')).size(), 1);
});

const widgetRectOf = async (bytes, index) => {
  const pdf = await PDFDocument.load(bytes);
  const fields = pdf.catalog.lookup(PDFName.of('AcroForm')).lookup(PDFName.of('Fields')).asArray();
  return pdf.context.lookup(fields[index]).lookup(PDFName.of('Rect')).asArray().map(value => value.asNumber());
};
const appearanceTextOf = async (bytes, index) => {
  const pdf = await PDFDocument.load(bytes);
  const fields = pdf.catalog.lookup(PDFName.of('AcroForm')).lookup(PDFName.of('Fields')).asArray();
  const ap = pdf.context.lookup(fields[index]).lookup(PDFName.of('AP')).lookup(PDFName.of('N'));
  return Buffer.from(ap.contents).toString('latin1');
};

test('a leave is signed by HR 2 at 7.A and 7.B, then the Head writes the decision and signs', async () => {
  const template = fs.readFileSync(new URL('../assets/template/csc-form-6-template.pdf', import.meta.url));
  const leave = {
    id: 'LV-2026-0007', type: 'Leave Request', leaveType: 'Vacation Leave', workingDays: 3, startDate: '2026-12-01', endDate: '2026-12-03',
    creditCertification: { asOf: '2026-11-25', vacationLeave: { earned: 2, less: 2, balance: 0 }, sickLeave: { earned: 5, less: 0, balance: 5 }, withoutPayDays: 1, certifiedBy: { name: 'JOHN ERICK J. MATINING', position: 'HRMO' } },
    recommendation: { decision: 'approval', recommendedBy: { name: 'JOHN ERICK J. MATINING', position: 'HRMO' } }
  };
  const filled = await fillLeaveForm(template, leave, { name: 'Roselyn Mandia' });
  const stamped = await PDFDocument.load(filled);
  stamped.setKeywords([signedFormMarker('leave', leave.id)]);
  const form = await stamped.save({ useObjectStreams: false });

  const hr = readDigitalId(makeDigitalId('JOHN ERICK J. MATINING', 'a'), 'a');
  const byHr = await signPdfWithDigitalId(form, { digitalId: hr, marks: leaveHrMarks() });
  assert.equal(await signedPdfProblem(byHr, { kind: 'leave-hr', ref: leave.id, minSignatures: 1 }), '');
  // One signature showing at 7.A (left) and 7.B (right).
  const [hrLeft, , hrRight] = await widgetRectOf(byHr, 0);
  assert.ok(hrLeft < 145 && hrRight > 490, 'the box spans 7.A and 7.B');

  const head = readDigitalId(makeDigitalId('IVAN STEPHEN F. FADRI', 'b'), 'b');
  const approved = await signPdfWithDigitalId(byHr, { digitalId: head, marks: leaveHeadMarks({ decision: 'Approved', request: leave }) });
  assert.equal(await signedPdfProblem(approved, { kind: 'leave-head', ref: leave.id, minSignatures: 2, before: byHr }), '');
  const [first, second] = checkSignatures(approved);
  assert.equal(first.endsAt, byHr.length, 'HR 2\'s signature still covers exactly what HR 2 signed');
  assert.equal(second.endsAt, approved.length);
  // 7.C: 2 days with pay, 1 without pay.
  const approvedText = await appearanceTextOf(approved, 1);
  assert.match(approvedText, /\(2\) Tj/);
  assert.match(approvedText, /\(1\) Tj/);

  const reason = 'The office needs everyone during the year-end inventory and the barangay assessment week, so please file it after December 15.';
  const disapproved = await signPdfWithDigitalId(byHr, { digitalId: head, marks: leaveHeadMarks({ decision: 'Rejected', request: leave, reason }) });
  assert.equal(checkSignatures(disapproved).length, 2);
  // 7.D: the reason, word by word on its lines, nothing left out.
  const lines = [...(await appearanceTextOf(disapproved, 1)).matchAll(/\(([^)]*)\) Tj/g)].map(match => match[1]).filter(text => !/^(Digitally signed|Date:)/.test(text));
  assert.ok(lines.length >= 2 && lines.length <= 3);
  assert.equal(lines.join(' '), reason);
});

test('a DTR is signed as the In-charge on both copies', async () => {
  const template = fs.readFileSync(new URL('../assets/template/dtr-template.pdf', import.meta.url));
  const stamped = await PDFDocument.load(template);
  stamped.setKeywords([signedFormMarker('dtr-incharge', 'DTR-1')]);
  const form = await stamped.save({ useObjectStreams: false });
  const id = readDigitalId(makeDigitalId('IVAN STEPHEN F. FADRI', 'pw'), 'pw');
  const signed = await signPdfWithDigitalId(form, { digitalId: id, marks: dtrInChargeMarks() });
  assert.equal(await signedPdfProblem(signed, { kind: 'dtr-incharge', ref: 'DTR-1', minSignatures: 1 }), '');
  const [left, , right] = await widgetRectOf(signed, 0);
  assert.ok(left < 85 && right > 440, 'the box spans both copies');
  assert.equal((await appearanceTextOf(signed, 0)).match(/Verified and digitally signed by IVAN STEPHEN F\. FADRI as In-charge/g).length, 2);
});

test('WorkMate makes a digital ID in the signer\'s name, locked with their signing password, that signs', async () => {
  const made = await createDigitalId({ name: 'JOHN ERICK J. MATINING', email: 'erick@dilg.gov.ph', password: 'my-signing-pass' });
  assert.equal(made.name, 'JOHN ERICK J. MATINING');
  assert.throws(() => readDigitalId(made.bytes, 'wrong-password'), /password/);
  const id = readDigitalId(made.bytes, 'my-signing-pass');
  assert.equal(id.name, 'JOHN ERICK J. MATINING');
  assert.equal(id.certificate.subject.getField('E')?.value || id.certificate.subject.getField({ name: 'emailAddress' })?.value, 'erick@dilg.gov.ph');
  const years = (id.certificate.validity.notAfter - id.certificate.validity.notBefore) / (365 * 24 * 60 * 60 * 1000);
  assert.ok(years > 4.9 && years < 5.1);
  const form = await makeForm({ marker: signedFormMarker('leave', 'LV-9') });
  const signed = await signPdfWithDigitalId(form, { digitalId: id, marks: leaveHrMarks() });
  assert.deepEqual(checkSignatures(signed).map(signature => signature.name), ['JOHN ERICK J. MATINING']);
  // Too short a signing password, or no name, is refused.
  await assert.rejects(createDigitalId({ name: 'X', password: 'short' }), /at least 8/);
  await assert.rejects(createDigitalId({ name: ' ', password: 'long-enough' }), /name/);
});

test('an expired digital ID is refused', () => {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  cert.validity.notAfter = new Date(Date.now() - 24 * 60 * 60 * 1000);
  cert.setSubject([{ name: 'commonName', value: 'Old' }]);
  cert.setIssuer([{ name: 'commonName', value: 'Old' }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const file = Uint8Array.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'pw', { algorithm: '3des' })).getBytes(), character => character.charCodeAt(0));
  assert.throws(() => readDigitalId(file, 'pw'), /expired/);
});
