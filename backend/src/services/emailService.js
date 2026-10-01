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

// Google's own page for recovering a Google account, where its password is reset.
export const GOOGLE_ACCOUNT_RECOVERY_URL = 'https://accounts.google.com/signin/recovery';

// Answers a password reset request for an account that signs in only with Google. Its
// password belongs to Google, so the email points to Google Account Recovery instead of
// sending a WorkMate reset link.
export const sendGoogleAccountRecoveryEmail = (transporter, email) => transporter.sendMail({
  from: process.env.EMAIL_FROM,
  to: email,
  subject: 'DILG WorkMate: your account uses Google Sign-In',
  text: `You asked to reset your DILG WorkMate password.\n\nThis account uses Google Sign-In. Your password is managed by Google. Please use Google Account Recovery to reset your Google password:\n\n${GOOGLE_ACCOUNT_RECOVERY_URL}\n\nAfter recovering your Google account, return to DILG WorkMate and choose "Continue with Google" to log in.\n\nIf you did not ask for this, you can ignore this message.`,
  html: `<p>You asked to reset your DILG WorkMate password.</p><p>This account uses Google Sign-In. Your password is managed by Google. Please use Google Account Recovery to reset your Google password.</p><p><a href="${GOOGLE_ACCOUNT_RECOVERY_URL}">Recover Google Account</a></p><p>After recovering your Google account, return to DILG WorkMate and choose <strong>Continue with Google</strong> to log in.</p><p>If you did not ask for this, you can ignore this message.</p>`
});

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
