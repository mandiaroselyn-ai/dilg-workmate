import mongoose from 'mongoose';
import { isConnected } from '../config/db.js';

// The office orders for overtime that HR enters: who may work overtime, on which dates, and
// between which hours. The DTR counts overtime only within them.
const OvertimeOrderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true },
  purpose: { type: String, required: true },
  startDate: { type: String, required: true }, // YYYY-MM-DD
  endDate: { type: String, required: true },
  startTime: { type: String, required: true }, // HH:MM, 24-hour
  endTime: { type: String, required: true },
  employeeIds: { type: [String], default: [] }, // each an employee ID, or the email of an account with none
  addedBy: { type: String, default: '' }
}, { timestamps: true });

const MongoOvertimeOrder = mongoose.models.OvertimeOrder || mongoose.model('OvertimeOrder', OvertimeOrderSchema);

function ensureConnected() {
  if (!isConnected()) throw new Error('MongoDB is not connected.');
}

const toClient = item => ({
  id: item._id.toString(),
  orderNumber: item.orderNumber,
  purpose: item.purpose,
  startDate: item.startDate,
  endDate: item.endDate,
  startTime: item.startTime,
  endTime: item.endTime,
  employeeIds: item.employeeIds
});

export const OvertimeOrder = {
  // Every order, latest first.
  findAll: async () => {
    ensureConnected();
    return (await MongoOvertimeOrder.find().sort({ startDate: -1, createdAt: -1 }).lean()).map(toClient);
  },

  // The orders that name this employee, latest first.
  findForEmployee: async employee => {
    ensureConnected();
    const ids = [employee?.employeeId, employee?.email].filter(Boolean);
    return (await MongoOvertimeOrder.find({ employeeIds: { $in: ids } }).sort({ startDate: -1, createdAt: -1 }).lean()).map(toClient);
  },

  create: async (order, addedBy) => {
    ensureConnected();
    await MongoOvertimeOrder.create({ ...order, addedBy });
    return OvertimeOrder.findAll();
  },

  // Removes the order; false when there is none with this id.
  remove: async id => {
    ensureConnected();
    if (!mongoose.isValidObjectId(id)) return false;
    return (await MongoOvertimeOrder.deleteOne({ _id: id })).deletedCount === 1;
  }
};
