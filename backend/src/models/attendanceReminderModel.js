import mongoose from 'mongoose';
import { isConnected } from '../config/db.js';

// The attendance reminders already sent (shared/attendanceReminders.js), one document per
// employee, day, and kind, so a scheduled run that comes twice never sends one twice. Each is
// removed by MongoDB a week later.
const AttendanceReminderSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  sentAt: { type: Date, default: Date.now, expires: 7 * 24 * 60 * 60 }
}, { versionKey: false });

const MongoAttendanceReminder = mongoose.models.AttendanceReminder
  || mongoose.model('AttendanceReminder', AttendanceReminderSchema);

function ensureConnected() {
  if (!isConnected()) throw new Error('MongoDB is not connected.');
}

export const AttendanceReminder = {
  // Records each of `keys` as sent, and returns those not sent before (for which this call is
  // the one to send). A key recorded at the same moment by another run counts as sent.
  claim: async (keys = []) => {
    ensureConnected();
    const claimed = await Promise.all(keys.map(async key => {
      try {
        const result = await MongoAttendanceReminder.updateOne(
          { _id: key },
          { $setOnInsert: { sentAt: new Date() } },
          { upsert: true }
        );
        return result.upsertedCount === 1 ? key : null;
      } catch (error) {
        if (error?.code === 11000) return null;
        throw error;
      }
    }));
    return claimed.filter(Boolean);
  }
};
