import forge from 'node-forge';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef, StandardFonts } from 'pdf-lib';

// Signing a form inside WorkMate with the signer's own digital ID (the .pfx or .p12 file they sign
// with in Adobe, or a PNPKI certificate later), as Adobe Acrobat does: the signature is added to
// the end of the PDF (an incremental update), so everything signed before stays byte for byte, and
// it shows in its box on the page and in Adobe's Signatures panel. The digital ID is read here, in
// the signer's browser, and never sent anywhere.

export class DigitalIdError extends Error {}

// Room kept in the PDF for the signature (the CMS with the certificates): 12 KB, enough for a
// certificate chain such as PNPKI's.
const SIGNATURE_BYTES = 12288;
const BYTE_RANGE_WIDTH = 10;

const toBinary = bytes => {
  let text = '';
  for (let index = 0; index < bytes.length; index += 8192) text += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return text;
};
const latin1 = text => Uint8Array.from(text, character => character.charCodeAt(0) & 0xff);
const concat = parts => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};
const lastIndexOf = (bytes, text) => {
  const needle = latin1(text);
  outer: for (let index = bytes.length - needle.length; index >= 0; index -= 1) {
    for (let offset = 0; offset < needle.length; offset += 1) if (bytes[index + offset] !== needle[offset]) continue outer;
    return index;
  }
  return -1;
};

// The signer's key and certificate from a digital ID file (PKCS #12) and its password:
// { key, certificate, chain, name }. Throws DigitalIdError with what to do when it cannot be used.
export const readDigitalId = (fileBytes, password) => {
  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(toBinary(new Uint8Array(fileBytes))), false, password);
  } catch (error) {
    throw new DigitalIdError(/password|mac/i.test(error.message || '')
      ? 'The password of the digital ID is wrong.'
      : 'This is not a digital ID file. Choose the .pfx or .p12 file of your digital ID.');
  }
  const bagsOf = type => p12.getBags({ bagType: type })[type] || [];
  const keyBags = [...bagsOf(forge.pki.oids.pkcs8ShroudedKeyBag), ...bagsOf(forge.pki.oids.keyBag)];
  const key = keyBags.map(bag => bag.key).find(Boolean);
  if (!key) {
    throw new DigitalIdError(keyBags.length
      ? 'This digital ID uses a key type WorkMate cannot sign with. Make an RSA 2048-bit digital ID in Adobe and use that.'
      : 'This digital ID file has no private key. Choose the .pfx or .p12 file you sign with.');
  }
  const certificates = bagsOf(forge.pki.oids.certBag).map(bag => bag.cert).filter(Boolean);
  const certificate = certificates.find(cert => cert.publicKey?.n && cert.publicKey.n.equals(key.n));
  if (!certificate) throw new DigitalIdError('The certificate for this digital ID is missing from the file.');
  const now = new Date();
  if (certificate.validity.notAfter < now) throw new DigitalIdError('This digital ID has expired. Make a new one in Adobe.');
  if (certificate.validity.notBefore > now) throw new DigitalIdError('This digital ID is not valid yet. Check the date on this device.');
  return {
    key,
    certificate,
    chain: certificates.filter(cert => cert !== certificate),
    name: certificate.subject.getField('CN')?.value || ''
  };
};

// How hard the password is made to guess from the locked file (PBKDF2 rounds).
const LOCK_ROUNDS = 20000;

