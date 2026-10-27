import mongoose from 'mongoose';
import { isConnected } from '../config/db.js';

// The holidays HR sets: days that are not counted as leave days.
const HolidaySchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true }, // YYYY-MM-DD
  name: { type: String, required: true },
  addedBy: { type: String, default: '' }
}, { timestamps: true });

const MongoHoliday = mongoose.models.Holiday || mongoose.model('Holiday', HolidaySchema);

function ensureConnected() {
  if (!isConnected()) throw new Error('MongoDB is not connected.');
}

const toClient = item => ({ date: item.date, name: item.name });

export const Holiday = {
  // Every holiday, earliest first, as { date, name }.
  findAll: async () => {
    ensureConnected();
    return (await MongoHoliday.find().sort({ date: 1 }).lean()).map(toClient);
  },

  // Adds holidays ([{ date, name }]); one already set on a date gets the new name.
  saveMany: async (holidays, addedBy) => {
    ensureConnected();
    if (holidays.length) {
      await MongoHoliday.bulkWrite(holidays.map(({ date, name }) => ({
        updateOne: { filter: { date }, update: { $set: { date, name, addedBy } }, upsert: true }
      })));
    }
    return Holiday.findAll();
  },

  // Removes the holiday on `date`; false when there was none.
  remove: async date => {
    ensureConnected();
    return (await MongoHoliday.deleteOne({ date })).deletedCount === 1;
  }
};
