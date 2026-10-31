import express from 'express';
import { addOvertimeOrder, deleteOvertimeOrder } from '../controllers/overtimeOrderController.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// The office orders for overtime, which /api/state loads. One path (with ?id= to remove one), so
// it needs no nested-path rewrite on Vercel.
router.post('/overtime-orders', requireAdmin, addOvertimeOrder);
router.delete('/overtime-orders', requireAdmin, deleteOvertimeOrder);

export default router;
