import mongoose from 'mongoose';
import { isConnected } from '../config/db.js';
import { createRecordId } from '../utils/recordId.js';
import { clockTextMinutes, isLateTimeText } from '../utils/attendanceTime.js';

// A Time In or Time Out made in the phone app without internet and sent later.
const OfflineEntrySchema = new mongoose.Schema({
  // The phone's clock when it was made, and when it reached the server.
  recordedAt: Date,
  syncedAt: Date,
  // How far the phone's clock was from the server's when it was sent.
  phoneClockOffsetSeconds: Number,
  // Time In only: the signed Time In's unique value.
  nonce: String,
  // Why HR must check it; empty when every check passed.
  reviewReasons: { type: [String], default: [] },
  // HR's decision on one with review reasons. A Time In is approved or rejected; a Time Out
  // is approved, or corrected when HR enters the right Time Out.
  decision: { type: String, enum: ['', 'approved', 'rejected', 'corrected'], default: '' },
  decidedBy: String,
  decidedAt: Date
}, { _id: false });

const DtrLogSchema = new mongoose.Schema({
  customId: { type: String, required: true },
  date: { type: String, required: true },
  timeIn: { type: String, required: true },
  // When the Time In happened (for an offline Time In, the phone's clock at the time).
  timeInAt: { type: Date, default: null },
  offlineTimeIn: { type: OfflineEntrySchema, default: null },
  timeOut: { type: String, default: null },
  offlineTimeOut: { type: OfflineEntrySchema, default: null },
  location: { type: String, required: true },
  dutyType: { type: String, enum: ['office', 'wfh', 'field'], default: null },
  assignmentSite: {
    mode: { type: String, enum: ['office', 'wfh', 'field'] },
    municipality: String,
    barangay: String,
    officeId: String,
    street: String,
    landmark: String,
    label: String,
    query: String,
    displayName: String,
    latitude: Number,
    longitude: Number,
    geometry: mongoose.Schema.Types.Mixed,
    bounds: {
      south: Number,
      north: Number,
      west: Number,
      east: Number
    },
    fallbackToRadius: Boolean,
    source: String
  },
  gpsStatus: { type: String, default: 'In Range' },
  latitude: { type: Number },
  longitude: { type: Number },
  assignedLatitude: { type: Number },
  assignedLongitude: { type: Number },
  distanceToAssignmentMeters: { type: Number },
  assignmentMatch: { type: Boolean, default: false },
  selfieLatitude: { type: Number },
  selfieLongitude: { type: Number },
  status: { type: String, default: 'Present' },
  workAssignment: {
    assignmentRole: { type: String, enum: ['office', 'wfh', 'field'] },
    location: { type: String },
    municipality: { type: String },
    barangayLgu: { type: String },
    officeId: { type: String },
    street: { type: String },
    landmark: { type: String },
    task: { type: String }
  },
  fingerprintVerified: { type: Boolean, default: false },
  fingerprintHash: { type: String, default: '' },
  fingerprintProof: { type: String, default: '' },
  // 'browser' or 'phone-app': the registered fingerprint this Time In matched.
  fingerprintMethod: { type: String, enum: ['', 'browser', 'phone-app'], default: '' },
  faceVerified: { type: Boolean, default: false },
  faceMatchConfidence: { type: Number, default: null },
  faceMatchDistance: { type: Number, default: null },
  faceVerificationProvider: { type: String, default: '' },
  faceVerifiedAt: { type: Date, default: null },
  faceLivenessVerified: { type: Boolean, default: false },
  faceLivenessConfidence: { type: Number, default: 0 },
  faceLivenessProvider: { type: String, default: '' },
  deviceId: { type: String, default: '' },
  selfieUrl: { type: String, default: '' },
  verificationAudit: { type: mongoose.Schema.Types.Mixed, default: null },
  late: { type: Boolean, default: false },
  employeeName: { type: String },
  employeeRole: { type: String },
  employeeOffice: { type: String },
  employeeId: { type: String },
  employeeEmail: { type: String },
  timeOutLatitude: { type: Number },
  timeOutLongitude: { type: Number },
  timeOutGpsAccuracy: { type: Number },
  // Location History Tracking
  locationHistory: [{
    timestamp: { type: Date, default: Date.now },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    accuracy: { type: Number }, // GPS accuracy in meters
    withinGeofence: { type: Boolean, default: false },
    distanceFromAssignment: { type: Number }
  }],
  // Site visits tracking
  siteVisits: [{
    siteName: String,
    siteCoordinates: { lat: Number, lon: Number },
    entryTime: Date,
    exitTime: Date,
    durationMinutes: Number,
    withinGeofence: Boolean
  }],
  // Geofence events
  geofenceEvents: [{
    timestamp: Date,
    eventType: { type: String, enum: ['entry', 'exit'] }, // entry or exit
    latitude: Number,
    longitude: Number,
    siteName: String
  }],
  totalDistanceTraveledMeters: { type: Number, default: 0 },
  lastLocationUpdate: { type: Date },
  // Latest live-tracking position. Kept separate so the clock-in location and
  // clock-in geofence result above stay as they were recorded.
  currentLatitude: { type: Number },
  currentLongitude: { type: Number },
  currentGpsStatus: { type: String },
  currentDistanceMeters: { type: Number },
  currentWithinGeofence: { type: Boolean },
  currentAccuracy: { type: Number }
}, { timestamps: true });

