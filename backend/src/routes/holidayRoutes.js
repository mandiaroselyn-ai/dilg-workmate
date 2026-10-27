import express from 'express';
import { addHolidays, deleteHoliday, getHolidays } from '../controllers/holidayController.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// The holidays not counted as leave days. One path (with ?date= to remove one), so it needs no
// nested-path rewrite on Vercel.
router.get('/holidays', getHolidays);
router.post('/holidays', requireAdmin, addHolidays);
router.delete('/holidays', requireAdmin, deleteHoliday);

export default router;
