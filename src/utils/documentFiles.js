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

export const downloadBytes = (bytes, fileName, type) => {
  const url = objectUrlFor(bytes, type);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || 'document';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