const MongoDtrLog = mongoose.models.DtrLog || mongoose.model('DtrLog', DtrLogSchema);

function ensureConnected() {
  if (!isConnected()) {
    throw new Error('MongoDB is not connected.');
  }
}

// A shift left open for longer than this (for example, a forgotten Time Out) is no
// longer treated as the employee's active shift. It stays open so HR still sees the
// missing Time Out, but it no longer receives live tracking or new Time Outs.
const ACTIVE_SHIFT_WINDOW_MS = 18 * 60 * 60 * 1000;
const activeShiftSince = () => new Date(Date.now() - ACTIVE_SHIFT_WINDOW_MS);

// Matches the employee's open shift for the given date, or any open shift started
// within the active window (covers records dated before the Manila date fix).
const openShiftFilter = (employeeId, date) => ({
  timeOut: null,
  employeeId,
  $or: [
    ...(date ? [{ date }] : []),
    { createdAt: { $gte: activeShiftSince() } }
  ]
});

const EVIDENCE_FIELDS = '-selfieUrl -locationHistory -siteVisits -geofenceEvents -fingerprintHash -fingerprintProof';

// Fields HR may change when correcting or verifying an attendance record.
const HR_EDITABLE_FIELDS = ['timeIn', 'timeOut', 'status', 'location', 'workAssignment', 'verificationAudit', 'gpsStatus'];

const toClientLog = item => {
  const obj = typeof item.toObject === 'function' ? item.toObject() : { ...item };
  delete obj.fingerprintHash;
  delete obj.fingerprintProof;
  obj.id = obj.customId;
  return obj;
};

// Lists of records (HR's, and an employee's own history) leave out what makes a record
// large: the selfie (hasSelfie says whether there is one; it is loaded when the record is
// shown), the minute-by-minute GPS history, and the outline of the assigned barangay.
const LIST_OMITTED_FIELDS = ['selfieUrl', 'locationHistory', 'siteVisits', 'geofenceEvents', 'fingerprintHash', 'fingerprintProof'];

const toListLog = item => {
  const obj = typeof item.toObject === 'function' ? item.toObject() : { ...item };
  obj.hasSelfie = Boolean(obj.selfieUrl);
  for (const field of LIST_OMITTED_FIELDS) delete obj[field];
  if (obj.assignmentSite) obj.assignmentSite = { ...obj.assignmentSite, geometry: undefined };
  obj.id = obj.customId;
  return obj;
};

