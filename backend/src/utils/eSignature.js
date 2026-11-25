import { User } from '../models/User.js';

// An employee's e-signature on a form they sign in WorkMate (their DTR, CSC Form No. 48, and their
// leave application, CSC Form No. 6): a picture of their signature, confirmed by their WorkMate
// password at the moment of signing. Under the Electronic Commerce Act (RA 8792, Sec. 8) an
// electronic signature counts as a signature when it shows who signed and that they approved:
// here the signer's own account, their password, and the time are kept with the signature.

const MAX_SIGNATURE_LENGTH = 300 * 1024;

export const isSignatureImage = value => typeof value === 'string'
  && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value)
  && value.length <= MAX_SIGNATURE_LENGTH;

// Why the signer's e-signature cannot be taken, or '' when it can: a signature image, and the
// signer's own password (an account made with Google sign-in sets one in Settings first).
export const signerProblem = async (user, { signature, password }) => {
  if (!isSignatureImage(signature)) return 'Add your signature (draw it or upload a PNG or JPG under 300 KB).';
  if (!user?.password) return 'Set a WorkMate password in Settings first. You confirm your e-signature with it.';
  if (typeof password !== 'string' || !password || !(await User.verifyPassword(user, password))) {
    return 'Your password is incorrect. Enter it to confirm your e-signature.';
  }
  return '';
};
