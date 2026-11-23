import { readVerificationProof } from './verificationProof.js';
import { checkHeadTurn, FaceImageError } from '../services/faceMatchingService.js';

// The provider names saved on a punch for its liveness check.
export const LIVENESS_PROVIDER = 'local-face-api-head-turn-v1';
export const LIVENESS_NOT_CHECKED_OFFLINE = 'not-checked-offline';

// The head-turn check of an online Time In, Lunch Out, Lunch In, or Time Out: right after the
// selfie the employee turned their head the way the server asked (see createLivenessChallenge),
// and that photo must show the same face as the selfie, turned that way. A photo of a photo
// cannot turn its head. `liveness` is { token, selfie } from the attendance page, `selfieFace`
// the selfie's analysis from the face match, and `punch` names the punch for the messages.
// Returns { verified: true, change } or { error, statusCode, audit } for a refusal.
export const checkPunchLiveness = async ({ liveness, employeeId, selfieFace, punch, checkTurn = checkHeadTurn }) => {
  const token = typeof liveness?.token === 'string' ? liveness.token : '';
  const turnImage = typeof liveness?.selfie === 'string' ? liveness.selfie : '';
  if (!token || !turnImage) {
    return {
      statusCode: 400,
      error: `The head-turn check is missing. Close and reopen WorkMate so it updates, then take the ${punch} selfie again and turn your head when the arrow shows.`
    };
  }
  if (!Array.isArray(selfieFace?.descriptor)) {
    return { statusCode: 422, error: `The ${punch} selfie could not be checked. Take it again.` };
  }
  const challenge = readVerificationProof(token, { employeeId, type: 'liveness' });
  if (!challenge || !['left', 'right'].includes(challenge.direction)) {
    return { statusCode: 400, error: `The head-turn check expired. Take the ${punch} selfie again.` };
  }

  let result;
  try {
    result = await checkTurn({ selfieFace, turnImage, direction: challenge.direction });
  } catch (error) {
    if (!(error instanceof FaceImageError)) throw error;
    return {
      statusCode: 422,
      error: 'Your face was not found in the head-turn photo. Take the selfie again, and turn your head only a little so your whole face stays in the frame.',
      audit: 'attendance-liveness-no-face'
    };
  }
  if (result.reason === 'different-face') {
    return {
      statusCode: 403,
      error: 'The head-turn photo does not show the same face as the selfie. Take the selfie again.',
      audit: 'attendance-liveness-different-face'
    };
  }
  if (!result.passed) {
    return {
      statusCode: 403,
      error: `Your head turn was not seen. Take the ${punch} selfie again, and when the arrow shows, turn your head a little toward it before tapping the button.`,
      audit: 'attendance-liveness-no-turn'
    };
  }
  return { verified: true, change: Math.round(Math.abs(result.change) * 1000) / 1000 };
};
