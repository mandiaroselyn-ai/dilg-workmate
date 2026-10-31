import { OvertimeOrder } from '../models/overtimeOrderModel.js';
import { sendServerError } from '../middleware/requestSecurity.js';
import { normalizeOvertimeOrder } from '../utils/overtimeOrders.js';

// HR adds an office order and gets the whole list back.
export const addOvertimeOrder = async (req, res) => {
  try {
    const { order, error } = normalizeOvertimeOrder(req.body);
    if (error) return res.status(400).json({ success: false, error });
    const saved = await OvertimeOrder.create(order, req.user?.name || req.user?.email || 'HR/Admin');
    res.status(200).json({ success: true, overtimeOrders: saved });
  } catch (error) {
    sendServerError(res, error);
  }
};

// HR removes the office order with ?id=.
export const deleteOvertimeOrder = async (req, res) => {
  try {
    const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
    if (!(await OvertimeOrder.remove(id))) return res.status(404).json({ success: false, error: 'There is no such office order.' });
    res.status(200).json({ success: true, overtimeOrders: await OvertimeOrder.findAll() });
  } catch (error) {
    sendServerError(res, error);
  }
};