// Records matching `match`, newest first, shaped for lists (see toListLog). The large fields
// are dropped inside the database, before sorting, so they are never loaded here.
const findListLogs = async match => {
  ensureConnected();
  const logs = await MongoDtrLog.aggregate([
    { $match: match },
    // True for a non-empty selfie; false when it is empty, null, or missing.
    { $addFields: { hasSelfie: { $gt: ['$selfieUrl', ''] } } },
    { $project: Object.fromEntries([...LIST_OMITTED_FIELDS, 'assignmentSite.geometry'].map(field => [field, 0])) },
    { $sort: { createdAt: -1 } }
  ]);
  return logs.map(log => ({ ...log, id: log.customId }));
};

export const DtrLog = {
  // Changes on every Time In (a new record) and Time Out (a record closed). The location
  // updates sent every minute during a shift are left out, so HR's attendance list is
  // not downloaded again for each of them.
  updateStamp: async () => {
    ensureConnected();
    const [count, closed, newest] = await Promise.all([
      MongoDtrLog.countDocuments(),
      MongoDtrLog.countDocuments({ timeOut: { $ne: null } }),
      MongoDtrLog.findOne().sort({ createdAt: -1 }).select('createdAt').lean()
    ]);
    return `${count}:${closed}:${newest?.createdAt ? new Date(newest.createdAt).getTime() : 0}`;
  },

  findRecent: async (limit = 500) => {
    ensureConnected();
    const mongoLogs = await MongoDtrLog.find({})
      .select('-selfieUrl -locationHistory -siteVisits -geofenceEvents')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return mongoLogs.map(obj => ({ ...obj, id: obj.customId }));
  },

  // HR's records, newest first and shaped for lists (see toListLog): those dated from
  // `since` (YYYY-MM-DD) on plus every shift still open, or those of one `month` (YYYY-MM).
  findForHrList: async ({ since, month } = {}) => {
    if (month) {
      const [year, monthNumber] = month.split('-').map(Number);
      const next = monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, '0')}`;
      return findListLogs({ date: { $gte: `${month}-01`, $lt: `${next}-01` } });
    }
    return findListLogs(since ? { $or: [{ date: { $gte: since } }, { timeOut: null }] } : {});
  },

  // An employee's own records, newest first and shaped for lists (see toListLog).
  findListForEmployee: async ({ employeeId, email }) => {
    const owners = [
      ...(employeeId ? [{ employeeId }] : []),
      ...(email ? [{ employeeEmail: email }] : [])
    ];
    return owners.length ? findListLogs({ $or: owners }) : [];
  },

  // One record's selfie and whose record it is, for showing that record.
  findSelfie: async id => {
    ensureConnected();
    return MongoDtrLog.findOne({ customId: id }).select('customId selfieUrl employeeId employeeEmail').lean();
  },

  find: async ({ includeEvidence = true } = {}) => {
    ensureConnected();
    const mongoLogs = await MongoDtrLog.find().sort({ createdAt: -1 });
    return mongoLogs.map(item => {
      const obj = item.toObject();
      delete obj.fingerprintHash;
      delete obj.fingerprintProof;
      if (!includeEvidence) {
        delete obj.selfieUrl;
        delete obj.locationHistory;
        delete obj.siteVisits;
        delete obj.geofenceEvents;
      }
      obj.id = obj.customId;
      return obj;
    });
  },

  create: async (logData) => {
    ensureConnected();
    const customId = logData.id || createRecordId('att');
    const newLogData = {
      customId,
      date: logData.date,
      timeIn: logData.timeIn,
      timeInAt: logData.timeInAt || null,
      offlineTimeIn: logData.offlineTimeIn || null,
      timeOut: logData.timeOut || null,
      location: logData.location,
      dutyType: logData.dutyType || null,
      assignmentSite: logData.assignmentSite || null,
      gpsStatus: logData.gpsStatus || 'In Range',
      latitude: logData.latitude,
      longitude: logData.longitude,
      assignedLatitude: logData.assignedLatitude,
      assignedLongitude: logData.assignedLongitude,
      distanceToAssignmentMeters: logData.distanceToAssignmentMeters,
      assignmentMatch: logData.assignmentMatch || false,
      selfieLatitude: logData.selfieLatitude,
      selfieLongitude: logData.selfieLongitude,
      status: logData.status || 'Present',
      late: logData.late === true,
      workAssignment: logData.workAssignment || null,
      fingerprintVerified: logData.fingerprintVerified || false,
      fingerprintProof: logData.fingerprintProof || '',
      fingerprintHash: logData.fingerprintHash || null,
      fingerprintMethod: ['browser', 'phone-app'].includes(logData.fingerprintMethod) ? logData.fingerprintMethod : '',
      selfieUrl: logData.selfieUrl || null,
      faceVerified: logData.faceVerified === true,
      faceMatchConfidence: logData.faceMatchConfidence == null
        ? null
        : Number(logData.faceMatchConfidence) || 0,
      faceMatchDistance: Number.isFinite(Number(logData.faceMatchDistance))
        ? Number(logData.faceMatchDistance)
        : null,
      faceVerificationProvider: logData.faceVerificationProvider || '',
      faceVerifiedAt: logData.faceVerifiedAt || null,
      faceLivenessVerified: logData.faceLivenessVerified === true,
      faceLivenessConfidence: Number(logData.faceLivenessConfidence) || 0,
      faceLivenessProvider: logData.faceLivenessProvider || '',
      deviceId: logData.deviceId || '',
      employeeName: logData.employeeName || null,
      employeeRole: logData.employeeRole || null,
      employeeOffice: logData.employeeOffice || null,
      employeeId: logData.employeeId || null,
      employeeEmail: logData.employeeEmail || null,
      // Initialize location tracking
      locationHistory: logData.locationHistory || [{
        timestamp: new Date(),
        latitude: logData.latitude,
        longitude: logData.longitude,
        accuracy: logData.gpsAccuracy || 0,
        withinGeofence: logData.assignmentMatch || false,
        distanceFromAssignment: logData.distanceToAssignmentMeters
      }],
      siteVisits: logData.siteVisits || [],
      geofenceEvents: logData.geofenceEvents || [],
      totalDistanceTraveledMeters: 0,
      lastLocationUpdate: new Date()
    };

    const mongoLog = await MongoDtrLog.create(newLogData);
    const obj = mongoLog.toObject();
    obj.id = obj.customId;
    return obj;
  },

  // The employee's saved offline Time In with this nonce, shaped for lists, or null.
  findOfflineTimeIn: async (employeeId, nonce) => {
    ensureConnected();
    const log = await MongoDtrLog.findOne({ employeeId, 'offlineTimeIn.nonce': nonce }).lean();
    return log ? toListLog(log) : null;
  },

  findActiveByEmployee: async (employeeId, date) => {
    ensureConnected();
    return MongoDtrLog.findOne(openShiftFilter(employeeId, date)).sort({ createdAt: -1 });
  },

  // The employee's current open shift without selfie or tracking history, for
  // frequent checks such as live location updates.
  findActiveShift: async (employeeId) => {
    ensureConnected();
    if (!employeeId) return null;
    return MongoDtrLog.findOne(openShiftFilter(employeeId))
      .select(EVIDENCE_FIELDS)
      .sort({ createdAt: -1 })
      .lean();
  },

  // Records belonging to one employee, matched by employee ID or email in the database.
  findForEmployee: async ({ employeeId, email }, { includeEvidence = true } = {}) => {
    ensureConnected();
    const owners = [
      ...(employeeId ? [{ employeeId }] : []),
      ...(email ? [{ employeeEmail: email }] : [])
    ];
    if (!owners.length) return [];
    const query = MongoDtrLog.find({ $or: owners }).sort({ createdAt: -1 });
    if (!includeEvidence) query.select(EVIDENCE_FIELDS);
    const logs = await query;
    return logs.map(toClientLog);
  },

  // `offlineTimeOut` describes a Time Out saved on the phone without internet.
  closeActiveLog: async (timeOut, employeeId, date, location = {}, offlineTimeOut = null) => {
    ensureConnected();
    const activeLog = await MongoDtrLog.findOne(openShiftFilter(employeeId, date)).sort({ createdAt: -1 });
    if (activeLog) {
      activeLog.timeOut = timeOut;
      activeLog.timeOutLatitude = location.latitude ?? null;
      activeLog.timeOutLongitude = location.longitude ?? null;
      activeLog.timeOutGpsAccuracy = location.accuracy ?? null;
      activeLog.offlineTimeOut = offlineTimeOut;
      await activeLog.save();
      const obj = activeLog.toObject();
      obj.id = obj.customId;
      return obj;
    }
    return null;
  },

  // Applies HR corrections, verifications, and decisions (see hrUpdateOperations).
  bulkUpdate: async (updates, { reviewer = '' } = {}) => {
    ensureConnected();
    const operations = hrUpdateOperations(updates, reviewer);
    if (operations.length) {
      await MongoDtrLog.bulkWrite(operations.map(({ filter, changes }) => ({
        updateOne: { filter, update: { $set: changes } }
      })));
    }
    const updatedLogs = await MongoDtrLog.find({ customId: { $in: [...new Set(operations.map(({ id }) => id))] } });
    return updatedLogs.map(toListLog);
  },

  // Add location tracking record to active DTR log
  updateLocationHistory: async (employeeId, locationData) => {
    ensureConnected();
    const activeLog = await MongoDtrLog.findOne(openShiftFilter(employeeId)).sort({ createdAt: -1 });
    if (activeLog) {
      const previousPoint = activeLog.locationHistory[activeLog.locationHistory.length - 1] || null;
      const newLocationRecord = {
        timestamp: new Date(),
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        accuracy: locationData.accuracy || 0,
        withinGeofence: locationData.withinGeofence || false,
        distanceFromAssignment: locationData.distanceFromAssignment
      };

      activeLog.locationHistory.push(newLocationRecord);
      activeLog.lastLocationUpdate = new Date();
      activeLog.currentLatitude = locationData.latitude;
      activeLog.currentLongitude = locationData.longitude;
      activeLog.currentGpsStatus = locationData.withinGeofence ? 'In Range' : 'Out of Range';
      activeLog.currentDistanceMeters = locationData.distanceFromAssignment;
      activeLog.currentWithinGeofence = Boolean(locationData.withinGeofence);
      activeLog.currentAccuracy = locationData.accuracy;

      // Calculate distance traveled (basic haversine distance)
      if (previousPoint) {
        const distance = calculateDistance(previousPoint.latitude, previousPoint.longitude, newLocationRecord.latitude, newLocationRecord.longitude);
        activeLog.totalDistanceTraveledMeters += distance;
      }

      // Detect geofence transitions and create event history
      if (previousPoint && previousPoint.withinGeofence !== newLocationRecord.withinGeofence) {
        const eventType = newLocationRecord.withinGeofence ? 'entry' : 'exit';
        activeLog.geofenceEvents.push({
          timestamp: new Date(),
          eventType,
          latitude: newLocationRecord.latitude,
          longitude: newLocationRecord.longitude,
          siteName: activeLog.workAssignment?.location || activeLog.location || 'Assigned Site'
        });
      }

      // Track site visit durations while inside assigned area
      const siteName = activeLog.workAssignment?.location || activeLog.location || 'Assigned Site';
      const now = new Date();
      const openVisit = activeLog.siteVisits.find(visit => !visit.exitTime);

      if (newLocationRecord.withinGeofence) {
        if (!openVisit) {
          activeLog.siteVisits.push({
            siteName,
            siteCoordinates: {
              lat: activeLog.assignedLatitude || newLocationRecord.latitude,
              lon: activeLog.assignedLongitude || newLocationRecord.longitude
            },
            entryTime: now,
            exitTime: null,
            durationMinutes: 0,
            withinGeofence: true
          });
        } else if (openVisit.siteName !== siteName) {
          openVisit.exitTime = now;
          openVisit.durationMinutes = calculateDurationMinutes(openVisit.entryTime, now);
          openVisit.withinGeofence = false;
          activeLog.siteVisits.push({
            siteName,
            siteCoordinates: {
              lat: activeLog.assignedLatitude || newLocationRecord.latitude,
              lon: activeLog.assignedLongitude || newLocationRecord.longitude
            },
            entryTime: now,
            exitTime: null,
            durationMinutes: 0,
            withinGeofence: true
          });
        }
      } else if (openVisit) {
        openVisit.exitTime = now;
        openVisit.durationMinutes = calculateDurationMinutes(openVisit.entryTime, now);
        openVisit.withinGeofence = false;
      }

      await activeLog.save();
      const obj = activeLog.toObject();
      obj.id = obj.customId;
      return obj;
    }
    return null;
  },

  // Get location history for an active DTR log
  getLocationHistory: async (employeeId) => {
    ensureConnected();
    const activeLog = await MongoDtrLog.findOne(openShiftFilter(employeeId)).sort({ createdAt: -1 });
    if (activeLog) {
      return {
        locationHistory: activeLog.locationHistory,
        geofenceEvents: activeLog.geofenceEvents,
        siteVisits: activeLog.siteVisits,
        totalDistance: activeLog.totalDistanceTraveledMeters
      };
    }
    return null;
  },

  getActiveLocationTracking: async () => {
    ensureConnected();
    const activeLogs = await MongoDtrLog.find(
      { timeOut: null, createdAt: { $gte: activeShiftSince() } },
      {
        customId: 1,
        employeeId: 1,
        employeeEmail: 1,
        employeeName: 1,
        employeeOffice: 1,
        location: 1,
        workAssignment: 1,
        latitude: 1,
        longitude: 1,
        assignedLatitude: 1,
        assignedLongitude: 1,
        distanceToAssignmentMeters: 1,
        assignmentMatch: 1,
        gpsStatus: 1,
        currentLatitude: 1,
        currentLongitude: 1,
        currentDistanceMeters: 1,
        currentWithinGeofence: 1,
        currentAccuracy: 1,
        date: 1,
        timeIn: 1,
        // The first point is the one recorded at Time In.
        locationHistory: { $slice: 1 },
        // The latest time the employee left or came back to their assigned area.
        geofenceEvents: { $slice: -1 },
        lastLocationUpdate: 1,
        createdAt: 1,
        'assignmentSite.label': 1
      }
    ).sort({ lastLocationUpdate: -1, createdAt: -1 }).lean();

    const now = new Date();
    return activeLogs.map(log => liveLocationFromLog(log, now));
  }
};

// The database changes for HR's updates to attendance records, as { id, filter, changes }.
// Each update names one existing record by `id` and only the HR-editable fields it changes,
// so fields HR did not touch (such as a Time Out recorded after HR loaded the page) are
// never overwritten. `offlineDecision` ('approved' or 'rejected') decides an offline Time In
// that needs review, and `offlineTimeOutDecision` ('approved') an offline Time Out; both
// are signed by `reviewer`.
export const hrUpdateOperations = (updates, reviewer = '', now = new Date()) => {
  if (!Array.isArray(updates) || updates.some(update => typeof update?.id !== 'string' || !update.id)) {
    throw new Error('Each attendance update must include a record id.');
  }
  const decided = (entry, decision) => ({
    [`${entry}.decision`]: decision,
    [`${entry}.decidedBy`]: reviewer,
    [`${entry}.decidedAt`]: now
  });
  // Only an offline Time In or Time Out that needed review can be decided.
  const needingReview = (id, entry) => ({ customId: id, [`${entry}.reviewReasons.0`]: { $exists: true } });

  return updates.flatMap(update => {
    const { id } = update;
    const changes = {};
    for (const field of HR_EDITABLE_FIELDS) {
      if (update[field] !== undefined) changes[field] = update[field];
    }
    // A corrected Time In decides again whether the employee was late.
    if (changes.timeIn !== undefined) {
      const late = isLateTimeText(changes.timeIn);
      if (late === null) throw new Error('Time In must be a time such as 08:05 AM.');
      changes.late = late;
    }
    if (changes.timeOut != null && clockTextMinutes(changes.timeOut) === null) {
      throw new Error('Time Out must be a time such as 05:00 PM, or left empty.');
    }

    const operations = Object.keys(changes).length ? [{ id, filter: { customId: id }, changes }] : [];
    if (update.offlineDecision !== undefined) {
      if (!['approved', 'rejected'].includes(update.offlineDecision)) {
        throw new Error('An offline Time In can only be approved or rejected.');
      }
      operations.push({ id, filter: needingReview(id, 'offlineTimeIn'), changes: decided('offlineTimeIn', update.offlineDecision) });
    }
    if (update.offlineTimeOutDecision !== undefined) {
      if (update.offlineTimeOutDecision !== 'approved') {
        throw new Error('An offline Time Out can only be approved, or corrected with the right Time Out.');
      }
      operations.push({ id, filter: needingReview(id, 'offlineTimeOut'), changes: decided('offlineTimeOut', 'approved') });
    }
    // A Time Out HR corrects replaces an offline one still waiting for review.
    if (changes.timeOut !== undefined) {
      operations.push({
        id,
        filter: { ...needingReview(id, 'offlineTimeOut'), 'offlineTimeOut.decision': '' },
        changes: decided('offlineTimeOut', 'corrected')
      });
    }
    return operations;
  });
};

// Positions less precise than this are not used for live tracking: a laptop or desktop
// browser only estimates its location from the internet connection, often kilometres off.
export const MAX_TRACKING_ACCURACY_METERS = 100;

// One entry of HR's live map from an open attendance record (with its first location
// point, the one recorded at Time In, and its latest geofence event). The position is the
// latest phone GPS the app sent while open; until one arrives, the GPS taken at Time In.
export const liveLocationFromLog = (log, now = new Date()) => {
  const timeInPoint = log.locationHistory?.[0];
  const tracked = Number.isFinite(log.currentLatitude)
    && Number.isFinite(log.currentLongitude)
    && Number.isFinite(log.currentAccuracy)
    && log.currentAccuracy <= MAX_TRACKING_ACCURACY_METERS;
  const inside = tracked ? log.currentWithinGeofence === true : /in range/i.test(log.gpsStatus || '');
  const lastGpsAt = new Date((tracked && log.lastLocationUpdate) || timeInPoint?.timestamp || log.createdAt);
  const lastEvent = log.geofenceEvents?.[0];
  return {
    id: log.customId,
    employeeId: log.employeeId,
    employeeEmail: log.employeeEmail,
    employeeName: log.employeeName,
    employeeOffice: log.employeeOffice,
    location: log.location,
    workAssignment: log.workAssignment,
    latitude: tracked ? log.currentLatitude : log.latitude,
    longitude: tracked ? log.currentLongitude : log.longitude,
    assignedLatitude: log.assignedLatitude,
    assignedLongitude: log.assignedLongitude,
    distanceToAssignmentMeters: tracked ? log.currentDistanceMeters : log.distanceToAssignmentMeters,
    assignmentMatch: inside,
    gpsStatus: inside ? 'In Range' : 'Out of Range',
    gpsAccuracy: tracked ? log.currentAccuracy : timeInPoint?.accuracy ?? null,
    // When that position was taken, and how many seconds before this answer (so HR's
    // screen can tell a lost signal even if its clock is off).
    lastGpsAt: lastGpsAt.toISOString(),
    lastGpsAgeSeconds: Math.max(0, Math.round((now.getTime() - lastGpsAt.getTime()) / 1000)),
    // When the employee left their assigned area, while they are still outside it.
    leftAreaAt: !inside && lastEvent?.eventType === 'exit' ? new Date(lastEvent.timestamp).toISOString() : null,
    // Where the employee was when they timed in, which Time In checked against the area.
    timeInGps: {
      latitude: log.latitude,
      longitude: log.longitude,
      gpsStatus: log.gpsStatus,
      accuracy: timeInPoint?.accuracy ?? null
    },
    date: log.date,
    timeIn: log.timeIn,
    // The name of the area the employee chose at Time In, shown on HR's live map.
    assignmentArea: log.assignmentSite?.label ? { label: log.assignmentSite.label } : null
  };
};

// Helper function to calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c); // Distance in meters
}

function calculateDurationMinutes(startDate, endDate) {
  const diffMs = Math.max(0, new Date(endDate) - new Date(startDate));
  return Math.round(diffMs / 60000);
}
