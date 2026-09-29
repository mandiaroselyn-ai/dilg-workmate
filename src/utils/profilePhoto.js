import { encodeFaceImage, resizeFaceImage } from './faceImage.js';

// Profile photos are shown as small avatars and are included with a user's details in
// many API responses, so they are stored as small JPEGs rather than full camera images.
const PROFILE_PHOTO_MAX_DIMENSION = 512;
const PROFILE_PHOTO_QUALITY = 0.82;
const PROFILE_PHOTO_MAX_BYTES = 200 * 1024;

export const resizeProfilePhoto = file => resizeFaceImage(
  file,
  PROFILE_PHOTO_MAX_DIMENSION,
  PROFILE_PHOTO_QUALITY,
  PROFILE_PHOTO_MAX_BYTES
);

export const encodeProfilePhoto = source => encodeFaceImage(
  source,
  PROFILE_PHOTO_MAX_DIMENSION,
  PROFILE_PHOTO_QUALITY,
  PROFILE_PHOTO_MAX_BYTES
);
