import { Holiday } from '../models/holidayModel.js';
import { sendServerError } from '../middleware/requestSecurity.js';
import { normalizeHolidays } from '../utils/leaveCredits.js';

// Everyone signed in sees the holidays (the leave form leaves them out of the leave days).
export const getHolidays = async (req, res) => {
  try {
    res.status(200).json({ success: true, holidays: await Holiday.findAll() });
  } catch (error) {
    sendServerError(res, error);
  }
};

// HR adds holidays ({ holidays: [{ date, name }] }) and gets the whole list back.
export const addHolidays = async (req, res) => {
  try {
    const { holidays, error } = normalizeHolidays(req.body);
    if (error) return res.status(400).json({ success: false, error });
    const saved = await Holiday.saveMany(holidays, req.user?.name || req.user?.email || 'HR/Admin');
    res.status(200).json({ success: true, holidays: saved });
  } catch (error) {
    sendServerError(res, error);
  }
};

// HR removes the holiday on ?date=YYYY-MM-DD.
export const deleteHoliday = async (req, res) => {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ success: false, error: 'Give the holiday date, like 2026-12-25.' });
    if (!(await Holiday.remove(date))) return res.status(404).json({ success: false, error: 'There is no holiday on that date.' });
    res.status(200).json({ success: true, holidays: await Holiday.findAll() });
  } catch (error) {
    sendServerError(res, error);
  }
};
