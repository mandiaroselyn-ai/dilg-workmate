import { Announcement } from '../models/announcementModel.js';
import { toPhilippineMobile } from './smsService.js';

// A mobile number with its middle hidden, such as 0917*****67.
export const maskMobile = number => {
  const local = `0${number.slice(3)}`;
  return `${local.slice(0, 4)}*****${local.slice(-2)}`;
};

// What someone whose account is not active sees when they try to sign in. A pending
// account is told it is waiting for HR, and where the approval SMS will go.
export const inactiveAccountMessage = user => {
  const status = String(user?.accountStatus || '').toLowerCase();
  if (status !== 'pending') return `This account is ${status}. Please contact the HR Administrator.`;
  const mobile = toPhilippineMobile(user.phoneNumber);
  return mobile
    ? `Your account is still waiting for HR approval. You will get an SMS at ${maskMobile(mobile)} once it is approved.`
    : 'Your account is still waiting for HR approval. HR will let you know once it is approved.';
};

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
