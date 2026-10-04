import { Announcement } from '../models/announcementModel.js';
import { sendServerError } from '../middleware/requestSecurity.js';
import { buildSupportNotification } from '../utils/supportRequest.js';

// An employee's help request from the Help & Support page. HR sees it in their bell
// notifications, with the employee's contact details for follow-up.
export const createSupportRequest = async (req, res) => {
  try {
    const { notification, error } = buildSupportNotification(req.body, req.user);
    if (error) return res.status(400).json({ success: false, error });
    await Announcement.createNotification(notification);
    res.status(201).json({ success: true });
  } catch (error) {
    sendServerError(res, error);
  }
};
