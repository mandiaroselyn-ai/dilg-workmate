import { createRequire } from 'node:module';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

const require = createRequire(import.meta.url);
const FACE_DESCRIPTOR_LENGTH = 128;
// A selfie matches the enrollment selfie at this distance or closer. face-api's usual 0.6 lets
// some look-alikes pass, so it is tightened a little; HR sees each punch's distance in DTR
// Records, so it can be tightened further once real punches show how close staff selfies are.
export const FACE_MATCH_DISTANCE_THRESHOLD = 0.55;
// The head-turn check before a selfie (see checkHeadTurn): the second photo must be the same
// face as the selfie, turned the way the server asked by at least this much (see headTurnOf).
export const HEAD_TURN_SAME_FACE_THRESHOLD = 0.6;
export const HEAD_TURN_MIN_CHANGE = 0.25;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 4_000_000;
const MODEL_DIRECTORY = path.resolve(
  path.dirname(require.resolve('@vladmandic/face-api')),
  '../model'
);

let faceApiPromise;

export class FaceImageError extends Error {
  constructor(message, statusCode = 422) {
    super(message);
    this.name = 'FaceImageError';
    this.statusCode = statusCode;
  }
}

export class FaceMatchingServiceError extends Error {
  constructor(message = 'Face matching is temporarily unavailable. Try again later.') {
    super(message);
    this.name = 'FaceMatchingServiceError';
    this.statusCode = 503;
  }
}

export const isValidFaceDescriptor = descriptor => (
  Array.isArray(descriptor)
  && descriptor.length === FACE_DESCRIPTOR_LENGTH
  && descriptor.every(value => Number.isFinite(value))
);

export const compareFaceDescriptors = (enrollmentDescriptor, attendanceDescriptor) => {
  if (!isValidFaceDescriptor(enrollmentDescriptor) || !isValidFaceDescriptor(attendanceDescriptor)) {
    throw new TypeError('Face descriptors must each contain 128 finite numbers.');
  }

  const squaredDistance = enrollmentDescriptor.reduce((sum, value, index) => (
    sum + (value - attendanceDescriptor[index]) ** 2
  ), 0);
  const distance = Math.sqrt(squaredDistance);
  return {
    distance,
    matched: distance <= FACE_MATCH_DISTANCE_THRESHOLD
  };
};

const getFaceApi = async () => {
  if (!faceApiPromise) {
    faceApiPromise = (async () => {
      try {
        const Module = require('node:module');
        const originalLoad = Module._load;
        const tf = require('@tensorflow/tfjs');
        let faceApi;

        try {
          Module._load = function loadWithPortableTensorFlow(request, parent, isMain) {
            if (request === '@tensorflow/tfjs-node') return tf;
            return originalLoad.call(this, request, parent, isMain);
          };
          faceApi = require('@vladmandic/face-api');
        } finally {
          Module._load = originalLoad;
        }

        await faceApi.tf.setBackend('cpu');
        await faceApi.tf.ready();
        await Promise.all([
          faceApi.nets.tinyFaceDetector.loadFromDisk(MODEL_DIRECTORY),
          faceApi.nets.faceLandmark68Net.loadFromDisk(MODEL_DIRECTORY),
          faceApi.nets.faceRecognitionNet.loadFromDisk(MODEL_DIRECTORY)
        ]);
        return faceApi;
      } catch (error) {
        faceApiPromise = null;
        console.error('Unable to initialize the local face matching model:', error);
        throw new FaceMatchingServiceError();
      }
    })();
  }
  return faceApiPromise;
};

const decodeImage = (dataUrl, tf) => {
  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUrl);
  if (!match) {
    throw new FaceImageError('Use a valid JPEG or PNG selfie image.');
  }
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
    throw new FaceImageError('The selfie image is empty or too large. Retake it and try again.', 413);
  }

  let decoded;
  try {
    if (match[1].toLowerCase() === 'jpeg') {
      decoded = jpeg.decode(bytes, {
        useTArray: true,
        maxResolutionInMP: MAX_IMAGE_PIXELS / 1_000_000
      });
    } else {
      if (bytes.length < 24) throw new Error('PNG header is incomplete.');
      const width = bytes.readUInt32BE(16);
      const height = bytes.readUInt32BE(20);
      if (!width || !height || width * height > MAX_IMAGE_PIXELS) {
        throw new FaceImageError('The selfie image dimensions are too large. Retake it at a lower resolution.', 413);
      }
      decoded = PNG.sync.read(bytes);
    }
  } catch (error) {
    if (error instanceof FaceImageError) throw error;
    throw new FaceImageError('The selfie image could not be decoded. Choose or capture a valid JPEG or PNG.');
  }

  const { width, height, data } = decoded;
  if (!width || !height || width * height > MAX_IMAGE_PIXELS) {
    throw new FaceImageError('The selfie image dimensions are too large. Retake it at a lower resolution.', 413);
  }

  const rgb = new Uint8Array(width * height * 3);
  for (let source = 0, target = 0; source < data.length; source += 4) {
    rgb[target++] = data[source];
    rgb[target++] = data[source + 1];
    rgb[target++] = data[source + 2];
  }
  return tf.tensor3d(rgb, [height, width, 3], 'int32');
};

