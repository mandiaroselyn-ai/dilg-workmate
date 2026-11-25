import { User } from '../models/User.js';

// The digital ID a signer made in WorkMate (see src/utils/digitalIdSigning.js), kept so they can
// sign from any device. It is a PKCS #12 file locked with the signer's WorkMate password: WorkMate
// stores it but cannot open it (it keeps only a hash of the password), and gives it only to its
// owner. Keeping one checks that password, so the lock is the one the signer signs in with. Only
// those who sign forms (HR and the Supervisor) keep one.
const SIGNER_ROLES = ['hr_admin', 'supervisor'];
const MAX_DATA_LENGTH = 16384;

const isSigner = req => SIGNER_ROLES.includes(req.user?.accessLevel);
const refuse = res => res.status(403).json({ success: false, error: 'Only HR and the Supervisor sign forms with a digital ID.' });

// Why `body` cannot be kept as a digital ID, or ''.
export const signingIdProblem = body => {
  const data = typeof body?.data === 'string' ? body.data.trim() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!data || data.length > MAX_DATA_LENGTH || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return 'The digital ID is missing or not valid.';
  // A PKCS #12 file is a DER SEQUENCE: its first byte is 0x30 ("M" in base64).
  if (!data.startsWith('M')) return 'The digital ID is not a PKCS #12 file.';
  if (!name || name.length > 200) return 'The name on the digital ID is missing or too long.';
  return '';
};

export const getSigningId = async (req, res) => {
  if (!isSigner(req)) return refuse(res);
  try {
    res.status(200).json({ success: true, signingId: await User.getSigningId(req.user._id) });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Unable to load your digital ID.' });
  }
};

export const saveSigningId = async (req, res) => {
  if (!isSigner(req)) return refuse(res);
  const problem = signingIdProblem(req.body);
  if (problem) return res.status(400).json({ success: false, error: problem });
  // An account made with Google sign-in sets a WorkMate password in Settings first.
  if (!req.user.password) return res.status(400).json({ success: false, error: 'Set a WorkMate password in Settings first. Your digital ID is locked with it.' });
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  try {
    if (!password || !(await User.verifyPassword(req.user, password))) {
      return res.status(400).json({ success: false, error: 'Your WorkMate password is incorrect.' });
    }
    await User.setSigningId(req.user._id, { data: req.body.data.trim(), name: req.body.name.trim() });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Unable to keep your digital ID.' });
  }
};

export const removeSigningId = async (req, res) => {
  if (!isSigner(req)) return refuse(res);
  try {
    await User.setSigningId(req.user._id, null);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Unable to remove your digital ID.' });
  }
};
