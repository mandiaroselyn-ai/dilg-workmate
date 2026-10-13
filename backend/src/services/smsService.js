import { Announcement } from '../models/announcementModel.js';

export const normalizePhilippineNumber = value => {
  const raw = value?.toString().trim().replace(/[\s()-]/g, '');
  if (!raw) return '';
  if (raw.startsWith('+63')) return raw;
  if (raw.startsWith('63')) return `+${raw}`;
  if (raw.startsWith('09') && raw.length === 11) return `+63${raw.slice(1)}`;
  return raw;
};

export class SmsError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const isSmsConfigured = () => Boolean(process.env.HTTPSMS_API_KEY || process.env.UNISMS_API_KEY);

// The SMS provider: httpSMS (texts from a phone's own SIM through the httpSMS app, no
// Sender ID needed) when HTTPSMS_API_KEY is set, otherwise UniSMS.
const providerRequest = (recipient, message) => {
  if (process.env.HTTPSMS_API_KEY) {
    return {
      name: 'httpSMS',
      url: 'https://api.httpsms.com/v1/messages/send',
      headers: { 'x-api-key': process.env.HTTPSMS_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: { from: normalizePhilippineNumber(process.env.HTTPSMS_FROM), to: recipient, content: message }
    };
  }
  return {
    name: 'UniSMS',
    url: process.env.UNISMS_API_URL || 'https://unismsapi.com/api/sms',
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.UNISMS_API_KEY}:`).toString('base64')}`,
      'Content-Type': 'application/json'
    },
    body: { recipient, content: message, sender_id: process.env.UNISMS_SENDER_ID || 'UniSMS' }
  };
};

// Why the provider refused a text: its message, and its field errors, such as UniSMS's
// {"errors":{"sender_id":["is inactive"]}} as "sender_id is inactive".
const providerErrorText = (data, providerName) => {
  const fieldErrors = [data?.errors, data?.data].find(value => value && typeof value === 'object' && !Array.isArray(value));
  const details = fieldErrors
    ? Object.entries(fieldErrors).map(([field, problems]) => `${field} ${[].concat(problems).join(', ')}`).join('; ')
    : '';
  const message = typeof data?.message === 'string' ? data.message : typeof data?.error === 'string' ? data.error : '';
  return [message, details].filter(Boolean).join(': ') || `${providerName} rejected the message.`;
};

// Records a message the SMS provider did not take, so HR sees it as Failed in the SMS log
// and can reach the person another way. Recording never hides the original error.
const recordFailedSms = async (fields, error) => {
  try {
    await Announcement.createSmsAlert({ ...fields, status: 'Failed', error });
  } catch (recordError) {
    console.error('Unable to record a failed SMS:', recordError.message);
  }
};

// Sends one SMS through the SMS provider and records it, with what it is about (`kind`:
// 'attendance', 'account', or 'manual'). Throws SmsError with an HTTP status when the request
// is invalid, SMS is not configured, or the provider cannot be reached or rejects it; those
// last two are also recorded as Failed.
export const sendSms = async ({ recipient, message, employeeId = '', employeeEmail = '', timestamp, kind = '' }) => {
  const normalizedRecipient = normalizePhilippineNumber(recipient);
  if (!normalizedRecipient || !message) {
    throw new SmsError('SMS recipient and message are required.', 400);
  }
  if (!isSmsConfigured()) {
    throw new SmsError('SMS is not configured. Set HTTPSMS_API_KEY or UNISMS_API_KEY on the backend.', 503);
  }
  if (process.env.HTTPSMS_API_KEY && !toPhilippineMobile(process.env.HTTPSMS_FROM)) {
    throw new SmsError('Set HTTPSMS_FROM to the mobile number of the phone running httpSMS.', 503);
  }

  const record = { recipient: normalizedRecipient, message, employeeId, employeeEmail, timestamp, kind };
  const provider = providerRequest(normalizedRecipient, message);
  let providerResponse;
  try {
    providerResponse = await fetch(provider.url, {
      method: 'POST',
      headers: provider.headers,
      body: JSON.stringify(provider.body)
    });
  } catch (error) {
    await recordFailedSms(record, 'The SMS service could not be reached.');
    throw new SmsError('The SMS service could not be reached. Please try again.', 502);
  }

  const providerData = await providerResponse.json().catch(() => ({}));
  if (!providerResponse.ok) {
    console.error(`${provider.name} error response:`, providerResponse.status, JSON.stringify(providerData));
    const reason = providerErrorText(providerData, provider.name);
    await recordFailedSms(record, reason);
    throw new SmsError(reason, 502);
  }

  // httpSMS queues the text on the phone ("pending"); it counts as sent once accepted.
  return Announcement.createSmsAlert({
    ...record,
    status: 'Sent',
    providerMessageId: providerData?.data?.id || providerData?.id || providerData?.message_id || providerData?.message?.reference_id || ''
  });
};

// Sends an attendance confirmation to the employee. It never fails the attendance
// action: when SMS is not configured, the employee has no phone number, or sending
// fails, it returns null.
export const sendAttendanceConfirmation = async (employee, message) => {
  if (!isSmsConfigured() || !employee?.phoneNumber) return null;
  try {
    return await sendSms({
      recipient: employee.phoneNumber,
      message,
      employeeId: employee.employeeId || '',
      employeeEmail: employee.email || '',
      timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }),
      kind: 'attendance'
    });
  } catch (error) {
    console.error('Attendance SMS confirmation failed:', error.message);
    return null;
  }
};

// A Philippine mobile number the SMS service can send to (+639XXXXXXXXX), or ''.
export const toPhilippineMobile = value => {
  const number = normalizePhilippineNumber(value);
  return /^\+639\d{9}$/.test(number) ? number : '';
};

// Tells an employee by SMS that HR approved their account, so they know they can log in.
// (Messages with links are blocked by Philippine carriers, so it has none.) Returns
// 'sent', 'no-phone', 'not-configured', or 'failed'; it never fails the approval.
export const sendAccountApprovedSms = async employee => {
  if (!toPhilippineMobile(employee?.phoneNumber)) return 'no-phone';
  if (!isSmsConfigured()) return 'not-configured';
  try {
    await sendSms({
      recipient: employee.phoneNumber,
      message: 'DILG WorkMate: Your account has been approved by HR. You can now log in using your email address.',
      employeeId: employee.employeeId || '',
      employeeEmail: employee.email || '',
      timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }),
      kind: 'account'
    });
    return 'sent';
  } catch (error) {
    console.error('Account approval SMS failed:', error.message);
    return 'failed';
  }
};

// Tells each supervisor with a mobile number that HR forwarded a request for their decision,
// so it does not wait until they next open WorkMate. Supervisors without a number get only
// the bell notification. Returns how many texts were sent; it never fails the forward.
export const sendSupervisorReviewSms = async (request, supervisors = []) => {
  if (!isSmsConfigured()) return 0;
  const message = `DILG WorkMate: ${request?.employeeName || 'An employee'}'s ${request?.type || 'request'} is waiting for your approval. Please review it in WorkMate.`;
  const results = await Promise.all(supervisors
    .filter(supervisor => toPhilippineMobile(supervisor?.phoneNumber))
    .map(supervisor => sendSms({
      recipient: supervisor.phoneNumber,
      message,
      employeeId: supervisor.employeeId || '',
      employeeEmail: supervisor.email || '',
      timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }),
      kind: 'review'
    }).then(() => true, error => {
      console.error('Supervisor review SMS failed:', error.message);
      return false;
    })));
  return results.filter(Boolean).length;
};
