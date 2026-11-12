import { apiFetch } from './api';
import { MAX_TRAVEL_DOCUMENT_BYTES, TRAVEL_DOCUMENT_TYPES } from '../../shared/travelDocuments';

// The Post Activity Reports and Certificates of Appearance attached to an approved Travel Order
// (shared/travelDocuments.js).

const fromBase64 = base64 => Uint8Array.from(atob(base64), char => char.charCodeAt(0));
const readAsBase64 = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
  reader.onerror = () => reject(new Error('Unable to read the file.'));
  reader.readAsDataURL(file);
});

// Why `file` cannot be uploaded, or ''.
export const travelFileProblem = file => {
  if (!file) return 'Choose the file first.';
  if (file.type && !TRAVEL_DOCUMENT_TYPES[file.type]) return 'Upload a PDF, JPG, or PNG file.';
  if (file.size > MAX_TRAVEL_DOCUMENT_BYTES) return 'The file is too large (3 MB at most). Scan or photograph it at a lower resolution.';
  return '';
};

// One uploaded file, as the document viewer opens it: { fileName, fileType, bytes }.
export const fetchTravelDocument = async (ref, id) => {
  const response = await apiFetch(`/api/travel-documents?ref=${encodeURIComponent(ref)}&id=${encodeURIComponent(id)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.document) throw new Error(data.error || 'Unable to open the document.');
  return { fileName: data.document.fileName, fileType: data.document.mimeType, bytes: fromBase64(data.document.data) };
};

// Attaches a report or certificate: { ref, file, kind ('report' or 'certificate') }. Returns the
// Travel Order as saved.
export const uploadTravelDocument = async ({ ref, file, kind }) => {
  const problem = travelFileProblem(file);
  if (problem) throw new Error(problem);
  const response = await apiFetch('/api/travel-documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref, kind, fileName: file.name, data: await readAsBase64(file) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.request) throw new Error(data.error || 'Unable to upload the file.');
  return data.request;
};

// Removes a file the employee uploaded. Returns the Travel Order as saved.
export const removeTravelDocument = async (ref, id) => {
  const response = await apiFetch(`/api/travel-documents?ref=${encodeURIComponent(ref)}&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.request) throw new Error(data.error || 'Unable to remove the file.');
  return data.request;
};
