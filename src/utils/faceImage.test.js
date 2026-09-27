import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeFaceImage } from './faceImage.js';

test('compresses biometric images below the configured binary payload budget', () => {
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement() {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage() {} }),
        toDataURL(_type, quality) {
          const encodedLength = Math.ceil(canvas.width * canvas.height * quality * 4 / 3);
          return `data:image/jpeg;base64,${'A'.repeat(encodedLength)}`;
        }
      };
      return canvas;
    }
  };

  try {
    const image = encodeFaceImage({ width: 1600, height: 900 }, 1280, 0.78, 500_000);
    const base64 = image.slice(image.indexOf(',') + 1);
    assert.ok(Math.floor(base64.length * 3 / 4) <= 500_000);
  } finally {
    globalThis.document = originalDocument;
  }
});
