import { createRequire } from 'node:module';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

const require = createRequire(import.meta.url);
const FACE_DESCRIPTOR_LENGTH = 128;
export const FACE_MATCH_DISTANCE_THRESHOLD = 0.6;
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

export const createFaceDescriptor = async dataUrl => {
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
    const detections = await faceApi
      .detectAllFaces(image, new faceApi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (detections.length === 0) {
      throw new FaceImageError('No face was detected. Retake the selfie with your face clearly visible.');
    }
    if (detections.length !== 1) {
      throw new FaceImageError('More than one face was detected. Retake the selfie with only the employee in frame.');
    }
    return Array.from(detections[0].descriptor);
  } catch (error) {
    if (error instanceof FaceImageError) throw error;
    console.error('Local face image processing failed:', error);
    throw new FaceMatchingServiceError('Unable to process the selfie right now. Retake it and try again.');
  } finally {
    image?.dispose();
  }
};

export const compareEnrollmentToAttendance = async (enrollmentDescriptor, attendanceImage) => {
  if (!isValidFaceDescriptor(enrollmentDescriptor)) {
    throw new FaceMatchingServiceError('No approved biometric face template is available. Please contact HR to complete or repeat enrollment.');
  }
  const attendanceDescriptor = await createFaceDescriptor(attendanceImage);
  return compareFaceDescriptors(enrollmentDescriptor, attendanceDescriptor);
};
