import { DtrLog, MAX_TRACKING_ACCURACY_METERS } from '../models/dtrLogModel.js';
import { Announcement } from '../models/announcementModel.js';
import { sendServerError } from '../middleware/requestSecurity.js';
import { User } from '../models/User.js';
import crypto from 'crypto';
import { readVerificationProof } from '../utils/verificationProof.js';
import { checkOfflineTimeIn, checkOfflineTimeOut } from '../utils/offlineTimeIn.js';
import { barangayPlaceName, describePlace, isWithinAssignedLocation, resolveAssignedLocation } from '../services/assignedLocationService.js';
import { normalizeAttendanceAssignment, timeOutLocationError } from '../utils/attendanceAssignment.js';
import { sendAttendanceConfirmation } from '../services/smsService.js';
import { isLateClockIn, resolveTimeOutMoment } from '../utils/attendanceTime.js';
import { attendanceWindowStart, formatManilaClockTime, getManilaDateString } from '../../../shared/localDate.js';
import {
  compareEnrollmentToAttendance,
  createFaceDescriptor,
  FaceImageError,
  isValidFaceDescriptor
} from '../services/faceMatchingService.js';

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

// Attendance is for HR/Admins and for each employee's own records. Supervisors only
// decide requests, so they are not sent attendance.
export const getDtrLogs = async (req, res) => {
  try {
    if (!['employee', 'hr_admin'].includes(req.user?.accessLevel)) {
      return res.status(403).json({ success: false, error: 'You do not have permission to view attendance records.' });
    }
    if (req.user.accessLevel === 'employee') {
      return res.status(200).json(await DtrLog.findListForEmployee(req.user));
    }
    // HR gets the current and previous month (and every open shift), or one earlier month.
    const { month } = req.query;
    if (month !== undefined && !(typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month))) {
      return res.status(400).json({ success: false, error: 'The month must be written like 2026-07.' });
    }
    res.status(200).json(await DtrLog.findForHrList(month ? { month } : { since: attendanceWindowStart() }));
  } catch (error) {
    sendServerError(res, error);
  }
};

// One attendance record's selfie, for HR or for the employee whose record it is. Lists
// of records leave selfies out so they stay small.
export const getRecordSelfie = async (req, res) => {
  try {
    const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
    if (!id) return res.status(400).json({ success: false, error: 'Missing attendance record id.' });
    const record = await DtrLog.findSelfie(id);
    const isOwn = record && (
      (record.employeeId && record.employeeId === req.user.employeeId)
      || (record.employeeEmail && record.employeeEmail === req.user.email)
    );
    if (!record || (req.user.accessLevel !== 'hr_admin' && !isOwn)) {
      return res.status(404).json({ success: false, error: 'Attendance record not found.' });
    }
    res.set('Cache-Control', 'no-store, private');
    res.status(200).json({ success: true, id, selfieUrl: record.selfieUrl || '' });
  } catch (error) {
    sendServerError(res, error);
  }
};