// How far a face is turned, from -1 to 1, from its 68 face-api landmarks: where the nose tip
// (point 30) sits between the two sides of the jaw (points 0 and 16) in the image. 0 is
// straight on; below 0 the nose points toward the image's left, above 0 toward its right. A
// flat photo tilted in front of the camera keeps about the same value, since tilting squeezes
// both sides alike; a real head turning changes it.
export const headTurnOf = positions => {
  const [jawStart, jawEnd, noseTip] = [positions?.[0], positions?.[16], positions?.[30]];
  if (![jawStart, jawEnd, noseTip].every(point => Number.isFinite(point?.x))) return 0;
  const toLeft = noseTip.x - Math.min(jawStart.x, jawEnd.x);
  const toRight = Math.max(jawStart.x, jawEnd.x) - noseTip.x;
  const width = toLeft + toRight;
  return width > 0 ? (toLeft - toRight) / width : 0;
};

// mirrored: reads the image flipped left to right.
export const createFaceDescriptor = async (dataUrl, options) => (await analyzeFace(dataUrl, options)).descriptor;

// The one face in a selfie: its descriptor (for matching) and how far it is turned (headTurnOf).
// mirrored: reads the image flipped left to right. largest: for a photo of an ID card, which
// may also print a small faint copy of the face, the largest face is read instead of refusing
// a photo with more than one.
export const analyzeFace = async (dataUrl, { mirrored = false, largest = false } = {}) => {
  if (typeof dataUrl !== 'string') {
    throw new FaceImageError('A selfie image is required.');
  }
  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUrl);
  if (!match) throw new FaceImageError('Use a valid JPEG or PNG selfie image.');
  if (match[2].length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4) {
    throw new FaceImageError('The selfie image is empty or too large. Retake it and try again.', 413);
  }

  const faceApi = await getFaceApi();
  let image;
  try {
    image = decodeImage(dataUrl, faceApi.tf);
    if (mirrored) {
      const original = image;
      image = faceApi.tf.reverse(original, 1);
      original.dispose();
    }
    const detections = await faceApi
      .detectAllFaces(image, new faceApi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (detections.length === 0) {
      throw new FaceImageError('No face was detected. Retake the selfie with your face clearly visible.');
    }
    if (detections.length !== 1 && !largest) {
      throw new FaceImageError('More than one face was detected. Retake the selfie with only the employee in frame.');
    }
    const area = found => (found.detection?.box?.width || 0) * (found.detection?.box?.height || 0);
    const face = detections.reduce((biggest, found) => (area(found) > area(biggest) ? found : biggest));
    const [height, width] = image.shape;
    // Averaged as decimals: summing a large photo's whole numbers could overflow.
    const brightness = faceApi.tf.tidy(() => image.toFloat().mean().dataSync()[0]);
    const detection = face.detection;
    return {
      descriptor: Array.from(face.descriptor),
      turn: headTurnOf(face.landmarks?.positions),
      // For the enrollment selfie's quality check (see enrollmentSelfieProblem): how sure the
      // detector is that it is a face, how wide the face is next to the photo's shorter side,
      // and how bright the photo is (0 to 255).
      score: Number(detection?.score) || 0,
      faceShare: Number(detection?.box?.width) / Math.min(width, height) || 0,
      brightness: Number(brightness) || 0
    };
  } catch (error) {
    if (error instanceof FaceImageError) throw error;
    console.error('Local face image processing failed:', error);
    throw new FaceMatchingServiceError('Unable to process the selfie right now. Retake it and try again.');
  } finally {
    image?.dispose();
  }
};

