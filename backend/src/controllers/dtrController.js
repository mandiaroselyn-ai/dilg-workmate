import { DtrLog } from '../models/dtrLogModel.js';
import { User } from '../models/User.js';
import crypto from 'crypto';
import { verifyVerificationProof } from '../utils/verificationProof.js';
import { isWithinAssignedLocation, resolveAssignedLocation } from '../services/assignedLocationService.js';

const GEO_THRESHOLD_METERS = 150;

const ASSIGNED_LOCATION_MAP = {
  Boac: { lat: 13.4474, lon: 121.8344 },
  Mogpog: { lat: 13.4983, lon: 121.8601 },
  Gasan: { lat: 13.3197, lon: 121.8464 },
  Buenavista: { lat: 13.4250, lon: 121.7417 },
  Torrijos: { lat: 13.4077, lon: 121.7860 },
  'Santa Cruz': { lat: 13.5355, lon: 121.9754 },
  'Marinduque Provincial Office': { lat: 13.4474, lon: 121.8344 },
  'Office Station': { lat: 13.4474, lon: 121.8344 }
};

const computeDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
};

const normalizeLocationKey = (value) => {
  if (!value || typeof value !== 'string') return null;
  return value.trim().replace(/,\s*Marinduque$/i, '').replace(/\s+Office\s*Only$/i, '').trim();
};

const resolveAssignedCoords = (record) => {
  if (Number.isFinite(Number(record.assignedLatitude)) && Number.isFinite(Number(record.assignedLongitude))) {
    return { lat: Number(record.assignedLatitude), lon: Number(record.assignedLongitude) };
  }

  if (Number.isFinite(Number(record.latitude)) && Number.isFinite(Number(record.longitude))) {
    return { lat: Number(record.latitude), lon: Number(record.longitude) };
  }

  const locationKey = normalizeLocationKey(record.workAssignment?.location || record.location);
  if (locationKey && ASSIGNED_LOCATION_MAP[locationKey]) {
    return ASSIGNED_LOCATION_MAP[locationKey];
  }

  const barangayKey = normalizeLocationKey(record.workAssignment?.barangayLgu);
  if (barangayKey && ASSIGNED_LOCATION_MAP[barangayKey]) {
    return ASSIGNED_LOCATION_MAP[barangayKey];
  }

  if (locationKey && ASSIGNED_LOCATION_MAP[locationKey.split(',')[0]]) {
    return ASSIGNED_LOCATION_MAP[locationKey.split(',')[0]];
  }

  if (record.location && record.location.toLowerCase().includes('office')) {
    return ASSIGNED_LOCATION_MAP['Office Station'];
  }

  return null;
};

