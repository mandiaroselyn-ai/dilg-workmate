// A signature as it goes on a signed form: black ink on a clear background, whatever ink color it
// was drawn or written in, and with the paper of a photographed or scanned signature taken away.

// The widest a signature is kept, in pixels (a phone photo is made smaller).
const MAX_WIDTH = 1200;

// Turns RGBA pixels (`data`, changed in place) into black ink: each pixel's opacity comes from how
// dark it was, so dark strokes stay solid, white or light paper disappears, and pale specks fade.
export const blackInkPixels = data => {
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    const lightness = (0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]) / 255;
    const darkness = Math.min(1, Math.max(0, (1 - lightness - 0.12) / 0.45));
    const ink = darkness * darkness * (3 - 2 * darkness);
    data[index] = 0;
    data[index + 1] = 0;
    data[index + 2] = 0;
    data[index + 3] = Math.round(255 * alpha * ink);
  }
  return data;
};

// The box around the ink in RGBA pixels `data` (`width` x `height`), with `pad` pixels to spare:
// { x, y, width, height }, or null when there is no ink. Faint specks do not count.
export const inkBounds = (data, width, height, pad = 4) => {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 40) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;
  const x = Math.max(0, left - pad);
  const y = Math.max(0, top - pad);
  return { x, y, width: Math.min(width, right + pad + 1) - x, height: Math.min(height, bottom + pad + 1) - y };
};

const loadImage = dataUrl => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('The signature picture could not be read.'));
  image.src = dataUrl;
});

// The signature (a data URL) in black ink, cut to the ink so it fills its place on the form, as a
// PNG data URL. In the browser only.
export const toBlackInk = async dataUrl => {
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_WIDTH / (image.naturalWidth || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  blackInkPixels(pixels.data);
  const box = inkBounds(pixels.data, canvas.width, canvas.height);
  if (!box) throw new Error('The signature picture has no ink. Draw it again, or upload a clearer picture.');
  const cut = document.createElement('canvas');
  cut.width = box.width;
  cut.height = box.height;
  context.putImageData(pixels, 0, 0);
  cut.getContext('2d').drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
  return cut.toDataURL('image/png');
};