// Compares an attendance selfie with the enrollment selfie. The result also has `face`, the
// selfie's own analysis (see analyzeFace), for the head-turn check.
export const compareEnrollmentToAttendance = async (enrollmentDescriptor, attendanceImage) => {
  if (!isValidFaceDescriptor(enrollmentDescriptor)) {
    throw new FaceMatchingServiceError('No approved biometric face template is available. Please contact HR to complete or repeat enrollment.');
  }
  const face = await analyzeFace(attendanceImage);
  const result = { ...compareFaceDescriptors(enrollmentDescriptor, face.descriptor), face };
  if (result.matched) return result;
  // Selfies are saved as the mirror image the employee saw on screen, but enrollment
  // selfies saved before that were not, so a selfie that does not match is also compared
  // flipped back.
  try {
    const mirrored = compareFaceDescriptors(enrollmentDescriptor, await createFaceDescriptor(attendanceImage, { mirrored: true }));
    return mirrored.distance < result.distance ? { ...mirrored, face } : result;
  } catch (error) {
    if (error instanceof FaceImageError) return result;
    throw error;
  }
};

// Whether a head turn (`turnFace`, from the photo taken right after the selfie) shows the same
// face as the selfie (`selfieFace`), turned toward `direction` ('left' or 'right' of the saved
// image, which is the mirror image the employee saw, so the side the on-screen arrow points
// to) by at least HEAD_TURN_MIN_CHANGE. Returns { passed, reason, change, sameFaceDistance }.
export const judgeHeadTurn = ({ selfieFace, turnFace, direction }) => {
  const sameFaceDistance = compareFaceDescriptors(selfieFace.descriptor, turnFace.descriptor).distance;
  const change = turnFace.turn - selfieFace.turn;
  if (sameFaceDistance > HEAD_TURN_SAME_FACE_THRESHOLD) return { passed: false, reason: 'different-face', change, sameFaceDistance };
  const towardAsked = direction === 'left' ? -change : change;
  if (towardAsked < HEAD_TURN_MIN_CHANGE) return { passed: false, reason: 'no-turn', change, sameFaceDistance };
  return { passed: true, reason: '', change, sameFaceDistance };
};

// The enrollment selfie is what every attendance selfie is matched with, so a far, unclear, or
// dark one is refused and retaken. The limits are kept loose (a usual arm's-length selfie has
// the face about 35-50% of the photo's width); they only stop selfies that would make Time In
// fail. Returns what to fix, or '' when the selfie is usable.
export const ENROLLMENT_SELFIE_MIN_SCORE = 0.6;
export const ENROLLMENT_SELFIE_MIN_FACE_SHARE = 0.2;
export const ENROLLMENT_SELFIE_MIN_BRIGHTNESS = 60;
export const enrollmentSelfieProblem = ({ score, faceShare, brightness }) => {
  if (brightness < ENROLLMENT_SELFIE_MIN_BRIGHTNESS) return 'The selfie is too dark. Face a window or a light, then take it again.';
  if (faceShare < ENROLLMENT_SELFIE_MIN_FACE_SHARE) return 'Your face is too small in the selfie. Hold the phone closer so your face fills the oval, then take it again.';
  if (score < ENROLLMENT_SELFIE_MIN_SCORE) return 'Your face is not clear in the selfie. Hold the phone steady in good light, without a cap, sunglasses, or face mask, then take it again.';
  return '';
};

// The head turn after the enrollment selfie: the same face turned to either side (the phone's
// own camera may save the photo mirrored or not, so the side is not asked). A flat photo held
// up to the camera cannot do it. Returns { passed, reason, change, sameFaceDistance }.
export const judgeEnrollmentHeadTurn = ({ selfieFace, turnFace }) => {
  const toward = turnFace.turn >= selfieFace.turn ? 'right' : 'left';
  return judgeHeadTurn({ selfieFace, turnFace, direction: toward });
};

// How close the face on the ID photo is to the enrollment selfie, to help HR compare them
// (null when no clear face is found on the ID). It is only an aid: an old or small ID photo can
// be far from a real match, so HR still decides by looking. The selfie may be saved mirrored,
// so it is also compared flipped, and the closer result is kept.
export const compareIdPhotoToSelfie = async ({ idImage, selfieImage, selfieFace }) => {
  let idFace;
  try {
    idFace = await analyzeFace(idImage, { largest: true });
  } catch (error) {
    if (error instanceof FaceImageError) return null;
    throw error;
  }
  let { distance } = compareFaceDescriptors(idFace.descriptor, selfieFace.descriptor);
  try {
    const flipped = await analyzeFace(selfieImage, { mirrored: true });
    distance = Math.min(distance, compareFaceDescriptors(idFace.descriptor, flipped.descriptor).distance);
  } catch (error) {
    if (!(error instanceof FaceImageError)) throw error;
  }
  return Math.round(distance * 1000) / 1000;
};

// Checks the head-turn photo against the selfie's analysis (see judgeHeadTurn). A photo with
// no single clear face throws FaceImageError.
export const checkHeadTurn = async ({ selfieFace, turnImage, direction }) => (
  judgeHeadTurn({ selfieFace, turnFace: await analyzeFace(turnImage), direction })
);
