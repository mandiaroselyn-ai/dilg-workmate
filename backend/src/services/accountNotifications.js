import { Announcement } from '../models/announcementModel.js';
import { isEmailConfigured, sendAccountApprovedEmail } from './emailService.js';
import { isSmsConfigured, sendAccountApprovedSms, toPhilippineMobile } from './smsService.js';

// A mobile number with its middle hidden, such as 0917*****67.
export const maskMobile = number => {
  const local = `0${number.slice(3)}`;
  return `${local.slice(0, 4)}*****${local.slice(-2)}`;
};

// An email address with most of its name hidden, such as ju***@gmail.com.
export const maskEmail = email => {
  const [name, domain] = String(email).split('@');
  return `${name.slice(0, 2)}***@${domain}`;
};

// Accounts made with Google sign-in are told about approval by email, at the address Google
// verified; all others by SMS. An account from before sign-up methods were recorded counts
// as a Google sign-up when it is linked to a Google account.
export const signedUpWithGoogle = user =>
  user?.signUpMethod === 'google' || (!user?.signUpMethod && Boolean(user?.googleId));

// Where the approval notice for this account will go, such as "an SMS at 0917*****67",
// or '' when none can be sent (no mobile number, or the SMS or email service is not set up).
export const approvalNoticeDestination = user => {
  if (signedUpWithGoogle(user)) {
    return user.email && isEmailConfigured() ? `an email at ${maskEmail(user.email)}` : '';
  }
  const mobile = toPhilippineMobile(user?.phoneNumber);
  return mobile && isSmsConfigured() ? `an SMS at ${maskMobile(mobile)}` : '';
};

export const pendingAccountMessage = user => {
  const destination = approvalNoticeDestination(user);
  return destination
    ? `Your account is still waiting for HR approval. You will get ${destination} once it is approved.`
    : 'Your account is still waiting for HR approval. HR will let you know once it is approved.';
};

// What someone whose account is not active sees when they try to sign in or check their
// account status.
export const inactiveAccountMessage = user => {
  const status = String(user?.accountStatus || '').toLowerCase();
  if (status === 'pending') return pendingAccountMessage(user);
  if (status === 'rejected') return 'Your account registration was rejected. Please contact the HR Administrator.';
  return `This account is ${status}. Please contact the HR Administrator.`;
};

// The status an employee sees before logging in: Pending, Approved, Rejected, or, for an
// account HR deactivated, Inactive or Suspended. An account with no status is active.
export const accountStatusLabel = user => {
  const status = String(user?.accountStatus || 'Active').trim().toLowerCase();
  return { active: 'Approved', pending: 'Pending', rejected: 'Rejected', suspended: 'Suspended' }[status] || 'Inactive';
};

// True when HR's change makes an account active that was not active before.
export const isAccountApproval = (before, accountStatus) =>
  accountStatus === 'Active' && String(before?.accountStatus || '').toLowerCase() !== 'active';

// Tells an employee that HR approved their account: a notice they see after logging in,
// and an SMS (sign-up form) or email (Google sign-in) so they know they can log in now.
// Returns { channel: 'sms' | 'email', result }, where result is 'sent', 'no-phone',
// 'no-email', 'not-configured', or 'failed'. It never fails the approval.
export const announceAccountApproved = async user => {
  await Announcement.createNotification({
    title: 'Account Approved',
    message: 'Your DILG WorkMate account is now active. Complete your profile and biometric enrollment before your first Time In.',
    type: 'system',
    employeeId: user.employeeId || '',
    employeeEmail: user.email || ''
  }).catch(error => console.error('Unable to notify the employee about account approval:', error));
  return signedUpWithGoogle(user)
    ? { channel: 'email', result: await sendAccountApprovedEmail(user) }
    : { channel: 'sms', result: await sendAccountApprovedSms(user) };
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