// A new digital ID for `name` (and `email`), like the one Adobe makes: an RSA 2048-bit key and a
// self-signed certificate valid for 5 years, in a PKCS #12 file locked (AES-256) with `password`
// (the signer's WorkMate password, which the server checks when it keeps the file). The key is
// made by the browser's own crypto. Returns { bytes, name }.
export const createDigitalId = async ({ name, email = '', password }) => {
  const signer = String(name || '').trim();
  if (!signer) throw new DigitalIdError('Your name is needed for the digital ID.');
  if (!password) throw new DigitalIdError('Enter your WorkMate password.');
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new DigitalIdError('This browser cannot make a digital ID. Use an up-to-date browser over https.');
  const pair = await subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const pkcs8 = new Uint8Array(await subtle.exportKey('pkcs8', pair.privateKey));
  const key = forge.pki.privateKeyFromAsn1(forge.asn1.fromDer(toBinary(pkcs8)));
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
  // A positive serial number (its first byte under 0x80).
  const serial = new Uint8Array(16);
  globalThis.crypto.getRandomValues(serial);
  serial[0] &= 0x7f;
  cert.serialNumber = [...serial].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const now = new Date();
  cert.validity.notBefore = new Date(now.getTime() - 5 * 60 * 1000);
  cert.validity.notAfter = new Date(now.getTime());
  cert.validity.notAfter.setFullYear(now.getFullYear() + 5);
  const subject = [{ name: 'commonName', value: signer }, { name: 'organizationName', value: 'DILG Marinduque' }];
  if (email) subject.push({ name: 'emailAddress', value: String(email).trim() });
  cert.setSubject(subject);
  cert.setIssuer(subject);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
    { name: 'subjectKeyIdentifier' }
  ]);
  cert.sign(key, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(key, [cert], password, { algorithm: 'aes256', count: LOCK_ROUNDS, friendlyName: signer });
  return { bytes: latin1(forge.asn1.toDer(p12).getBytes()), name: signer };
};

// PDF dates: D:20261125065000+08'00' (Philippine time).
const pdfDate = date => {
  const manila = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = value => String(value).padStart(2, '0');
  return `D:${manila.getUTCFullYear()}${pad(manila.getUTCMonth() + 1)}${pad(manila.getUTCDate())}${pad(manila.getUTCHours())}${pad(manila.getUTCMinutes())}${pad(manila.getUTCSeconds())}+08'00'`;
};
const shownDate = date => {
  const manila = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = value => String(value).padStart(2, '0');
  return `${manila.getUTCFullYear()}.${pad(manila.getUTCMonth() + 1)}.${pad(manila.getUTCDate())} ${pad(manila.getUTCHours())}:${pad(manila.getUTCMinutes())} +08'00'`;
};
// Text for a PDF literal string in WinAnsi: Latin-1 only (others become "?"), with ( ) \ escaped.
const pdfText = value => String(value ?? '')
  .replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
  .replace(/[\\()]/g, match => `\\${match}`);

// The image of a signature ("data:image/png;base64,..." or JPEG) as bytes, or null.
const imageOf = dataUrl => {
  const match = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!match) return null;
  return { type: match[1].toLowerCase() === 'png' ? 'png' : 'jpg', bytes: Uint8Array.from(atob(match[2]), character => character.charCodeAt(0)) };
};

// Where the last cross-reference section is, how it is written ('table' or 'stream'), and the
// trailer's /Size.
const lastXref = bytes => {
  const at = lastIndexOf(bytes, 'startxref');
  if (at < 0) throw new DigitalIdError('This PDF could not be read for signing.');
  const offset = Number(/startxref\s+(\d+)/.exec(toBinary(bytes.subarray(at, at + 40)))?.[1]);
  if (!Number.isFinite(offset)) throw new DigitalIdError('This PDF could not be read for signing.');
  const tail = toBinary(bytes.subarray(offset));
  const size = Number(/\/Size\s+(\d+)/.exec(tail)?.[1]) || 0;
  return { offset, kind: /^\s*xref/.test(tail) ? 'table' : 'stream', size };
};

// The field names already in the form, so the new signature gets its own.
const fieldNames = (context, acroForm) => {
  const fields = acroForm?.lookup(PDFName.of('Fields'));
  if (!(fields instanceof PDFArray)) return new Set();
  return new Set(fields.asArray().map(ref => {
    const field = context.lookup(ref);
    return field instanceof PDFDict ? String(field.lookup(PDFName.of('T'))?.decodeText?.() ?? '') : '';
  }));
};

// The largest size, from `size` down to 3 pt, at which `text` fits `maxWidth`.
const fitSize = (font, text, size, maxWidth = Infinity) => {
  let fitted = size;
  while (fitted > 3 && font.widthOfTextAtSize(text, fitted) > maxWidth) fitted -= 0.25;
  return fitted;
};

