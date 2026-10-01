import nodemailer from 'nodemailer';
import { getFrontendOrigin } from '../utils/frontendOrigin.js';

const SMTP_SETTINGS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'];

export const isEmailConfigured = () => SMTP_SETTINGS.every(key => process.env[key]);

// A mail transport for the configured SMTP server. Throws when a setting is missing.
export const createTransporter = () => {
  const missing = SMTP_SETTINGS.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`SMTP configuration incomplete: missing ${missing.join(', ')}`);
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    // Give up on an unreachable mail server well before the 30-second function limit.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
};

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

// Tells an employee who signed up with Google, at the address Google verified, that HR
// approved their account. Returns 'sent', 'no-email', 'not-configured', or 'failed'; it
// never fails the approval.
export const sendAccountApprovedEmail = async employee => {
  const email = String(employee?.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'no-email';
  if (!isEmailConfigured()) return 'not-configured';
  const greeting = employee.name ? `Hello ${employee.name},` : 'Hello,';
  const appUrl = getFrontendOrigin();
  try {
    await createTransporter().sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Your DILG WorkMate account has been approved',
      text: `${greeting}\n\nYour DILG WorkMate account has been approved by the HR Administrator. You can now log in by choosing "Continue with Google" and signing in with this Google account (${email}).\n\n${appUrl}\n\nIf you did not sign up for DILG WorkMate, please contact the HR Administrator.`,
      html: `<p>${escapeHtml(greeting)}</p><p>Your DILG WorkMate account has been approved by the HR Administrator. You can now log in by choosing <strong>Continue with Google</strong> and signing in with this Google account (${escapeHtml(email)}).</p><p><a href="${escapeHtml(appUrl)}">Open DILG WorkMate</a></p><p>If you did not sign up for DILG WorkMate, please contact the HR Administrator.</p>`
    });
    return 'sent';
  } catch (error) {
    console.error('Account approval email failed:', error.message);
    return 'failed';
  }
};
