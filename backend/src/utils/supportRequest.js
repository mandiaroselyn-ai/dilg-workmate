import { SUPPORT_DETAILS_MAX, SUPPORT_SUBJECT_MAX, SUPPORT_TOPICS } from '../../../shared/supportTopics.js';

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

// Builds the bell notification HR gets when an employee asks for help, with the employee's
// mobile number and email so HR can follow up. Returns { notification } or { error }.
export const buildSupportNotification = (body, user) => {
  const topic = body?.topic;
  if (!SUPPORT_TOPICS.includes(topic)) return { error: 'Choose what your concern is about.' };
  const subject = text(body.subject, SUPPORT_SUBJECT_MAX);
  if (!subject) return { error: 'Enter a short subject.' };
  const details = text(body.details, SUPPORT_DETAILS_MAX);
  if (!details) return { error: 'Describe the problem, including any message the app showed.' };

  const who = `${user?.name || 'An employee'}${user?.employeeId ? ` (${user.employeeId})` : ''}`;
  const contact = [user?.phoneNumber, user?.email].filter(Boolean).join(' / ');
  return {
    notification: {
      title: `Help Request: ${topic}`,
      message: `${who} asked for help: ${subject}. ${details}${contact ? ` Contact: ${contact}` : ''}`,
      type: 'support',
      recipientRole: 'hr_admin'
    }
  };
};
