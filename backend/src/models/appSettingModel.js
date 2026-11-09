import mongoose from 'mongoose';
import { isConnected } from '../config/db.js';

// Office-wide settings HR keeps, one document per key, such as the month WorkMate starts
// counting leave credits (LEAVE_CREDITS_START, shared/leaveStart.js).
export const LEAVE_CREDITS_START = 'leaveCreditsStart';

const AppSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String, default: '' },
  updatedBy: { type: String, default: '' }
}, { timestamps: true });

const MongoAppSetting = mongoose.models.AppSetting || mongoose.model('AppSetting', AppSettingSchema);

function ensureConnected() {
  if (!isConnected()) throw new Error('MongoDB is not connected.');
}

export const AppSetting = {
  // The setting's value, or '' when it was never set.
  get: async key => {
    ensureConnected();
    return (await MongoAppSetting.findOne({ key }).lean())?.value || '';
  },

  set: async (key, value, updatedBy = '') => {
    ensureConnected();
    await MongoAppSetting.updateOne({ key }, { $set: { key, value, updatedBy } }, { upsert: true });
    return value;
  }
};

// The month WorkMate starts counting leave credits (YYYY-MM), or '' until HR 1 sets it.
export const leaveCreditsStart = () => AppSetting.get(LEAVE_CREDITS_START);