export const clockInOut = async (req, res) => {
  try {
    const { action } = req.body;
    const record = { ...(req.body.record || {}) };
    // Record IDs are assigned by the server so a client cannot reuse another record's ID.
    delete record.id;
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
      // A Time In made in the phone app without internet carries the phone's signed record
      // of it (see utils/offlineTimeIn.js) instead of a fingerprint proof from this server.
      const offlineProof = record.offlineTimeIn;
      delete record.offlineTimeIn;
      // The DTR date and Time In come from the server clock, not the phone's clock, except
      // for an offline Time In (set below, once its fingerprint signature is checked).
      let clockInAt = new Date();
      record.timeOut = null;

      const requiredFields = ['latitude', 'longitude', 'gpsStatus', 'selfieUrl', 'fingerprintVerified', 'dutyType', 'assignmentSite'];
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

      let offline = null;
      if (offlineProof !== undefined && offlineProof !== null) {
        offline = checkOfflineTimeIn({
          offline: offlineProof,
          record,
          employeeId: user.employeeId,
          registeredKey: user.nativeBiometricPublicKey,
          sentAt: req.body.sentAt
        });
        if (offline.error) return res.status(offline.statusCode).json({ success: false, error: offline.error });
        // The same offline Time In sent again (for example, when the answer to the first
        // send was lost) gets the saved record back instead of a second record.
        const saved = await DtrLog.findOfflineTimeIn(record.employeeId, offline.nonce);
        if (saved) return res.status(200).json({ success: true, record: saved });
        clockInAt = offline.timeInAt;
      }
      record.date = getManilaDateString(clockInAt);
      record.timeIn = formatManilaClockTime(clockInAt);

      // An online Time In that fails a check is refused, so the employee can fix it and try
      // again. An offline one cannot be redone, so it is saved for HR to review instead.
      // Returns true when the Time In was refused.
      const failCheck = (statusCode, error, reviewReason = error) => {
        if (offline) {
          offline.reviewReasons.push(reviewReason);
          return false;
        }
        res.status(statusCode).json({ success: false, error });
        return true;
      };

      const normalizedAssignment = normalizeAttendanceAssignment({
        dutyType: record.dutyType,
        assignmentSite: record.assignmentSite,
        user
      });
      const task = record.workAssignment?.task;
      if (typeof task !== 'string' || !task.trim() || task.trim().length > 500) {
        return res.status(400).json({ success: false, error: 'Provide an assignment task of 500 characters or fewer.' });
      }

      const resolvedAssignment = await resolveAssignedLocation(normalizedAssignment.assignmentSite);
      const assignedCoords = resolvedAssignment
        ? { lat: resolvedAssignment.latitude, lon: resolvedAssignment.longitude }
        : null;
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
      record.dutyType = normalizedAssignment.dutyType;
      record.assignmentSite = resolvedAssignment;
      record.location = resolvedAssignment.label;
      record.workAssignment = {
        assignmentRole: normalizedAssignment.dutyType,
        location: resolvedAssignment.label,
        municipality: resolvedAssignment.municipality,
        barangayLgu: resolvedAssignment.barangay,
        officeId: resolvedAssignment.officeId || '',
        street: resolvedAssignment.street || '',
        landmark: resolvedAssignment.landmark || '',
        task: task.trim()
      };
      record.assignmentMatch = resolvedAssignment
        ? isWithinAssignedLocation(record.latitude, record.longitude, resolvedAssignment)
        : distance <= GEO_THRESHOLD_METERS;

      if (!record.assignmentMatch && failCheck(400, resolvedAssignment
        ? `GPS is outside the selected assignment area: ${resolvedAssignment.label}. Move to the assigned location and retry.`
        : `Assigned location mismatch. Distance is ${distance} meters, which exceeds the ${GEO_THRESHOLD_METERS}m limit.`,
      `The GPS at Time In was outside the assignment area (${distance} m from the center of ${record.location}).`)) {
        return;
      }

      if (!record.selfieUrl) {
        return res.status(400).json({ success: false, error: 'Selfie verification is required for clock-in.' });
      }

      // An offline Time In was checked against the phone's registered fingerprint key above.
      const fingerprintProof = !offline && record.fingerprintVerified
        ? readVerificationProof(record.fingerprintProof, { employeeId: record.employeeId, type: 'fingerprint' })
        : null;
      if (!offline && !fingerprintProof) {
        return res.status(400).json({ success: false, error: 'A valid server biometric assertion is required for clock-in.' });
      }
      if (offline) record.fingerprintVerified = offline.registeredKeyMatched;

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

      if (user.biometricEnrollmentStatus !== 'hr-approved') {
        return res.status(409).json({
          success: false,
          error: 'Complete Biometric Enrollment and wait for HR approval before clocking in with face verification.'
        });
      }
      const enrollment = await User.getApprovedFaceEnrollment(record.employeeId);
      if (!enrollment) {
        return res.status(409).json({ success: false, error: 'No HR-approved biometric enrollment selfie is available. Contact HR to complete enrollment.' });
      }
      let enrollmentDescriptor = enrollment.descriptor;
      if (!isValidFaceDescriptor(enrollmentDescriptor) && enrollment.image) {
        try {
          enrollmentDescriptor = await createFaceDescriptor(enrollment.image);
          await User.saveApprovedFaceEnrollmentDescriptor(record.employeeId, enrollmentDescriptor);
        } catch (error) {
          if (!(error instanceof FaceImageError)) throw error;
          if (failCheck(409,
            'The approved enrollment selfie cannot be processed for face matching. Contact HR to resubmit biometric enrollment.',
            'The selfie could not be compared: the HR-approved enrollment selfie cannot be processed for face matching.')) {
            return;
          }
        }
      }
      let faceMatch = null;
      if (!isValidFaceDescriptor(enrollmentDescriptor)) {
        if (failCheck(409,
          'The approved enrollment selfie cannot be used for face matching. Contact HR to resubmit biometric enrollment.',
          'The selfie could not be compared: the HR-approved enrollment selfie cannot be used for face matching.')) {
          return;
        }
      } else {
        try {
          faceMatch = await compareEnrollmentToAttendance(enrollmentDescriptor, record.selfieUrl);
        } catch (error) {
          // Online, a selfie without a clear face is refused and retaken.
          if (!(offline && error instanceof FaceImageError)) throw error;
          offline.reviewReasons.push(`The selfie could not be compared with the enrollment selfie: ${error.message}`);
        }
        if (faceMatch && !faceMatch.matched) {
          await User.addFaceVerificationAudit(record.employeeId, {
            outcome: 'attendance-face-mismatch',
            provider: 'local-face-api-v1'
          });
          if (failCheck(403,
            'Your attendance selfie did not match the HR-approved enrollment selfie. Retake the selfie with your face clearly visible and try again.',
            'The selfie did not match the HR-approved enrollment selfie.')) {
            return;
          }
        }
      }
      // Each fingerprint verification can be used for only one Time In (an offline Time In
      // was checked for this above).
      if (!offline && !(await User.consumeVerificationProof(user._id, fingerprintProof.jti))) {
        return res.status(409).json({ success: false, error: 'This fingerprint verification was already used. Verify your fingerprint again.' });
      }
      const faceVerified = faceMatch?.matched === true;
      const newLog = await DtrLog.create({
        ...record,
        timeInAt: clockInAt,
        late: isLateClockIn(clockInAt),
        faceVerified,
        faceMatchConfidence: null,
        faceMatchDistance: faceMatch?.distance ?? null,
        faceVerifiedAt: faceVerified ? new Date() : null,
        faceLivenessVerified: false,
        faceLivenessConfidence: 0,
        faceVerificationProvider: 'local-face-api-v1',
        faceLivenessProvider: 'not-used',
        // Which registered fingerprint this Time In matched (offline Time Ins are only made
        // in the phone app).
        fingerprintMethod: offline || fingerprintProof.method === 'phone-app' ? 'phone-app' : 'browser',
        deviceId: '',
        offlineTimeIn: offline && {
          recordedAt: offline.recordedAt,
          syncedAt: new Date(),
          phoneClockOffsetSeconds: offline.phoneClockOffsetSeconds,
          nonce: offline.nonce,
          reviewReasons: offline.reviewReasons,
          decision: ''
        }
      });
      const needsReview = Boolean(offline?.reviewReasons.length);
      if (needsReview) {
        try {
          await Announcement.createNotification({
            title: 'Offline Time In for Review',
            message: `${user.name || 'An employee'} timed in without internet on ${newLog.date} at ${newLog.timeIn}. It does not count in their DTR until you approve it in DTR Records. ${offline.reviewReasons.join(' ')}`,
            type: 'attendance',
            recipientRole: 'hr_admin'
          });
        } catch (error) {
          console.error('Unable to notify HR about an offline Time In for review:', error);
        }
      }
      const sms = await sendAttendanceConfirmation(user, !offline
        ? `[DILG WorkMate] Clocked-In successfully on ${newLog.date} at ${newLog.timeIn} at ${newLog.location}. Have an outstanding day of service!`
        : `[DILG WorkMate] Your Time In saved offline on ${newLog.date} at ${newLog.timeIn} at ${newLog.location} was received.${needsReview ? ' HR will review it before it counts in your DTR.' : ''}`);
      res.status(201).json({ success: true, record: newLog, sms });
    } else if (action === 'clock-out') {
      if (!record?.employeeId) {
        return res.status(400).json({ success: false, error: 'Employee ID is required to clock out.' });
      }

      const activeLog = await DtrLog.findActiveByEmployee(record.employeeId, record.date);
      if (!activeLog) {
        return res.status(400).json({ success: false, error: 'No active clock-in found to clock out.' });
      }
      if (req.user?.accessLevel === 'employee') {
        const locationError = timeOutLocationError(activeLog.assignmentSite, record);
        if (locationError) return res.status(400).json({ success: false, error: locationError });
      }
      // An offline Time In reaches the server after it happened, so its record is created
      // later than its Time In.
      const timeInAt = activeLog.timeInAt || activeLog.createdAt;
      const timeOutAt = resolveTimeOutMoment({ recordedOfflineAt: record.recordedOfflineAt, timeInAt });
      // A Time Out saved offline keeps the phone's time; HR checks it when the phone's clock
      // looked wrong, and until then it is left out of the DTR.
      const offline = checkOfflineTimeOut({ recordedOfflineAt: record.recordedOfflineAt, timeInAt, sentAt: req.body.sentAt });
      const closedLog = await DtrLog.closeActiveLog(formatManilaClockTime(timeOutAt), record.employeeId, record.date, {
        latitude: record.timeOutLatitude,
        longitude: record.timeOutLongitude,
        accuracy: record.timeOutGpsAccuracy
      }, offline && { ...offline, syncedAt: new Date(), decision: '' });
      if (closedLog) {
        const employee = req.user?.accessLevel === 'employee' ? req.user : await User.findByEmployeeId(record.employeeId);
        const needsReview = Boolean(offline?.reviewReasons.length);
        if (needsReview) {
          try {
            await Announcement.createNotification({
              title: 'Offline Time Out for Review',
              message: `${employee?.name || closedLog.employeeName || 'An employee'} timed out without internet on ${closedLog.date} at ${closedLog.timeOut}. The Time Out is left out of their DTR until you approve it or enter the right Time Out in DTR Records. ${offline.reviewReasons.join(' ')}`,
              type: 'attendance',
              recipientRole: 'hr_admin'
            });
          } catch (error) {
            console.error('Unable to notify HR about an offline Time Out for review:', error);
          }
        }
        const sms = await sendAttendanceConfirmation(employee,
          `[DILG WorkMate] Clocked-Out recorded on ${getManilaDateString()} at ${closedLog.timeOut}. ${needsReview ? 'HR will review this Time Out before it counts in your DTR.' : 'Operations sync complete for the day.'}`);
        res.status(200).json({ success: true, record: closedLog, sms });
      } else {
        res.status(400).json({ success: false, error: 'No active clock-in found to clock out.' });
      }
    } else {
      res.status(400).json({ success: false, error: 'Invalid attendance action specified.' });
    }
  } catch (error) {
    if (!error.statusCode) console.error('Attendance verification failed:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.statusCode ? error.message : 'Unable to verify and save attendance. Try again later.'
    });
  }
};

