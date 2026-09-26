import {
  CreateCollectionCommand,
  IndexFacesCommand,
  RekognitionClient,
  SearchFacesByImageCommand
} from '@aws-sdk/client-rekognition';

const getConfig = () => ({
  region: process.env.AWS_REGION,
  collectionId: process.env.AWS_REKOGNITION_COLLECTION_ID || 'dilg-workmate-employees',
  threshold: Number(process.env.AWS_FACE_MATCH_THRESHOLD || 90)
});

const getClient = () => {
  const { region } = getConfig();
  if (!region || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS Rekognition is not configured. Set AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.');
  }
  return new RekognitionClient({ region });
};

export const imageDataToBytes = (value) => {
  const encoded = value?.toString().replace(/^data:image\/[^;]+;base64,/, '');
  if (!encoded) throw new Error('A base64 selfie image is required.');
  return Buffer.from(encoded, 'base64');
};

export const ensureFaceCollection = async () => {
  const client = getClient();
  const { collectionId } = getConfig();
  try {
    await client.send(new CreateCollectionCommand({ CollectionId: collectionId }));
  } catch (error) {
    if (error.name !== 'ResourceAlreadyExistsException') throw error;
  }
  return collectionId;
};

export const enrollFace = async ({ employeeId, image }) => {
  const client = getClient();
  const { collectionId } = getConfig();
  await ensureFaceCollection();
  const response = await client.send(new IndexFacesCommand({
    CollectionId: collectionId,
    Image: { Bytes: imageDataToBytes(image) },
    ExternalImageId: employeeId,
    MaxFaces: 1,
    QualityFilter: 'AUTO',
    DetectionAttributes: []
  }));
  const face = response.FaceRecords?.[0]?.Face;
  if (!face?.FaceId) throw new Error('No usable face was detected in the enrollment image.');
  return { faceId: face.FaceId, externalImageId: face.ExternalImageId || employeeId };
};

export const verifyFace = async ({ employeeId, image }) => {
  const client = getClient();
  const { collectionId, threshold } = getConfig();
  const response = await client.send(new SearchFacesByImageCommand({
    CollectionId: collectionId,
    Image: { Bytes: imageDataToBytes(image) },
    FaceMatchThreshold: threshold,
    MaxFaces: 5,
    QualityFilter: 'AUTO'
  }));
  const match = response.FaceMatches?.find(item => item.Face?.ExternalImageId === employeeId);
  return {
    matched: Boolean(match),
    confidence: match?.Similarity || 0,
    faceId: match?.Face?.FaceId || ''
  };
};