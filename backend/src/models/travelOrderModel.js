import { MongoRequest } from './leaveModel.js';
import { isConnected } from '../config/db.js';

function ensureConnected() {
  if (!isConnected()) {
    throw new Error('MongoDB is not connected.');
  }
}

export const TravelOrder = {
  find: async () => {
    ensureConnected();
    const mongoList = await MongoRequest.find({ type: 'Travel Order' }).sort({ createdAt: -1 });
    return mongoList.map(item => {
      const obj = item.toObject();
      obj.id = obj.customId;
      return obj;
    });
  },

  create: async (travelData) => {
    ensureConnected();
    const customId = travelData.id || `req-${Math.floor(Math.random() * 9000) + 1000}-${Date.now().toString().slice(-4)}`;
    const newTravelData = {
      customId,
      type: 'Travel Order',
      submissionDate: travelData.submissionDate || new Date().toISOString().split('T')[0],
      startDate: travelData.startDate,
      endDate: travelData.endDate,
      purpose: travelData.purpose,
      travelActivity: travelData.travelActivity || '',
      travelTime: travelData.travelTime || '',
      travelVenue: travelData.travelVenue || '',
      status: travelData.status || 'Pending',
      approver: travelData.approver || 'Regional Director',
      remarks: travelData.remarks || 'Awaiting travel authorization',
      attachments: travelData.attachments || []
    };

    const mongoRequest = await MongoRequest.create(newTravelData);
    const obj = mongoRequest.toObject();
    obj.id = obj.customId;
    return obj;
  }
};