export const getDtrLogs = async (req, res) => {
  try {
    const isEmployee = req.user?.accessLevel === 'employee';
    const logs = await DtrLog.find({ includeEvidence: !isEmployee });
    const visibleLogs = isEmployee
      ? logs.filter(log => log.employeeId === req.user.employeeId || log.employeeEmail === req.user.email)
      : logs;
    res.status(200).json(visibleLogs);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const clockInOut = async (req, res) => {
  try {
    const { action } = req.body;
    const record = { ...(req.body.record || {}) };
    if (req.user?.accessLevel === 'employee') {
      record.employeeId = req.user.employeeId;
      record.employeeEmail = req.user.email;
      record.employeeName = req.user.name;
      record.employeeRole = req.user.role;
      record.employeeOffice = req.user.office;
    }

    if (action === 'clock-in') {
      if (!record || typeof record !== 'object') {
        return res.status(400).json({ success: false, error: 'Invalid attendance payload.' });
      }

      const requiredFields = ['latitude', 'longitude', 'gpsStatus', 'selfieUrl', 'fingerprintVerified', 'assignmentSite'];
      for (const field of requiredFields) {
        if (record[field] === undefined || record[field] === null) {
          return res.status(400).json({ success: false, error: `Missing required field: ${field}.` });
        }
      }

      if (record.gpsStatus !== 'In Range') {
        return res.status(400).json({ success: false, error: 'GPS must be in-range before clock-in.' });
      }

      const gpsAccuracy = Number(record.gpsAccuracy);
      if (!Number.isFinite(gpsAccuracy) || gpsAccuracy < 0 || gpsAccuracy > 50) {
        return res.status(400).json({ success: false, error: 'GPS accuracy must be 50 meters or better. Move outdoors or near a window and retry.' });
      }

      const user = await User.findByEmployeeId(record.employeeId);
      if (!user) {
        return res.status(400).json({ success: false, error: 'Employee record not found for fingerprint verification.' });
      }

      const fallbackLocation = user.assignedStation || user.office || user.region;
      if (!resolveAssignedCoords(record) && fallbackLocation) {
        record.workAssignment = {
          ...(record.workAssignment || {}),
          location: fallbackLocation,
          barangayLgu: record.workAssignment?.barangayLgu || fallbackLocation
        };
      }

      const resolvedAssignment = record.assignmentSite
        ? await resolveAssignedLocation(record.assignmentSite)
        : null;
      const assignedCoords = resolvedAssignment
        ? { lat: resolvedAssignment.latitude, lon: resolvedAssignment.longitude }
        : resolveAssignedCoords(record);
      if (!assignedCoords) {
        return res.status(400).json({ success: false, error: 'Unable to resolve assigned location for this record.' });
      }

      const distance = computeDistanceMeters(
        Number(record.latitude),
        Number(record.longitude),
        Number(assignedCoords.lat),
        Number(assignedCoords.lon)
      );

      record.assignedLatitude = assignedCoords.lat;
      record.assignedLongitude = assignedCoords.lon;
      record.distanceToAssignmentMeters = distance;
      record.assignmentSite = resolvedAssignment || record.assignmentSite;
      record.assignmentMatch = resolvedAssignment
        ? isWithinAssignedLocation(record.latitude, record.longitude, resolvedAssignment)
        : distance <= GEO_THRESHOLD_METERS;

      if (!record.assignmentMatch) {
        return res.status(400).json({
          success: false,
          error: resolvedAssignment
            ? `GPS is outside the selected assignment area: ${resolvedAssignment.label}. Move to the assigned location and retry.`
            : `Assigned location mismatch. Distance is ${distance} meters, which exceeds the ${GEO_THRESHOLD_METERS}m limit.`
        });
      }

      if (!record.selfieUrl) {
        return res.status(400).json({ success: false, error: 'Selfie verification is required for clock-in.' });
      }

      if (!record.fingerprintVerified || !verifyVerificationProof(record.fingerprintProof, {
        employeeId: record.employeeId,
        type: 'fingerprint'
      })) {
        return res.status(400).json({ success: false, error: 'A valid server biometric assertion is required for clock-in.' });
      }

      const storedHash = user.fingerprintHash || '';
      const providedHash = record.fingerprintHash || '';

      if (storedHash && !providedHash) {
        return res.status(400).json({ success: false, error: 'Missing fingerprint hash in attendance record.' });
      }

      if (storedHash && providedHash && storedHash !== providedHash) {
        return res.status(400).json({ success: false, error: 'Fingerprint does not match registered fingerprint.' });
      }

      const existingLog = await DtrLog.findActiveByEmployee(record.employeeId, record.date);
      if (existingLog) {
        return res.status(409).json({ success: false, error: 'Employee already has an active attendance record for this date.' });
      }

      const newLog = await DtrLog.create({
        ...record,
        faceVerified: false,
        faceMatchConfidence: 0,
        faceVerifiedAt: null,
        faceLivenessVerified: false,
        faceLivenessConfidence: 0,
        faceVerificationProvider: 'ordinary-selfie-no-liveness',
        faceLivenessProvider: 'not-used',
        deviceId: ''
      });
      res.status(201).json({ success: true, record: newLog });
    } else if (action === 'clock-out') {
      if (!record?.employeeId) {
        return res.status(400).json({ success: false, error: 'Employee ID is required to clock out.' });
      }

      const closedLog = await DtrLog.closeActiveLog(record.timeOut, record.employeeId, record.date, {
        latitude: record.timeOutLatitude,
        longitude: record.timeOutLongitude,
        accuracy: record.timeOutGpsAccuracy
      });
      if (closedLog) {
        res.status(200).json({ success: true, record: closedLog });
      } else {
        res.status(400).json({ success: false, error: 'No active clock-in found to clock out.' });
      }
    } else {
      res.status(400).json({ success: false, error: 'Invalid attendance action specified.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const bulkUpdateDtrHistory = async (req, res) => {
  try {
    const updated = await DtrLog.bulkUpdate(req.body);
    res.status(200).json({ success: true, attendanceHistory: updated });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Update location tracking for active DTR log
export const updateLocationTracking = async (req, res) => {
  try {
    const { latitude, longitude, accuracy } = req.body;
    const employeeId = req.user?.accessLevel === 'employee' ? req.user.employeeId : req.body.employeeId;

    if (latitude === undefined || latitude === null || longitude === undefined || longitude === null || !employeeId) {
      return res.status(400).json({ success: false, error: 'Missing required fields: latitude, longitude, employeeId' });
    }

    if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
      return res.status(400).json({ success: false, error: 'Latitude and longitude must be valid numbers.' });
    }

    const activeLog = await DtrLog.find().then(logs =>
      logs.find(log => log.employeeId === employeeId && !log.timeOut)
    );

    const assignedCoords = activeLog?.assignedLatitude && activeLog?.assignedLongitude
      ? { lat: Number(activeLog.assignedLatitude), lon: Number(activeLog.assignedLongitude) }
      : resolveAssignedCoords({
          assignedLatitude: activeLog?.assignedLatitude,
          assignedLongitude: activeLog?.assignedLongitude,
          latitude: activeLog?.latitude,
          longitude: activeLog?.longitude,
          workAssignment: activeLog?.workAssignment,
          location: activeLog?.location
        }) || ASSIGNED_LOCATION_MAP['Office Station'] || { lat: 13.4474, lon: 121.8344 };

    const distance = computeDistanceMeters(Number(latitude), Number(longitude), Number(assignedCoords.lat), Number(assignedCoords.lon));
    const withinGeofence = distance <= GEO_THRESHOLD_METERS;

    const locationData = {
      latitude: Number(latitude),
      longitude: Number(longitude),
      accuracy: Number(accuracy) || 0,
      withinGeofence,
      distanceFromAssignment: distance
    };

    const updated = await DtrLog.updateLocationHistory(employeeId, locationData);

    if (!updated) {
      return res.status(404).json({ success: false, error: 'No active DTR log found for this employee' });
    }

    res.status(200).json({
      success: true,
      message: 'Location recorded',
      record: updated,
      geofenceStatus: withinGeofence ? 'In Range' : 'Out of Range',
      distanceMeters: distance,
      assignedLocation: assignedCoords
    });
  } catch (error) {
    console.error('Location tracking error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get location history for active DTR log
export const getLocationTracking = async (req, res) => {
  try {
    const employeeId = req.user?.accessLevel === 'employee' ? req.user.employeeId : req.params.employeeId;

    if (!employeeId) {
      return res.status(400).json({ success: false, error: 'Employee ID is required' });
    }
    if (req.user?.accessLevel === 'employee'
      && String(req.params.employeeId).toLowerCase() !== String(req.user.employeeId).toLowerCase()) {
      return res.status(403).json({ success: false, error: 'You can only view your own location history.' });
    }
    if (!['employee', 'hr_admin', 'supervisor'].includes(req.user?.accessLevel)) {
      return res.status(403).json({ success: false, error: 'You do not have permission to view location history.' });
    }

    const history = await DtrLog.getLocationHistory(employeeId);
    
    if (!history) {
      return res.status(404).json({ success: false, error: 'No active DTR log found for this employee' });
    }

    res.status(200).json({
      success: true,
      ...history
    });
  } catch (error) {
    console.error('Get location history error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getActiveLocationTracking = async (_req, res) => {
  try {
    const locations = await DtrLog.getActiveLocationTracking();
    res.status(200).json({ success: true, locations });
  } catch (error) {
    console.error('Get active location tracking error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const checkGeofenceStatus = async (req, res) => {
  try {
    const { latitude, longitude, assignedLatitude, assignedLongitude, assignmentSite } = req.body;
    const employeeId = req.user?.accessLevel === 'employee' ? req.user.employeeId : req.body.employeeId;

    if (!latitude || !longitude || !employeeId) {
      return res.status(400).json({ success: false, error: 'Missing required fields: latitude, longitude, employeeId' });
    }

    const activeLog = await DtrLog.find().then(logs =>
      logs.find(log => log.employeeId === employeeId && !log.timeOut)
    );

    const resolvedAssignment = assignmentSite ? await resolveAssignedLocation(assignmentSite) : null;
    const targetLat = Number(resolvedAssignment?.latitude ?? assignedLatitude ?? activeLog?.assignedLatitude ?? 13.4474);
    const targetLon = Number(resolvedAssignment?.longitude ?? assignedLongitude ?? activeLog?.assignedLongitude ?? 121.8344);
    const distance = computeDistanceMeters(Number(latitude), Number(longitude), targetLat, targetLon);
    const inRange = resolvedAssignment
      ? isWithinAssignedLocation(latitude, longitude, resolvedAssignment)
      : distance <= GEO_THRESHOLD_METERS;

    if (!activeLog && inRange) {
      return res.status(200).json({
        success: true,
        canAutoClockIn: true,
        inRange: true,
        distanceMeters: distance,
        eventType: 'entry',
        message: 'Employee is within geofence and ready for clock-in.'
      });
    }

    if (activeLog) {
      const eventType = activeLog.assignmentMatch === true && !inRange ? 'exit' : inRange ? 'entry' : null;
      return res.status(200).json({
        success: true,
        canAutoClockIn: !activeLog.timeOut && inRange && !activeLog.assignmentMatch,
        inRange,
        distanceMeters: distance,
        eventType,
        message: eventType
          ? `Geofence ${eventType} detected for employee ${employeeId}.`
          : inRange
            ? 'Employee is currently inside the geofence.'
            : 'Employee is currently outside the geofence.'
      });
    }

    res.status(200).json({
      success: true,
      canAutoClockIn: false,
      inRange: false,
      distanceMeters: distance,
      eventType: 'exit',
      message: 'No active attendance record found for this employee.'
    });
  } catch (error) {
    console.error('Geofence status check error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const resolveGeofenceAssignment = async (req, res) => {
  try {
    const location = await resolveAssignedLocation(req.body?.assignmentSite);
    res.status(200).json({ success: true, location });
  } catch (error) {
    res.status(422).json({ success: false, error: error.message || 'Unable to resolve the selected location.' });
  }
};