export const bulkUpdateDtrHistory = async (req, res) => {
  try {
    const updated = await DtrLog.bulkUpdate(req.body, { reviewer: req.user?.name || req.user?.email || 'HR/Admin' });
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

    const gpsAccuracy = Number(accuracy);
    if (accuracy === undefined || accuracy === null || !Number.isFinite(gpsAccuracy) || gpsAccuracy < 0 || gpsAccuracy > MAX_TRACKING_ACCURACY_METERS) {
      return res.status(422).json({ success: false, error: `Live tracking needs phone GPS accurate to ${MAX_TRACKING_ACCURACY_METERS} meters or better.` });
    }

    const activeLog = await DtrLog.findActiveShift(employeeId);

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
    // Use the same assignment area as Time In (a field assignment covers the whole
    // barangay, not just 150 m around its center).
    const withinGeofence = Number.isFinite(Number(activeLog?.assignmentSite?.latitude))
      ? isWithinAssignedLocation(latitude, longitude, activeLog.assignmentSite)
      : distance <= GEO_THRESHOLD_METERS;

    const locationData = {
      latitude: Number(latitude),
      longitude: Number(longitude),
      accuracy: gpsAccuracy,
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
    sendServerError(res, error);
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
    if (!['employee', 'hr_admin'].includes(req.user?.accessLevel)) {
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
    sendServerError(res, error);
  }
};

export const getActiveLocationTracking = async (_req, res) => {
  try {
    // Each position's barangay comes from the PSA map on the server, so HR's screen does
    // not have to ask for a place name every time an employee moves.
    const locations = (await DtrLog.getActiveLocationTracking()).map(entry => ({
      ...entry,
      place: barangayPlaceName(Number(entry.latitude), Number(entry.longitude))
    }));
    res.status(200).json({ success: true, locations });
  } catch (error) {
    console.error('Get active location tracking error:', error);
    sendServerError(res, error);
  }
};

export const checkGeofenceStatus = async (req, res) => {
  try {
    const { latitude, longitude, assignedLatitude, assignedLongitude, assignmentSite } = req.body;
    const employeeId = req.user?.accessLevel === 'employee' ? req.user.employeeId : req.body.employeeId;

    if (!latitude || !longitude || !employeeId) {
      return res.status(400).json({ success: false, error: 'Missing required fields: latitude, longitude, employeeId' });
    }

    const activeLog = await DtrLog.findActiveShift(employeeId);

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
      const wasInRange = activeLog.currentWithinGeofence ?? activeLog.assignmentMatch;
      const eventType = wasInRange === true && !inRange ? 'exit' : inRange ? 'entry' : null;
      return res.status(200).json({
        success: true,
        canAutoClockIn: !activeLog.timeOut && inRange && !wasInRange,
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
    sendServerError(res, error);
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

// The name of the place at a GPS position (such as "Brgy. Bangbang, Gasan"), shown with
// each employee on HR's live map.
export const getPlaceName = async (req, res) => {
  try {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return res.status(400).json({ success: false, error: 'A valid latitude and longitude are required.' });
    }
    res.status(200).json({ success: true, place: await describePlace(latitude, longitude) });
  } catch (error) {
    sendServerError(res, error);
  }
};
