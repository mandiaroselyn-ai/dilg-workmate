import mongoose from 'mongoose';
import { getManilaDateString } from '../../../shared/localDate.js';
import { isConnected } from '../config/db.js';
import { createRecordId } from '../utils/recordId.js';
import { User } from './User.js';
import { pickReviewUpdate } from '../utils/requestFields.js';
import { stampOf } from '../utils/updateStamp.js';

// The requests one person sees: an employee's own, or all of them for HR and supervisors.
// Returns null for an employee with neither an employee ID nor an email.
export const visibleRequestFilter = user => {
  if (user?.accessLevel !== 'employee') return {};
  const owners = [
    ...(user.employeeId ? [{ employeeId: user.employeeId }] : []),
    ...(user.email ? [{ employeeEmail: user.email }] : [])
  ];
  return owners.length ? { $or: owners } : null;
};

const RequestSchema = new mongoose.Schema({
  customId: { type: String, required: true },
  type: { type: String, required: true, enum: ['Leave Request', 'Travel Order', 'Certified Copy Request'] },
  submissionDate: { type: String, required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  purpose: { type: String, required: true },
  employeeId: { type: String, default: '' },
  employeeEmail: { type: String, default: '' },
  employeePhoneNumber: { type: String, default: '' },
  employeeName: { type: String, default: '' },
  recordDetails: { type: mongoose.Schema.Types.Mixed, default: null },
  status: { type: String, default: 'Pending' },
  approver: { type: String, default: 'OIC Provincial Director' },
  remarks: { type: String, default: 'Awaiting final review' },
  leaveType: { type: String, default: '' },
  detailsType: { type: String, default: '' },
  detailsSpecify: { type: String, default: '' },
  travelActivity: { type: String, default: '' },
  travelTime: { type: String, default: '' },
  travelVenue: { type: String, default: '' },
  commutation: { type: String, default: 'Not Requested' },
  workingDays: { type: Number, default: 1 },
  attachments: { type: [mongoose.Schema.Types.Mixed], default: [] },
  signatureData: { type: String, default: '' },
  employeeSignature: { type: String, default: '' },
  employeeSignedAt: { type: String, default: '' },
  stage: { type: String, default: 'PM' },
  supervisorSignature: { type: String, default: '' },
  supervisorRemarks: { type: String, default: '' },
  supervisorApprovedAt: { type: String, default: '' },
  supervisorName: { type: String, default: '' },
  directorSignature: { type: String, default: '' },
  directorRemarks: { type: String, default: '' },
  directorApprovedAt: { type: String, default: '' },
  directorName: { type: String, default: '' },
  statusHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
  // Set once leave credits have been deducted for this request's approval.
  creditsDeducted: { type: Boolean, default: false }
}, { timestamps: true });

export const MongoRequest = mongoose.models.Request || mongoose.model('Request', RequestSchema);

function ensureConnected() {
  if (!isConnected()) {
    throw new Error('MongoDB is not connected.');
  }
}

export const Leave = {
  // Changes whenever a request this person sees is filed, reviewed, or withdrawn.
  updateStamp: async (user) => {
    ensureConnected();
    const filter = visibleRequestFilter(user);
    return filter ? stampOf(MongoRequest, filter) : '0:0';
  },

  find: async () => {
    ensureConnected();
    const mongoList = await MongoRequest.find({ type: 'Leave Request' }).sort({ createdAt: -1 });
    return mongoList.map(item => {
      const obj = item.toObject();
      obj.id = obj.customId;
      return obj;
    });
  },

  findAllRequests: async () => {
    ensureConnected();
    const mongoList = await MongoRequest.find().sort({ createdAt: -1 });
    return Promise.all(mongoList.map(async item => {
      const obj = item.toObject();
      obj.id = obj.customId;
      const account = obj.employeeId
        ? await User.findByEmployeeId(obj.employeeId)
        : obj.employeeEmail
          ? await User.findByEmail(obj.employeeEmail)
          : null;
      if (account) {
        obj.employee = {
          name: account.name,
          email: account.email,
          employeeId: account.employeeId,
          role: account.role,
          office: account.office,
          phoneNumber: account.phoneNumber
        };
        obj.employeeName = account.name;
      }
      return obj;
    }));
  },

  create: async (leaveData) => {
    ensureConnected();
    const customId = leaveData.id || createRecordId('req');
    const newRequestData = {
      customId,
      type: leaveData.type || 'Leave Request',
      submissionDate: leaveData.submissionDate || getManilaDateString(),
      startDate: leaveData.startDate,
      endDate: leaveData.endDate,
      purpose: leaveData.purpose,
      employeeId: leaveData.employeeId || '',
      employeeEmail: leaveData.employeeEmail?.toString().trim().toLowerCase() || '',
      employeePhoneNumber: leaveData.employeePhoneNumber || '',
      employeeName: leaveData.employeeName || '',
      recordDetails: leaveData.recordDetails || null,
      status: leaveData.status || 'Pending',
      approver: leaveData.approver || 'OIC Provincial Director',
      remarks: leaveData.remarks || 'Awaiting final review',
      leaveType: leaveData.leaveType || '',
      detailsType: leaveData.detailsType || '',
      detailsSpecify: leaveData.detailsSpecify || '',
      travelActivity: leaveData.travelActivity || '',
      travelTime: leaveData.travelTime || '',
      travelVenue: leaveData.travelVenue || '',
      commutation: leaveData.commutation || 'Not Requested',
      workingDays: leaveData.workingDays || 1,
      attachments: leaveData.attachments || [],
      signatureData: leaveData.signatureData || '',
      employeeSignature: leaveData.employeeSignature || leaveData.employeeName || '',
      employeeSignedAt: leaveData.employeeSignedAt || getManilaDateString(),
      stage: leaveData.stage || 'PM',
      supervisorSignature: leaveData.supervisorSignature || '',
      supervisorRemarks: leaveData.supervisorRemarks || '',
      supervisorApprovedAt: leaveData.supervisorApprovedAt || '',
      supervisorName: leaveData.supervisorName || '',
      directorSignature: leaveData.directorSignature || '',
      directorRemarks: leaveData.directorRemarks || '',
      directorApprovedAt: leaveData.directorApprovedAt || '',
      directorName: leaveData.directorName || '',
      statusHistory: Array.isArray(leaveData.statusHistory) && leaveData.statusHistory.length
        ? leaveData.statusHistory
        : [{ status: leaveData.status || 'Pending', date: getManilaDateString(), actor: leaveData.employeeName || 'Employee' }]
    };

    const mongoRequest = await MongoRequest.create(newRequestData);
    const obj = mongoRequest.toObject();
    obj.id = obj.customId;
    return obj;
  },

  // Marks the request's credits as deducted. Returns false when they already were.
  markCreditsDeducted: async (id) => {
    ensureConnected();
    const result = await MongoRequest.updateOne({ customId: id, creditsDeducted: { $ne: true } }, { $set: { creditsDeducted: true } });
    return result.modifiedCount === 1;
  },

  findByCustomId: async (id) => {
    ensureConnected();
    if (typeof id !== 'string' || !id) return null;
    return MongoRequest.findOne({ customId: id }).lean();
  },

  updateStatus: async (id, updateBody) => {
    ensureConnected();
    const mongoRequest = await MongoRequest.findOne({ customId: id });
    if (!mongoRequest) {
      return null;
    }
    Object.assign(mongoRequest, updateBody);
    await mongoRequest.save();
    const obj = mongoRequest.toObject();
    obj.id = obj.customId;
    return obj;
  },

  // Applies review updates to existing requests by id. Only review fields change, and
  // requests that are not in the list are left alone (nothing is deleted).
  bulkUpdate: async (updates) => {
    ensureConnected();
    if (!Array.isArray(updates) || updates.some(update => typeof update?.id !== 'string' || !update.id)) {
      throw new Error('Each request update must include a request id.');
    }
    const operations = updates
      .map(update => ({ id: update.id, changes: pickReviewUpdate(update) }))
      .filter(({ changes }) => Object.keys(changes).length > 0);
    if (operations.length) {
      await MongoRequest.bulkWrite(operations.map(({ id, changes }) => ({
        updateOne: { filter: { customId: id }, update: { $set: changes } }
      })));
    }
    const updated = await MongoRequest.find({ customId: { $in: operations.map(({ id }) => id) } });
    return updated.map(item => {
      const obj = item.toObject();
      obj.id = obj.customId;
      return obj;
    });
  }
};
