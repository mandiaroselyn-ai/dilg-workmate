import { Announcement } from '../models/announcementModel.js';

// Tells HR about an account created through the sign-up form or Google sign-in.
// A failed notification never fails the sign-up.
export const notifyHrOfNewAccount = async (user, source) => {
  const who = `${user.name || 'A new user'} (${user.email})`;
  const isActive = (user.accountStatus || '').toLowerCase() === 'active';
  try {
    await Announcement.createNotification({
      title: isActive ? 'New Employee Account' : 'New Account Awaiting Approval',
      message: isActive
        ? `${who} joined through ${source} with a DILG email and was activated automatically. Review their office and job designation.`
        : `${who} signed up through ${source} and is waiting for HR activation.`,
      type: 'employee_management',
      recipientRole: 'hr_admin'
    });
  } catch (error) {
    console.error('Unable to notify HR about a new account:', error);
  }
};
