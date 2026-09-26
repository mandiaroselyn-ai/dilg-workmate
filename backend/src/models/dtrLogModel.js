import mongoose from 'mongoose';
import { isConnected } from '../config/db.js';

const DtrLogSchema = new mongoose.Schema({
  customId: { type: String, required: true },
  date: { type: String, required: true },
  timeIn: { type: String, required: true },
  timeOut: { type: String, default: null },
  location: { type: String, required: true },
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
    location: { type: String },
    barangayLgu: { type: String },
    task: { type: String }
  },
  fingerprintVerified: { type: Boolean, default: false },
  fingerprintHash: { type: String, default: '' },
  fingerprintProof: { type: String, default: '' },
  faceVerified: { type: Boolean, default: false },
  faceMatchConfidence: { type: Number, default: 0 },
  faceVerificationProvider: { type: String, default: '' },
  faceVerifiedAt: { type: Date, default: null },
  selfieUrl: { type: String, default: '' },
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
  lastLocationUpdate: { type: Date }
}, { timestamps: true });

const MongoDtrLog = mongoose.models.DtrLog || mongoose.model('DtrLog', DtrLogSchema);

function ensureConnected() {
  if (!isConnected()) {
    throw new Error('MongoDB is not connected.');
  }
}

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
    const customId = logData.id || `att-${Date.now()}`;
    const newLogData = {
      customId,
      date: logData.date,
      timeIn: logData.timeIn,
      timeOut: logData.timeOut || null,
      location: logData.location,
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
      workAssignment: logData.workAssignment || null,
      fingerprintVerified: logData.fingerprintVerified || false,
      fingerprintProof: logData.fingerprintProof || '',
      fingerprintHash: logData.fingerprintHash || null,
      selfieUrl: logData.selfieUrl || null,
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
    return MongoDtrLog.findOne({
      timeOut: null,
      employeeId,
      ...(date ? { date } : {})
    }).sort({ createdAt: -1 });
  },

  closeActiveLog: async (timeOut, employeeId, date, location = {}) => {
    ensureConnected();
    const activeLog = await MongoDtrLog.findOne({
      timeOut: null,
      employeeId,
      ...(date ? { date } : {})
    }).sort({ createdAt: -1 });
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

  bulkUpdate: async (updatedHistory) => {
    ensureConnected();
    if (!Array.isArray(updatedHistory)) {
      throw new Error('Invalid DTR bulk dataset');
    }

    await MongoDtrLog.deleteMany({});
    const items = updatedHistory.map(h => ({
      customId: h.id || `att-${Date.now()}-${Math.random().toString().slice(-3)}`,
      date: h.date,
      timeIn: h.timeIn,
      timeOut: h.timeOut || null,
      location: h.location,
      gpsStatus: h.gpsStatus || 'In Range',
      latitude: h.latitude,
      longitude: h.longitude,
      assignedLatitude: h.assignedLatitude,
      assignedLongitude: h.assignedLongitude,
      distanceToAssignmentMeters: h.distanceToAssignmentMeters,
      assignmentMatch: h.assignmentMatch || false,
      selfieLatitude: h.selfieLatitude,
      selfieLongitude: h.selfieLongitude,
      status: h.status || 'Present',
      workAssignment: h.workAssignment || null,
      fingerprintVerified: h.fingerprintVerified || false,
      fingerprintHash: h.fingerprintHash || null,
      selfieUrl: h.selfieUrl || null,
      employeeName: h.employeeName || null,
      employeeRole: h.employeeRole || null,
      employeeOffice: h.employeeOffice || null,
      employeeId: h.employeeId || null
    }));
    await MongoDtrLog.insertMany(items);
    const freshLogs = await MongoDtrLog.find().sort({ createdAt: -1 });
    return freshLogs.map(item => {
      const obj = item.toObject();
      obj.id = obj.customId;
      return obj;
    });
  },

  // Add location tracking record to active DTR log
  updateLocationHistory: async (employeeId, locationData) => {
    ensureConnected();
    const activeLog = await MongoDtrLog.findOne({ timeOut: null, employeeId }).sort({ createdAt: -1 });
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
      activeLog.latitude = locationData.latitude;
      activeLog.longitude = locationData.longitude;
      activeLog.gpsStatus = locationData.withinGeofence ? 'In Range' : 'Out of Range';
      activeLog.distanceToAssignmentMeters = locationData.distanceFromAssignment;
      activeLog.assignmentMatch = locationData.withinGeofence;

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
    const activeLog = await MongoDtrLog.findOne({ timeOut: null, employeeId }).sort({ createdAt: -1 });
    if (activeLog) {
      return {
        locationHistory: activeLog.locationHistory,
        geofenceEvents: activeLog.geofenceEvents,
        siteVisits: activeLog.siteVisits,
        totalDistance: activeLog.totalDistanceTraveledMeters
      };
    }
    return null;
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
