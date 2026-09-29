import mongoose from 'mongoose';
import { isConnected } from '../config/db.js';
import { createRecordId } from '../utils/recordId.js';

const DtrLogSchema = new mongoose.Schema({
  customId: { type: String, required: true },
  date: { type: String, required: true },
  timeIn: { type: String, required: true },
  timeOut: { type: String, default: null },
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
  currentWithinGeofence: { type: Boolean }
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

export const DtrLog = {
  findRecent: async (limit = 500) => {
    ensureConnected();
    const mongoLogs = await MongoDtrLog.find({})
      .select('-selfieUrl -locationHistory -siteVisits -geofenceEvents')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return mongoLogs.map(obj => ({ ...obj, id: obj.customId }));
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

  closeActiveLog: async (timeOut, employeeId, date, location = {}) => {
    ensureConnected();
    const activeLog = await MongoDtrLog.findOne(openShiftFilter(employeeId, date)).sort({ createdAt: -1 });
    if (activeLog) {
      activeLog.timeOut = timeOut;
      activeLog.timeOutLatitude = location.latitude ?? null;
      activeLog.timeOutLongitude = location.longitude ?? null;
      activeLog.timeOutGpsAccuracy = location.accuracy ?? null;
      await activeLog.save();
      const obj = activeLog.toObject();
      obj.id = obj.customId;
      return obj;
    }
    return null;
  },

  // Applies HR corrections and verifications. Each update names one existing record by
  // `id` and only the HR-editable fields it changes, so fields HR did not touch (such as a
  // Time Out recorded after HR loaded the page) are never overwritten.
  bulkUpdate: async (updates) => {
    ensureConnected();
    if (!Array.isArray(updates) || updates.some(update => typeof update?.id !== 'string' || !update.id)) {
      throw new Error('Each attendance update must include a record id.');
    }

    const operations = updates.map(update => {
      const changes = {};
      for (const field of HR_EDITABLE_FIELDS) {
        if (update[field] !== undefined) changes[field] = update[field];
      }
      return { id: update.id, changes };
    }).filter(({ changes }) => Object.keys(changes).length > 0);

    if (operations.length) {
      await MongoDtrLog.bulkWrite(operations.map(({ id, changes }) => ({
        updateOne: { filter: { customId: id }, update: { $set: changes } }
      })));
    }
    const updatedLogs = await MongoDtrLog.find({ customId: { $in: operations.map(({ id }) => id) } });
    return updatedLogs.map(toClientLog);
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
        currentLatitude: 1,
        currentLongitude: 1,
        currentGpsStatus: 1,
        currentDistanceMeters: 1,
        currentWithinGeofence: 1,
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
        locationHistory: { $slice: -1 },
        lastLocationUpdate: 1,
        createdAt: 1
      }
    ).sort({ lastLocationUpdate: -1, createdAt: -1 }).lean();

    return activeLogs.map(log => {
      const latestPoint = log.locationHistory?.[0];
      return {
        id: log.customId,
        employeeId: log.employeeId,
        employeeEmail: log.employeeEmail,
        employeeName: log.employeeName,
        employeeOffice: log.employeeOffice,
        location: log.location,
        workAssignment: log.workAssignment,
        // Live map shows the latest tracked position, falling back to the clock-in position.
        latitude: log.currentLatitude ?? log.latitude,
        longitude: log.currentLongitude ?? log.longitude,
        assignedLatitude: log.assignedLatitude,
        assignedLongitude: log.assignedLongitude,
        distanceToAssignmentMeters: log.currentDistanceMeters ?? log.distanceToAssignmentMeters,
        assignmentMatch: log.currentWithinGeofence ?? log.assignmentMatch,
        gpsStatus: log.currentGpsStatus ?? log.gpsStatus,
        gpsAccuracy: latestPoint?.accuracy ?? null,
        lastLocationUpdate: log.lastLocationUpdate || latestPoint?.timestamp || log.createdAt
      };
    });
  }
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
