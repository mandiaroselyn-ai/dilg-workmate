import { PDFDocument } from 'pdf-lib';
import { apiFetch } from './api';
import { MAX_SIGNED_PDF_BYTES, markerKindOf, signedFormMarker } from '../../shared/signedForms';

// Forms signed in Adobe (see shared/signedForms.js): WorkMate makes the PDF to sign, the signer
// signs it in Adobe Acrobat, and uploads it back; the upload is the official signed copy.

// The form WorkMate made, tagged so the server can match the signed upload to it. Saved without
// compressed object streams, so the tag stays readable in the file after Adobe signs it.
export const stampForSigning = async (bytes, kind, ref) => {
  const pdf = await PDFDocument.load(bytes);
  pdf.setKeywords([signedFormMarker(markerKindOf(kind), ref)]);
  pdf.setProducer('DILG WorkMate');
  return pdf.save({ useObjectStreams: false });
};

const fromBase64 = base64 => Uint8Array.from(atob(base64), char => char.charCodeAt(0));

// The signed PDF of `kind` for `ref` ({ fileName, bytes, uploadedBy, uploadedAt, signatures }),
// or null when there is none (or this person may not see it).
export const fetchSignedForm = async (kind, ref) => {
  const response = await apiFetch(`/api/signed-documents?kind=${encodeURIComponent(kind)}&ref=${encodeURIComponent(ref)}`);
  if (response.status === 404) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.document) throw new Error(data.error || 'Unable to open the signed form.');
  const { data: base64, ...note } = data.document;
  return { ...note, bytes: fromBase64(base64) };
};

// The first of `kinds` that has a signed copy for `ref`, or null.
export const firstSignedForm = async (kinds, ref) => {
  for (const kind of kinds) {
    const found = await fetchSignedForm(kind, ref).catch(() => null);
    if (found) return found;
  }
  return null;
};

const readAsBase64 = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
  reader.onerror = () => reject(new Error('Unable to read the file.'));
  reader.readAsDataURL(file);
});

// Why `file` cannot be uploaded as a signed form, or ''.
export const signedFileProblem = file => {
  if (!file) return 'Choose the signed PDF first.';
  if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return 'Choose a PDF file.';
  if (file.size > MAX_SIGNED_PDF_BYTES) return 'The signed PDF is too large (3 MB at most).';
  return '';
};

// Uploads a signed PDF: { kind, ref, file, decision?, remarks? }. Returns the server's answer
// ({ request } or { submission }), or throws with its message.
export const uploadSignedForm = async ({ kind, ref, file, decision, remarks }) => {
  const problem = signedFileProblem(file);
  if (problem) throw new Error(problem);
  const response = await apiFetch('/api/signed-documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, ref, fileName: file.name, data: await readAsBase64(file), decision, remarks })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'Unable to upload the signed PDF.');
  return data;
};

// "Signed in Adobe by NAME on Nov 12, 2026" for a request's or DTR's note of a signed form.
export const signedNoteText = note => {
  if (!note) return '';
  const when = note.uploadedAt ? new Date(note.uploadedAt).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }) : '';
  return `Signed in Adobe by ${note.uploadedBy || 'the signer'}${when ? ` on ${when}` : ''}`;
};
