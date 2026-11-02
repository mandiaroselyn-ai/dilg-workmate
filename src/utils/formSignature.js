import { StandardFonts, rgb } from 'pdf-lib';

const INK = { black: rgb(0, 0, 0), blue: rgb(0.11, 0.3, 0.85), red: rgb(0.75, 0.1, 0.1) };
const PNG_PREFIX = 'data:image/png;base64,';

const pngBytes = dataUrl => {
  const base64 = dataUrl.slice(PNG_PREFIX.length);
  return typeof Buffer !== 'undefined'
    ? Buffer.from(base64, 'base64')
    : Uint8Array.from(atob(base64), character => character.charCodeAt(0));
};

// Draws the signature the Supervisor signed a request with (its supervisorSignature, as the
// Supervisor's screen saves it), centred on `center` with its bottom at `bottom`, within
// `width` x `height`: a drawn or uploaded image ("data:image/png;base64,..."), a typed name in
// italics ("type:Style:NAME"), or a stamp of initials ("stamp:INITIALS:color"). Returns false,
// drawing nothing, when there is no signature it can draw.
export const drawSignature = async (pdf, page, signature, { center, bottom, width, height }) => {
  const value = String(signature || '');
  if (value.startsWith(PNG_PREFIX)) {
    try {
      const image = await pdf.embedPng(pngBytes(value));
      const scale = Math.min(width / image.width, height / image.height);
      const drawnWidth = image.width * scale;
      page.drawImage(image, { x: center - drawnWidth / 2, y: bottom, width: drawnWidth, height: image.height * scale });
      return true;
    } catch {
      return false;
    }
  }
  if (value.startsWith('type:')) {
    const name = value.split(':').slice(2).join(':').trim();
    if (!name) return false;
    const font = await pdf.embedFont(StandardFonts.TimesRomanItalic);
    let size = 13;
    while (size > 7 && font.widthOfTextAtSize(name, size) > width) size -= 0.5;
    page.drawText(name, { x: center - font.widthOfTextAtSize(name, size) / 2, y: bottom + 3, size, font, color: INK.black });
    return true;
  }
  if (value.startsWith('stamp:')) {
    const [, initials = '', color = 'black'] = value.split(':');
    if (!initials) return false;
    const ink = INK[color] || INK.black;
    const font = await pdf.embedFont(StandardFonts.CourierBold);
    const size = 11;
    const textWidth = font.widthOfTextAtSize(initials, size);
    page.drawRectangle({ x: center - (textWidth + 8) / 2, y: bottom, width: textWidth + 8, height: 15, borderColor: ink, borderWidth: 0.8 });
    page.drawText(initials, { x: center - textWidth / 2, y: bottom + 4, size, font, color: ink });
    return true;
  }
  return false;
};
