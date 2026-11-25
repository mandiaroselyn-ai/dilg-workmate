import { apiFetch } from './api';

// The signer's own digital ID kept by WorkMate (see backend signingIdController): a PKCS #12 file
// locked with their signing password, which WorkMate cannot open.

const answer = async (response, fallback) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || fallback);
  return data;
};

const toBase64 = bytes => {
  let text = '';
  for (let index = 0; index < bytes.length; index += 8192) text += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(text);
};
const fromBase64 = base64 => Uint8Array.from(atob(base64), character => character.charCodeAt(0));

// { bytes, name, createdAt }, or null when the signer has none yet.
export const fetchSigningId = async () => {
  const { signingId } = await answer(await apiFetch('/api/signing-id'), 'Unable to load your digital ID.');
  return signingId?.data ? { bytes: fromBase64(signingId.data), name: signingId.name || '', createdAt: signingId.createdAt || null } : null;
};

export const keepSigningId = async ({ bytes, name }) => answer(await apiFetch('/api/signing-id', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: toBase64(bytes), name })
}), 'Unable to keep your digital ID.');

export const removeSigningId = async () => answer(await apiFetch('/api/signing-id', { method: 'DELETE' }), 'Unable to remove your digital ID.');
