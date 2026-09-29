import { Announcement } from '../models/announcementModel.js';

// Tells HR about an account created through the sign-up form or Google sign-in; every
// such account waits for HR approval. A failed notification never fails the sign-up.
export const notifyHrOfNewAccount = async (user, source) => {
  const who = `${user.name || 'A new user'} (${user.email})`;
  try {
    await Announcement.createNotification({
      title: 'New Account Awaiting Approval',
      message: `${who} signed up through ${source} and is waiting for HR activation.`,
      type: 'employee_management',
      recipientRole: 'hr_admin'
    });
  } catch (error) {
    console.error('Unable to notify HR about a new account:', error);
  }
};
