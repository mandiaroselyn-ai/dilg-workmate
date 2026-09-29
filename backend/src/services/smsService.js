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

// Sends one SMS through UniSMS and records it. Throws SmsError with an HTTP status
// when the request is invalid, UniSMS is not configured, or UniSMS rejects it.
export const sendSms = async ({ recipient, message, employeeId = '', employeeEmail = '', timestamp }) => {
  const normalizedRecipient = normalizePhilippineNumber(recipient);
  if (!normalizedRecipient || !message) {
    throw new SmsError('SMS recipient and message are required.', 400);
  }
  if (!isSmsConfigured()) {
    throw new SmsError('UniSMS is not configured. Set UNISMS_API_KEY on the backend.', 503);
  }

  const apiUrl = process.env.UNISMS_API_URL || 'https://unismsapi.com/api/sms';
  const senderId = process.env.UNISMS_SENDER_ID || 'UniSMS';
  const providerResponse = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.UNISMS_API_KEY}:`).toString('base64')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ recipient: normalizedRecipient, content: message, sender_id: senderId })
  });

  const providerData = await providerResponse.json().catch(() => ({}));
  if (!providerResponse.ok) {
    throw new SmsError(providerData?.message || providerData?.error || 'UniSMS rejected the message.', 502);
  }

  return Announcement.createSmsAlert({
    recipient: normalizedRecipient,
    message,
    employeeId,
    employeeEmail,
    timestamp,
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
      timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })
    });
  } catch (error) {
    console.error('Attendance SMS confirmation failed:', error.message);
    return null;
  }
};
