import mongoose from 'mongoose';
import { isConnected } from '../config/db.js';
import { getManilaDateString } from '../../../shared/localDate.js';
import { builtInHolidays } from '../../../shared/phHolidays.js';
import { AppSetting } from './appSettingModel.js';

// The holidays: days that are not counted as leave days and have no late, undertime, or absence.
// WorkMate adds the national and Marinduque holidays itself (shared/phHolidays.js); HR adds any
// proclaimed later, for the whole province or one town.
const HolidaySchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true }, // YYYY-MM-DD
  name: { type: String, required: true },
  // 'Regular Holiday' or 'Special Non-Working Day' for the national holidays, or a special day in
  // Marinduque or one of its towns; '' for HR's.
  kind: { type: String, default: '' },
  // '' for a holiday everywhere, or the Marinduque town whose offices alone have the day off.
  place: { type: String, default: '' },
  // Who added it: an HR account, or the proclamation or law WorkMate took it from.
  addedBy: { type: String, default: '' }
}, { timestamps: true });

const MongoHoliday = mongoose.models.Holiday || mongoose.model('Holiday', HolidaySchema);

function ensureConnected() {
  if (!isConnected()) throw new Error('MongoDB is not connected.');
}

// A town holiday HR added is a special non-working day in that town.
const toClient = item => ({
  date: item.date,
  name: item.name,
  kind: item.kind || (item.place ? `Special Non-Working Day in ${item.place}` : ''),
  place: item.place || '',
  addedBy: item.addedBy || ''
});

// The years whose holidays this server has already added.
const addedYears = new Set();

const readDates = text => {
  try {
    const dates = JSON.parse(text || '[]');
    return Array.isArray(dates) ? dates : [];
  } catch {
    return [];
  }
};

// Adds the national and Marinduque holidays of this year and next, each date once: one HR removed
// is not added again, and a holiday HR already saved on that date is kept as HR wrote it. Which
// dates were added is kept per year (builtInHolidays:YYYY), so one added to the list later is added.
const addBuiltInHolidays = async () => {
  const year = Number(getManilaDateString().slice(0, 4));
  for (const each of [year, year + 1]) {
    if (addedYears.has(each)) continue;
    const key = `builtInHolidays:${each}`;
    const done = new Set(readDates(await AppSetting.get(key)));
    const missing = builtInHolidays(each).filter(holiday => !done.has(holiday.date));
    if (missing.length) {
      await MongoHoliday.bulkWrite(missing.map(({ date, name, kind, place, source }) => ({
        updateOne: { filter: { date }, update: { $setOnInsert: { date, name, kind, place: place || '', addedBy: source } }, upsert: true }
      })));
      await AppSetting.set(key, JSON.stringify([...done, ...missing.map(holiday => holiday.date)]), 'WorkMate');
    }
    addedYears.add(each);
  }
};

export const Holiday = {
  // Every holiday, earliest first, as { date, name, kind, place, addedBy }, with the national and
  // Marinduque holidays of this year and next added first.
  findAll: async () => {
    ensureConnected();
    // A failure here is tried again on the next read; the holidays already saved still load.
    await addBuiltInHolidays().catch(error => console.error('Unable to add the national and Marinduque holidays:', error));
    return (await MongoHoliday.find().sort({ date: 1 }).lean()).map(toClient);
  },

  // Adds holidays ([{ date, name, place }]); one already set on a date gets the new name and place.
  saveMany: async (holidays, addedBy) => {
    ensureConnected();
    if (holidays.length) {
      await MongoHoliday.bulkWrite(holidays.map(({ date, name, place = '' }) => ({
        updateOne: { filter: { date }, update: { $set: { date, name, place, addedBy } }, upsert: true }
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
