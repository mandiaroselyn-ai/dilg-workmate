import { DOCUMENT_FILE_TYPES, MAX_DOCUMENT_BYTES } from '../../shared/documentCatalog';
import { apiFetch } from './api';

// Files the app opens in the browser. Anything else (for example, a Word file attached to
// a leave request) is only downloaded, so it never runs as a page inside the app.
const VIEWABLE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const isPdf = type => type === 'application/pdf';
export const isViewable = type => VIEWABLE_TYPES.includes(type);

export const formatFileSize = bytes => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

// Why a chosen file cannot be uploaded as a document, or '' when it can.
export const documentFileProblem = file => {
  if (!file) return 'Choose a file to upload.';
  if (!DOCUMENT_FILE_TYPES.includes(file.type)) return 'Upload a PDF, JPEG, or PNG file.';
  if (file.size > MAX_DOCUMENT_BYTES) return `The file is larger than ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB. Scan it at a lower resolution and try again.`;
  return '';
};

export const readFileAsDataUrl = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Unable to read the selected file.'));
  reader.readAsDataURL(file);
});

// The bytes and type of a data URL ("data:application/pdf;base64,...").
export const dataUrlToFile = dataUrl => {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl || '');
  if (!match) throw new Error('This file could not be read.');
  const [, type, isBase64, data] = match;
  const binary = isBase64 ? atob(data) : decodeURIComponent(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { type: type || 'application/octet-stream', bytes };
};

// A link to the bytes that opens them only as a viewable type, and as a plain download
// otherwise.
export const objectUrlFor = (bytes, type) => URL.createObjectURL(new Blob([bytes], {
  type: isViewable(type) ? type : 'application/octet-stream'
}));

export const downloadBytes = (bytes, fileName, type) => {
  const url = objectUrlFor(bytes, type);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || 'document';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Loads a stored document's file: { fileName, fileType, bytes }.
export const loadDocumentFile = async id => {
  const response = await apiFetch(`/api/documents/${encodeURIComponent(id)}/file`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'Unable to open this document.');
  const { bytes } = dataUrlToFile(data.dataUrl);
  return { fileName: data.fileName, fileType: data.fileType, bytes };
};
