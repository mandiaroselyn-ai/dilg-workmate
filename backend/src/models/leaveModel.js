import mongoose from 'mongoose';
import { isConnected } from '../config/db.js';
import { User } from './User.js';

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
  statusHistory: { type: [mongoose.Schema.Types.Mixed], default: [] }
}, { timestamps: true });

export const MongoRequest = mongoose.models.Request || mongoose.model('Request', RequestSchema);

function ensureConnected() {
  if (!isConnected()) {
    throw new Error('MongoDB is not connected.');
  }
}

export const Leave = {
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
    const customId = leaveData.id || `req-${Math.floor(Math.random() * 9000) + 1000}-${Date.now().toString().slice(-4)}`;
    const newRequestData = {
      customId,
      type: leaveData.type || 'Leave Request',
      submissionDate: leaveData.submissionDate || new Date().toISOString().split('T')[0],
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
      employeeSignedAt: leaveData.employeeSignedAt || new Date().toISOString().split('T')[0],
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
        : [{ status: leaveData.status || 'Pending', date: new Date().toISOString().split('T')[0], actor: leaveData.employeeName || 'Employee' }]
    };

    const mongoRequest = await MongoRequest.create(newRequestData);
    const obj = mongoRequest.toObject();
    obj.id = obj.customId;
    return obj;
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

  bulkUpdate: async (updatedRequests) => {
    ensureConnected();
    if (!Array.isArray(updatedRequests)) {
      throw new Error('Invalid requests bulk dataset');
    }

    await MongoRequest.deleteMany({});
    const items = updatedRequests.map(r => ({
      customId: r.id || `req-${Math.floor(Math.random() * 9000) + 1000}-${Date.now().toString().slice(-4)}`,
      type: r.type,
      submissionDate: r.submissionDate || new Date().toISOString().split('T')[0],
      startDate: r.startDate,
      endDate: r.endDate,
      purpose: r.purpose,
      employeeId: r.employeeId || '',
      employeeEmail: r.employeeEmail?.toString().trim().toLowerCase() || '',
      employeePhoneNumber: r.employeePhoneNumber || '',
      employeeName: r.employeeName || '',
      recordDetails: r.recordDetails || null,
      status: r.status || 'Pending',
      approver: r.approver || 'OIC Provincial Director',
      remarks: r.remarks || 'Awaiting final review',
      leaveType: r.leaveType || '',
      detailsType: r.detailsType || '',
      detailsSpecify: r.detailsSpecify || '',
      commutation: r.commutation || 'Not Requested',
      workingDays: r.workingDays || 1,
      attachments: r.attachments || [],
      signatureData: r.signatureData || '',
      employeeSignature: r.employeeSignature || r.employeeName || '',
      employeeSignedAt: r.employeeSignedAt || '',
      stage: r.stage || 'PM',
      supervisorSignature: r.supervisorSignature || '',
      supervisorRemarks: r.supervisorRemarks || '',
      supervisorApprovedAt: r.supervisorApprovedAt || '',
      supervisorName: r.supervisorName || '',
      directorSignature: r.directorSignature || '',
      directorRemarks: r.directorRemarks || '',
      directorApprovedAt: r.directorApprovedAt || '',
      directorName: r.directorName || '',
      approvedBy: r.approvedBy || '',
      approvedAt: r.approvedAt || '',
      statusHistory: Array.isArray(r.statusHistory) ? r.statusHistory : []
    }));
    await MongoRequest.insertMany(items);
    const freshList = await MongoRequest.find().sort({ createdAt: -1 });
    return freshList.map(item => {
      const obj = item.toObject();
      obj.id = obj.customId;
      return obj;
    });
  }
};
