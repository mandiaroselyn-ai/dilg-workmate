const encodedImageBytes = dataUrl => {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor(base64.length * 3 / 4) - padding;
};

export const encodeFaceImage = (source, maxDimension = 1280, quality = 0.78, maxBytes = 900 * 1024) => {
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
  const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
  const longestSide = Math.max(sourceWidth, sourceHeight);
  if (!longestSide) throw new Error('Unable to read this image. Choose another photo.');

  const initialScale = Math.min(1, maxDimension / longestSide);
  const qualities = [...new Set([quality, 0.68, 0.58, 0.48].filter(value => value <= quality))];
  for (let scale = initialScale; ; scale *= 0.85) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to process this image.');
    context.drawImage(source, 0, 0, canvas.width, canvas.height);

    for (const imageQuality of qualities) {
      const dataUrl = canvas.toDataURL('image/jpeg', imageQuality);
      if (encodedImageBytes(dataUrl) <= maxBytes) return dataUrl;
    }
    if (scale * longestSide < 640 || scale * 0.85 * longestSide < 640) break;
  }
  throw new Error('This photo is too large to upload clearly. Retake it closer to the ID with good lighting, then try again.');
};

export const resizeFaceImage = (file, maxDimension = 1280, quality = 0.78, maxBytes = 900 * 1024) => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    try {
      resolve(encodeFaceImage(image, maxDimension, quality, maxBytes));
    } catch (error) {
      reject(error);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error('Unable to read this image. Choose another photo.'));
  };
  image.src = objectUrl;
});