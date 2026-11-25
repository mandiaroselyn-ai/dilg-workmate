import crypto from 'crypto';
import express from 'express';
import { sendAttendanceReminders } from '../services/attendanceReminders.js';
import { sendServerError } from '../middleware/requestSecurity.js';

const router = express.Router();

// Compares hashes so the check takes the same time regardless of where the secrets differ.
const isMatchingSecret = (received, expected) => {
  if (typeof received !== 'string') return false;
  const digest = value => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(digest(received), digest(expected));
};

// Vercel's scheduler calls this on weekdays (vercel.json `schedules`) to send the attendance
// reminders that are due. It needs no sign-in: it sends only what is due at the moment, each at
// most once per employee and day, so an extra call sends nothing new. When CRON_SECRET is set
// in Vercel, Vercel sends it and only a call that has it is accepted.
router.post('/attendance-reminders', async (req, res) => {
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (secret && !isMatchingSecret(req.headers.authorization, `Bearer ${secret}`)) {
    return res.status(401).json({ success: false, error: 'Not allowed.' });
  }
  try {
    res.status(200).json({ success: true, ...(await sendAttendanceReminders()) });
  } catch (error) {
    sendServerError(res, error);
  }
});

export default router;
