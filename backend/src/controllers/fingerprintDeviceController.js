import { User } from '../models/User.js';
import { sendServerError } from '../middleware/requestSecurity.js';
import { noticeEmployee } from '../services/employeeNotices.js';
import { toSafeUser } from '../utils/passwordSecurity.js';

const DEVICE_NAMES = { 'phone-app': 'phone (WorkMate app)', browser: 'browser fingerprint' };

// HR approves or rejects the phone or browser fingerprint an employee registered in place of
// the one registered before (see User.reviewPendingFingerprint). Until HR approves it, the
// old one stays in use, so a borrowed password alone cannot move attendance to another phone.
export const reviewFingerprintDevice = async (req, res) => {
  try {
    const { userId, method, decision } = req.body || {};
    if (typeof userId !== 'string' || !DEVICE_NAMES[method] || !['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ success: false, error: 'Choose an employee, the phone or browser fingerprint, and approve or reject.' });
    }
    const reviewer = req.user?.employeeId || req.user?.email || '';
    const updated = await User.reviewPendingFingerprint(userId, method, decision, reviewer);
    if (!updated) {
      return res.status(409).json({ success: false, error: 'No new fingerprint device is waiting for approval for this employee. Refresh the employee records.' });
    }
    const approved = decision === 'approve';
    const device = DEVICE_NAMES[method];
    await noticeEmployee(updated, {
      title: approved ? 'New Fingerprint Device Approved' : 'New Fingerprint Device Not Approved',
      message: approved
        ? `HR approved your new ${device}. Use it for your fingerprint at Time In, Lunch, and Time Out from now on.`
        : `HR did not approve your new ${device}. Keep using the one you registered before, or talk to HR.`,
      type: 'biometric_enrollment',
      view: 'attendance'
    });
    res.status(200).json({ success: true, employee: toSafeUser(updated) });
  } catch (error) {
    sendServerError(res, error);
  }
};