// What the signature shows on the page, as marks in page points:
// - { type: 'signature', center, bottom, width, height, caption? }: the signer's signature image,
//   filling the box; with `caption`, "Digitally signed by NAME" and the date under it. Without an
//   image, the box shows that caption instead. (The digital signature itself is in the PDF either
//   way, and Adobe Reader lists it in its Signatures panel.)
// - { type: 'text', text, x or center, y (baseline), size, maxWidth? }: a line of text, such as a
//   leave's decision at 7.C, where "{name}" and "{date}" become the signer's name and date;
// - { type: 'paragraph', text, size, lines: [{ x, y, maxWidth }] }: text written word by word on
//   those lines, such as 7.D's reason (what does not fit is squeezed onto the last line).
// Each mark gets its place: left, bottom, right, top.
const wrapParagraph = (mark, font) => {
  const size = mark.size || 7;
  const words = String(mark.text || '').split(/\s+/).filter(Boolean);
  const lines = mark.lines || [];
  const out = [];
  let index = 0;
  let current = '';
  for (const word of words) {
    const joined = current ? `${current} ${word}` : word;
    if (current && index < lines.length - 1 && font.widthOfTextAtSize(joined, size) > lines[index].maxWidth) {
      out.push({ type: 'text', text: current, size, ...lines[index] });
      index += 1;
      current = word;
    } else {
      current = joined;
    }
  }
  if (current && lines[index]) out.push({ type: 'text', text: current, size, ...lines[index] });
  return out;
};
const placeMarks = (marks, font, { name, date }) => marks.flatMap(mark => (mark.type === 'paragraph' ? wrapParagraph(mark, font) : [mark])).map(mark => {
  if (mark.type === 'text') {
    const text = String(mark.text || '').replaceAll('{name}', name).replaceAll('{date}', date);
    const size = fitSize(font, text, mark.size || 7, mark.maxWidth);
    const width = font.widthOfTextAtSize(text, size);
    const left = mark.center != null ? mark.center - width / 2 : mark.x;
    return { ...mark, text, size, left, bottom: mark.y - size * 0.25, right: left + width, top: mark.y + size };
  }
  return { ...mark, type: 'signature', left: mark.center - mark.width / 2, right: mark.center + mark.width / 2, top: mark.bottom + mark.height };
});

// Drawing for one line of text at (x, y).
const textOps = (text, size, x, y) => ['BT', `/F1 ${size.toFixed(2)} Tf`, '0 0 0 rg', `${x.toFixed(2)} ${y.toFixed(2)} Td`, `(${pdfText(text)}) Tj`, 'ET'];

// Drawing for a signature box `width` x `height` at (x, y): the image above the caption, or the
// caption alone, centred.
const signatureOps = ({ x, y, width, height, caption, font, image, name, date }) => {
  const lines = [`Digitally signed by ${name}`, `Date: ${date}`];
  const withCaption = caption || !image;
  const size = withCaption ? Math.min(fitSize(font, lines[0], image ? 5.5 : 8, width), fitSize(font, lines[1], image ? 5.5 : 7, width)) : 0;
  const captionHeight = withCaption ? size * 2.3 : 0;
  const ops = [];
  if (image) {
    const room = { width, height: Math.max(4, height - captionHeight) };
    const scale = Math.min(room.width / image.width, room.height / image.height);
    const drawn = { width: image.width * scale, height: image.height * scale };
    ops.push('q', `${drawn.width.toFixed(2)} 0 0 ${drawn.height.toFixed(2)} ${(x + (width - drawn.width) / 2).toFixed(2)} ${(y + captionHeight + (room.height - drawn.height) / 2).toFixed(2)} cm`, '/Im1 Do', 'Q');
  }
  if (withCaption) {
    const top = image ? captionHeight - size : (height + captionHeight) / 2 - size;
    lines.forEach((text, index) => ops.push(...textOps(text, size, x + (width - font.widthOfTextAtSize(text, size)) / 2, y + top - index * size * 1.15)));
  }
  return ops;
};

// The drawing of every mark, relative to `origin` (the box's lower left corner).
const appearanceContent = (placed, origin, { font, image, name, date }) => placed.flatMap(mark => (mark.type === 'text'
  ? textOps(mark.text, mark.size, mark.left - origin.x, mark.y - origin.y)
  : signatureOps({
    x: mark.left - origin.x,
    y: mark.bottom - origin.y,
    width: mark.width,
    height: mark.height,
    caption: Boolean(mark.caption),
    font,
    image,
    name,
    date
  }))).join('\n');

