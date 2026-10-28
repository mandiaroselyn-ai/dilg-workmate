import { apiFetch } from './api';

// Files the app opens in the browser. Anything else (for example, a Word file attached to
// a leave request) is only downloaded, so it never runs as a page inside the app.
const VIEWABLE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const isPdf = type => type === 'application/pdf';
export const isViewable = type => VIEWABLE_TYPES.includes(type);

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

// Base64 of the bytes, a part at a time so a large file does not overflow the call stack.
const toBase64 = bytes => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let index = 0; index < view.length; index += 0x8000) {
    binary += String.fromCharCode(...view.subarray(index, index + 0x8000));
  }
  return window.btoa(binary);
};

// The WorkMate Android app downloads through the phone's download manager, which only fetches
// https links, not the page's own (blob:) links.
const inAndroidApp = () => Boolean(window.ReactNativeWebView);

// Saves the bytes as a file. A browser saves them from the page. In the Android app they go to
// the server for a few minutes, and the phone downloads them from there into Downloads.
export const downloadBytes = async (bytes, fileName, type) => {
  if (inAndroidApp()) {
    const response = await apiFetch('/api/downloads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: fileName || 'document', mimeType: type, data: toBase64(bytes) })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success || !data.url) {
      throw new Error(data.error || 'Unable to download the file. Check your internet connection and try again.');
    }
    const link = document.createElement('a');
    link.href = new URL(data.url, window.location.origin).href;
    link.click();
    return;
  }
  const url = objectUrlFor(bytes, type);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || 'document';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
