export const resizeFaceImage = (file, maxDimension = 1280, quality = 0.85) => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    try {
      const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
      if (!longestSide) throw new Error('Unable to read this image. Choose another photo.');
      const scale = Math.min(1, maxDimension / longestSide);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to process this image.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
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