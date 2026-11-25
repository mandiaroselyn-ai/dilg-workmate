import assert from 'node:assert/strict';
import test from 'node:test';
import { blackInkPixels, inkBounds } from './signatureInk.js';

test('the signature is cut to its ink, with a little to spare', () => {
  // A 10 x 6 picture with ink from (3, 2) to (6, 3), and one faint speck that does not count.
  const width = 10;
  const height = 6;
  const data = new Uint8ClampedArray(width * height * 4);
  const ink = (x, y, alpha = 255) => { data[(y * width + x) * 4 + 3] = alpha; };
  ink(3, 2);
  ink(6, 3);
  ink(9, 5, 20);
  assert.deepEqual(inkBounds(data, width, height, 1), { x: 2, y: 1, width: 6, height: 4 });
  assert.equal(inkBounds(new Uint8ClampedArray(16), 2, 2), null);
});

const pixel = (r, g, b, a = 255) => blackInkPixels(new Uint8ClampedArray([r, g, b, a]));

test('a signature becomes black ink, and its paper disappears', () => {
  // Blue or black ink stays solid, and turns black.
  assert.deepEqual([...pixel(18, 32, 104)], [0, 0, 0, 255]);
  assert.deepEqual([...pixel(0, 0, 0)], [0, 0, 0, 255]);
  // White or light paper is cleared.
  assert.equal(pixel(255, 255, 255)[3], 0);
  assert.equal(pixel(235, 232, 225)[3], 0);
  // A clear background stays clear.
  assert.equal(pixel(18, 32, 104, 0)[3], 0);
  // The soft edge of a stroke stays soft.
  const edge = pixel(18, 32, 104, 128)[3];
  assert.ok(edge > 100 && edge < 140);
});