// Signs `pdfBytes` with `digitalId` (see readDigitalId), on page `pageIndex`. What it shows is
// `marks` (see placeMarks), or a signature box filling `rect` ([left, bottom, right, top] in PDF
// points). `image` is the signer's signature as a data URL ('' for none). Returns the signed
// PDF's bytes.
export const signPdfWithDigitalId = async (pdfBytes, {
  digitalId,
  pageIndex = 0,
  rect = null,
  marks = null,
  image = '',
  reason = '',
  location = '',
  fieldName = 'Signature',
  signedAt = new Date()
}) => {
  const shown = marks?.length ? marks : rect ? [{ type: 'signature', center: (rect[0] + rect[2]) / 2, bottom: rect[1], width: rect[2] - rect[0], height: rect[3] - rect[1] }] : null;
  if (!shown) throw new DigitalIdError('Where the signature goes on the form is missing.');
  const original = new Uint8Array(pdfBytes);
  const pdf = await PDFDocument.load(original, { updateMetadata: false });
  const { context } = pdf;
  const trailer = context.trailerInfo;
  if (trailer.Encrypt) throw new DigitalIdError('This PDF is protected and cannot be signed in WorkMate.');
  const catalogRef = trailer.Root;
  const catalog = context.lookup(catalogRef, PDFDict);
  const page = pdf.getPages()[pageIndex];
  if (!page) throw new DigitalIdError('The page to sign is missing from this PDF.');
  const xref = lastXref(original);

  let nextNumber = Math.max(context.largestObjectNumber + 1, xref.size);
  const newRef = () => PDFRef.of(nextNumber++);
  const objects = []; // [{ ref, dict, stream? }] in the order they are written

  // The appearance's font, image, and drawing, made in a scratch PDF (for the font's widths and
  // the image's encoding) and copied over with new object numbers.
  const scratch = await PDFDocument.create();
  const font = await scratch.embedFont(StandardFonts.Helvetica);
  const fontRef = newRef();
  objects.push({ ref: fontRef, dict: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>' });

  const picture = imageOf(image);
  let embedded = null;
  let imageRef = null;
  if (picture) {
    try {
      embedded = picture.type === 'png' ? await scratch.embedPng(picture.bytes) : await scratch.embedJpg(picture.bytes);
      await embedded.embed();
    } catch {
      embedded = null;
    }
  }
  if (embedded) {
    const copy = (scratchRef, extra = {}) => {
      const stream = scratch.context.lookup(scratchRef);
      const dict = stream.dict.clone(context);
      for (const [key, value] of Object.entries(extra)) dict.set(PDFName.of(key), value);
      dict.set(PDFName.of('Length'), PDFNumber.of(stream.contents.length));
      return { dict, stream: stream.contents };
    };
    const imageStream = scratch.context.lookup(embedded.ref);
    const maskRef = imageStream.dict.get(PDFName.of('SMask'));
    imageRef = newRef();
    if (maskRef instanceof PDFRef) {
      const newMaskRef = newRef();
      objects.push({ ref: imageRef, ...copy(embedded.ref, { SMask: newMaskRef }) });
      objects.push({ ref: newMaskRef, ...copy(maskRef) });
    } else {
      objects.push({ ref: imageRef, ...copy(embedded.ref) });
    }
  }

  // The signature's box on the page holds every mark, with a point to spare around them.
  const name = digitalId.name || 'the signer';
  const date = shownDate(signedAt);
  const placed = placeMarks(shown, font, { name, date });
  const box = [
    Math.min(...placed.map(mark => mark.left)) - 1,
    Math.min(...placed.map(mark => mark.bottom)) - 1,
    Math.max(...placed.map(mark => mark.right)) + 1,
    Math.max(...placed.map(mark => mark.top)) + 1
  ];
  const width = box[2] - box[0];
  const height = box[3] - box[1];
  const content = latin1(appearanceContent(placed, { x: box[0], y: box[1] }, { font, image: embedded, name, date }));
  const appearanceRef = newRef();
  objects.push({
    ref: appearanceRef,
    dict: `<< /Type /XObject /Subtype /Form /BBox [0 0 ${width.toFixed(2)} ${height.toFixed(2)}] /Resources << /Font << /F1 ${fontRef} >>${imageRef ? ` /XObject << /Im1 ${imageRef} >>` : ''} >> /Length ${content.length} >>`,
    stream: content
  });

  // The signature itself: its /ByteRange and /Contents are filled in once the file is laid out.
  const signatureRef = newRef();
  const byteRangePlaceholder = `[0 ${'0'.padEnd(BYTE_RANGE_WIDTH)} ${'0'.padEnd(BYTE_RANGE_WIDTH)} ${'0'.padEnd(BYTE_RANGE_WIDTH)}]`;
  const contentsPlaceholder = `<${'0'.repeat(SIGNATURE_BYTES * 2)}>`;
  objects.push({
    ref: signatureRef,
    dict: `<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange ${byteRangePlaceholder} /Contents ${contentsPlaceholder} /M (${pdfDate(signedAt)}) /Name (${pdfText(name)})${reason ? ` /Reason (${pdfText(reason)})` : ''}${location ? ` /Location (${pdfText(location)})` : ''} >>`,
    signature: true
  });

  // The signature field and its box on the page.
  const acroFormEntry = catalog.get(PDFName.of('AcroForm'));
  const acroForm = acroFormEntry ? context.lookup(acroFormEntry, PDFDict) : null;
  const taken = fieldNames(context, acroForm);
  let uniqueName = fieldName;
  for (let count = 2; taken.has(uniqueName); count += 1) uniqueName = `${fieldName} ${count}`;
  const widgetRef = newRef();
  objects.push({
    ref: widgetRef,
    dict: `<< /Type /Annot /Subtype /Widget /FT /Sig /T (${pdfText(uniqueName)}) /V ${signatureRef} /F 132 /Rect [${box.map(value => value.toFixed(2)).join(' ')}] /P ${page.ref} /AP << /N ${appearanceRef} >> >>`
  });

  // The page lists the box among its annotations.
  const annotsEntry = page.node.get(PDFName.of('Annots'));
  if (annotsEntry instanceof PDFRef) {
    const annots = context.lookup(annotsEntry, PDFArray).clone(context);
    annots.push(widgetRef);
    objects.push({ ref: annotsEntry, dict: annots.toString() });
  } else {
    const pageDict = page.node.clone(context);
    const annots = annotsEntry instanceof PDFArray ? annotsEntry.clone(context) : context.obj([]);
    annots.push(widgetRef);
    pageDict.set(PDFName.of('Annots'), annots);
    objects.push({ ref: page.ref, dict: pageDict.toString() });
  }

  // The form lists the field and says it holds signatures (SigFlags 3: signed, append only).
  const formDict = acroForm ? acroForm.clone(context) : context.obj({});
  const fieldsEntry = formDict.get(PDFName.of('Fields'));
  if (fieldsEntry instanceof PDFRef) {
    const fields = context.lookup(fieldsEntry, PDFArray).clone(context);
    fields.push(widgetRef);
    objects.push({ ref: fieldsEntry, dict: fields.toString() });
  } else {
    const fields = fieldsEntry instanceof PDFArray ? fieldsEntry.clone(context) : context.obj([]);
    fields.push(widgetRef);
    formDict.set(PDFName.of('Fields'), fields);
  }
  formDict.set(PDFName.of('SigFlags'), PDFNumber.of(3));
  if (acroFormEntry instanceof PDFRef) {
    objects.push({ ref: acroFormEntry, dict: formDict.toString() });
  } else {
    const formRef = newRef();
    objects.push({ ref: formRef, dict: formDict.toString() });
    const catalogDict = catalog.clone(context);
    catalogDict.set(PDFName.of('AcroForm'), formRef);
    objects.push({ ref: catalogRef, dict: catalogDict.toString() });
  }

  // The update: the objects, then a cross-reference section like the file's own (a table, or a
  // stream), pointing back to the previous one.
  const parts = [original, latin1('\n')];
  let length = original.length + 1;
  const offsets = new Map();
  let signatureAt = -1;
  const write = chunk => {
    parts.push(chunk);
    length += chunk.length;
  };
  for (const object of objects) {
    offsets.set(object.ref, length);
    const head = `${object.ref.objectNumber} ${object.ref.generationNumber} obj\n`;
    const dict = typeof object.dict === 'string' ? object.dict : object.dict.toString();
    if (object.signature) signatureAt = length + head.length;
    write(latin1(`${head}${dict}\n`));
    if (object.stream) {
      write(latin1('stream\n'));
      write(object.stream);
      write(latin1('\nendstream\n'));
    }
    write(latin1('endobj\n'));
  }

  const trailerEntries = [`/Root ${catalogRef}`];
  if (trailer.Info) trailerEntries.push(`/Info ${trailer.Info}`);
  if (trailer.ID) trailerEntries.push(`/ID ${trailer.ID.toString()}`);
  trailerEntries.push(`/Prev ${xref.offset}`);
  const entries = [...offsets.entries()].map(([ref, offset]) => ({ number: ref.objectNumber, generation: ref.generationNumber, offset }));
  const runsOf = list => {
    const sorted = [...list].sort((a, b) => a.number - b.number);
    const runs = [];
    for (const entry of sorted) {
      const run = runs[runs.length - 1];
      if (run && run.start + run.items.length === entry.number) run.items.push(entry);
      else runs.push({ start: entry.number, items: [entry] });
    }
    return runs;
  };
  if (xref.kind === 'table') {
    const xrefAt = length;
    const table = runsOf(entries).map(run => `${run.start} ${run.items.length}\n${run.items.map(item => `${String(item.offset).padStart(10, '0')} ${String(item.generation).padStart(5, '0')} n\r\n`).join('')}`).join('');
    write(latin1(`xref\n${table}trailer\n<< /Size ${nextNumber} ${trailerEntries.join(' ')} >>\nstartxref\n${xrefAt}\n%%EOF\n`));
  } else {
    const xrefRef = newRef();
    const xrefAt = length;
    const all = [...entries, { number: xrefRef.objectNumber, generation: 0, offset: xrefAt }];
    const runs = runsOf(all);
    const data = new Uint8Array(runs.reduce((sum, run) => sum + run.items.length, 0) * 7);
    let at = 0;
    for (const run of runs) {
      for (const item of run.items) {
        data[at] = 1;
        data[at + 1] = (item.offset >>> 24) & 0xff;
        data[at + 2] = (item.offset >>> 16) & 0xff;
        data[at + 3] = (item.offset >>> 8) & 0xff;
        data[at + 4] = item.offset & 0xff;
        data[at + 5] = (item.generation >>> 8) & 0xff;
        data[at + 6] = item.generation & 0xff;
        at += 7;
      }
    }
    const index = runs.map(run => `${run.start} ${run.items.length}`).join(' ');
    write(latin1(`${xrefRef.objectNumber} 0 obj\n<< /Type /XRef /Size ${nextNumber} /W [1 4 2] /Index [${index}] ${trailerEntries.join(' ')} /Length ${data.length} >>\nstream\n`));
    write(data);
    write(latin1(`\nendstream\nendobj\nstartxref\n${xrefAt}\n%%EOF\n`));
  }
  const signed = concat(parts);

  // Fill in the byte range: everything but the signature's /Contents.
  const sigText = toBinary(signed.subarray(signatureAt, signatureAt + 400));
  const rangeAt = signatureAt + sigText.indexOf(byteRangePlaceholder);
  const contentsStart = signatureAt + sigText.indexOf('/Contents <') + '/Contents '.length;
  const contentsEnd = contentsStart + contentsPlaceholder.length;
  const range = [0, contentsStart, contentsEnd, signed.length - contentsEnd];
  signed.set(latin1(`[0 ${range.slice(1).map(value => String(value).padEnd(BYTE_RANGE_WIDTH)).join(' ')}]`), rangeAt);

  // The signature (CMS, detached, SHA-256) over those bytes, written into /Contents.
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(toBinary(concat([signed.subarray(0, contentsStart), signed.subarray(contentsEnd)])));
  p7.addCertificate(digitalId.certificate);
  digitalId.chain.forEach(cert => p7.addCertificate(cert));
  p7.addSigner({
    key: digitalId.key,
    certificate: digitalId.certificate,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: signedAt }
    ]
  });
  p7.sign({ detached: true });
  const hex = forge.util.bytesToHex(forge.asn1.toDer(p7.toAsn1()).getBytes());
  if (hex.length > SIGNATURE_BYTES * 2) throw new DigitalIdError('This digital ID\'s certificates are too large to fit in the form.');
  signed.set(latin1(hex), contentsStart + 1);
  return signed;
};

// The signature's place for pdf-lib's drawSignature spots ({ center, bottom, width, height }) as
// a [left, bottom, right, top] rectangle.
export const rectOfSpot = ({ center, bottom, width, height }) => [center - width / 2, bottom, center + width / 2, bottom + height];

// A form's marks (see placeMarks), from its own `marks` or its one signature `spot`.
export const marksOfForm = ({ marks, spot }) => (marks?.length ? marks : spot ? [{ type: 'signature', ...spot }] : []);
