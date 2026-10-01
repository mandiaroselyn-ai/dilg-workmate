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

export const isSmsConfigured = () => Boolean(process.env.UNISMS_API_KEY);

// Records a message UniSMS did not take, so HR sees it as Failed in the SMS log and can
// reach the person another way. Recording never hides the original error.
const recordFailedSms = async (fields, error) => {
  try {
    await Announcement.createSmsAlert({ ...fields, status: 'Failed', error });
  } catch (recordError) {
    console.error('Unable to record a failed SMS:', recordError.message);
  }
};

// Sends one SMS through UniSMS and records it, with what it is about (`kind`: 'attendance',
// 'account', or 'manual'). Throws SmsError with an HTTP status when the request is invalid,
// UniSMS is not configured, or UniSMS cannot be reached or rejects it; those last two are
// also recorded as Failed.
export const sendSms = async ({ recipient, message, employeeId = '', employeeEmail = '', timestamp, kind = '' }) => {
  const normalizedRecipient = normalizePhilippineNumber(recipient);
  if (!normalizedRecipient || !message) {
    throw new SmsError('SMS recipient and message are required.', 400);
  }
  if (!isSmsConfigured()) {
    throw new SmsError('UniSMS is not configured. Set UNISMS_API_KEY on the backend.', 503);
  }

  const record = { recipient: normalizedRecipient, message, employeeId, employeeEmail, timestamp, kind };
  const apiUrl = process.env.UNISMS_API_URL || 'https://unismsapi.com/api/sms';
  const senderId = process.env.UNISMS_SENDER_ID || 'UniSMS';
  let providerResponse;
  try {
    providerResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.UNISMS_API_KEY}:`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ recipient: normalizedRecipient, content: message, sender_id: senderId })
    });
  } catch (error) {
    await recordFailedSms(record, 'The SMS service could not be reached.');
    throw new SmsError('The SMS service could not be reached. Please try again.', 502);
  }

  const providerData = await providerResponse.json().catch(() => ({}));
  if (!providerResponse.ok) {
    const reason = providerData?.message || providerData?.error || 'UniSMS rejected the message.';
    await recordFailedSms(record, reason);
    throw new SmsError(reason, 502);
  }

  return Announcement.createSmsAlert({
    ...record,
    status: 'Sent',
    providerMessageId: providerData?.id || providerData?.message_id || providerData?.message?.reference_id || ''
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
