import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import forge from 'node-forge';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { DigitalIdError, readDigitalId, rectOfSpot, signPdfWithDigitalId } from './digitalIdSigning.js';
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
  assert.deepEqual(widget.lookup(PDFName.of('Rect')).asArray().map(value => Math.round(value.asNumber())), rect.map(Math.round));
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
