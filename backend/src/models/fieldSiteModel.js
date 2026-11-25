import mongoose from 'mongoose';
import { isConnected } from '../config/db.js';

// The field site HR set for a barangay, such as its barangay hall: field work in that barangay
// counts within `radiusMeters` of it (shared/fieldSites.js). One per barangay.
const FieldSiteSchema = new mongoose.Schema({
  municipality: { type: String, required: true },
  barangay: { type: String, required: true },
  name: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  radiusMeters: { type: Number, required: true },
  // The HR account that set it last.
  setBy: { type: String, default: '' }
}, { timestamps: true });
FieldSiteSchema.index({ municipality: 1, barangay: 1 }, { unique: true });

const MongoFieldSite = mongoose.models.FieldSite || mongoose.model('FieldSite', FieldSiteSchema);

function ensureConnected() {
  if (!isConnected()) throw new Error('MongoDB is not connected.');
}

const toClient = item => ({
  municipality: item.municipality,
  barangay: item.barangay,
  name: item.name,
  latitude: item.latitude,
  longitude: item.longitude,
  radiusMeters: item.radiusMeters,
  setBy: item.setBy || '',
  updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : ''
});

export const FieldSite = {
  // Every field site, by municipality and barangay.
  findAll: async () => {
    ensureConnected();
    return (await MongoFieldSite.find().sort({ municipality: 1, barangay: 1 }).lean()).map(toClient);
  },

  // The field site of one barangay, or null.
  find: async (municipality, barangay) => {
    ensureConnected();
    const item = await MongoFieldSite.findOne({ municipality, barangay }).lean();
    return item ? toClient(item) : null;
  },

  // Sets a barangay's field site (replacing the one it had).
  save: async (site, setBy) => {
    ensureConnected();
    const { municipality, barangay, name, latitude, longitude, radiusMeters } = site;
    await MongoFieldSite.updateOne(
      { municipality, barangay },
      { $set: { municipality, barangay, name, latitude, longitude, radiusMeters, setBy } },
      { upsert: true }
    );
    return FieldSite.find(municipality, barangay);
  },

  // Removes a barangay's field site; false when it had none.
  remove: async (municipality, barangay) => {
    ensureConnected();
    return (await MongoFieldSite.deleteOne({ municipality, barangay })).deletedCount === 1;
  }
};
