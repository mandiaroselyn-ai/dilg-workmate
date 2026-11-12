import crypto from 'crypto';
import { PDFDocument } from 'pdf-lib';
import { markerKindOf, signedFormMarker } from '../../../shared/signedForms.js';

// Checks on a PDF that was signed in Adobe and uploaded. They show that the file is the form
// WorkMate made, that it carries digital signatures, and that it kept everything signed before.
// They do not yet check who owns the certificate: that comes with PNPKI.

const text = bytes => Buffer.from(bytes).toString('latin1');

// How many digital signatures the PDF carries: each one has a /ByteRange of the bytes it covers.
export const countSignatures = bytes => (text(bytes).match(/\/ByteRange\s*\[\s*0\s+\d+\s+\d+\s+\d+\s*\]/g) || []).length;

// True when `bytes` still begins with every byte of `before`: a signature added in Adobe
// is appended to the file, so what was signed earlier is unchanged.
export const keepsEarlierBytes = (bytes, before) => {
  if (!before?.length || bytes.length <= before.length) return false;
  return Buffer.from(bytes).subarray(0, before.length).equals(Buffer.from(before));
};

export const sha256 = bytes => crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');

// The tag WorkMate wrote into the PDF (its keywords), or ''.
const readMarker = async bytes => {
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
    return String(pdf.getKeywords() || '');
  } catch {
    return '';
  }
};

// The tag as WorkMate writes it into the keywords: as text, or as UTF-16 hex.
const utf16Hex = value => `FEFF${[...value].map(char => char.charCodeAt(0).toString(16).padStart(4, '0')).join('')}`.toUpperCase();

// True when the PDF carries `marker`: in its keywords as they read now, or still in the bytes of
// the form as WorkMate made it (Adobe appends its changes, so the first version stays in the file).
const hasMarker = async (bytes, marker) => {
  const keywords = await readMarker(bytes);
  if (keywords.split(/[\s,;]+/).includes(marker)) return true;
  const raw = text(bytes);
  return raw.includes(`(${marker})`) || raw.toUpperCase().includes(`<${utf16Hex(marker)}>`);
};

// Why `bytes` cannot be taken as the signed form of `kind` and `ref`, or '' when it can.
// `before` is the signed file this one must build on (HR 2's, for the Head's signature on a leave).
export const signedPdfProblem = async (bytes, { kind, ref, minSignatures, before = null }) => {
  if (!bytes?.length || Buffer.from(bytes).subarray(0, 5).toString('latin1') !== '%PDF-') {
    return 'This is not a PDF file. Upload the PDF you signed in Adobe.';
  }
  const marker = signedFormMarker(markerKindOf(kind), ref);
  if (!(await hasMarker(bytes, marker))) {
    return 'This PDF is not the form WorkMate made for this request. Download the form from WorkMate, sign that file in Adobe, and upload it.';
  }
  if (countSignatures(bytes) < minSignatures) {
    return minSignatures > 1
      ? `This PDF is missing a digital signature. It needs ${minSignatures} signatures: the earlier one and yours. Sign it in Adobe with your digital ID, then save and upload it.`
      : 'This PDF has no digital signature. Sign it in Adobe with your digital ID, then save and upload it.';
  }
  if (before && !keepsEarlierBytes(bytes, before)) {
    return 'This PDF changed what was already signed. Download the signed form from WorkMate again, add only your signature in Adobe, and upload it.';
  }
  return '';
};
