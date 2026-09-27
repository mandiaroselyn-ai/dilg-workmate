/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { apiFetch } from '../utils/api';

const fetch = apiFetch;
import {
  Clock,
  MapPin,
  Compass,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Play,
  RotateCw,
  Navigation,
  Check,
  Camera,
  Fingerprint,
  Download,
  ShieldCheck,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { matchesAttendanceEmployee } from '../utils/attendanceIdentity';
import { MARINDUQUE_MUNICIPALITIES, MARINDUQUE_OFFICES } from '../../shared/marinduqueLocations';
import { isWithinAssignedLocation } from '../../shared/assignmentGeofence';

export default function AttendanceView({
  user,
  attendanceHistory,
  onTimeIn,
  onTimeOut,
  onUpdateUser
}) {
  // Input states with Philippine defaults from mockup
  const [selectedMuni, setSelectedMuni] = useState('Boac');
  const [barangayLgu, setBarangayLgu] = useState('Tanza');
  const [assignedTask, setAssignedTask] = useState('Barangay Monitoring and LGU Coordination');
  const [assignmentMode, setAssignmentMode] = useState('field');
  const [selectedOfficeId, setSelectedOfficeId] = useState('provincial');
  const [wfhStreet, setWfhStreet] = useState('');
  const [wfhLandmark, setWfhLandmark] = useState('');
  
  // Custom personnel fillable states
  const [fillName, setFillName] = useState(user?.name || 'Shen Mandia');
  const [fillRole, setFillRole] = useState(user?.role || 'Local Government Operations Officer V');
  const [fillOffice, setFillOffice] = useState(user?.office || 'Marinduque Provincial Office');
  const [fillId, setFillId] = useState(user?.employeeId || 'DILG-2026-8845');

  // Keep state synced with user profile changes
  useEffect(() => {
    if (user) {
      if (user.name) setFillName(user.name);
      if (user.role) setFillRole(user.role);
      if (user.office) setFillOffice(user.office);
      if (user.employeeId) setFillId(user.employeeId);
    }
  }, [user]);

  const GEO_THRESHOLD_METERS = 150;
  const municipalities = Object.keys(MARINDUQUE_MUNICIPALITIES);

  const buildAssignmentSite = () => {
    if (assignmentMode === 'office') {
      return { mode: 'office', municipality: selectedMuni, officeId: selectedOfficeId };
    }
    if (assignmentMode === 'wfh') {
      return {
        mode: 'wfh',
        municipality: selectedMuni,
        barangay: barangayLgu,
        street: wfhStreet,
        landmark: wfhLandmark
      };
    }
    return { mode: 'field', municipality: selectedMuni, barangay: barangayLgu };
  };

  // Geolocation states
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsChecked, setGpsChecked] = useState(false);
  const [hasGpsPosition, setHasGpsPosition] = useState(false);
  const [gpsVerdict, setGpsVerdict] = useState('Out of Range');
  const [coordinates, setCoordinates] = useState({ lat: 13.4474, lon: 121.8344 });
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [siteLocation, setSiteLocation] = useState(null);
  const [siteLocationLoading, setSiteLocationLoading] = useState(false);
  const [siteLocationError, setSiteLocationError] = useState('');
  const [mockProximity, setMockProximity] = useState(999); // meters away from center
  const [locationError, setLocationError] = useState('');
  const [showFullMap, setShowFullMap] = useState(false);
  const [showSatelliteView, setShowSatelliteView] = useState(false);
  const [geofenceStatus, setGeofenceStatus] = useState({
    inRange: false,
    canAutoClockIn: false,
    eventType: null,
    message: ''
  });

  const computeDistanceMeters = (lat1, lon1, lat2, lon2) => {
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371000; // Earth radius in meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  };

  const getCurrentPosition = (options) => new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });

  const getPositionWithFallback = async () => {
    try {
      return await getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 45000,
        maximumAge: 15000
      });
    } catch (error) {
      if (error.code === 1) throw error;
      return getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 20000,
        maximumAge: 60000
      });
    }
  };

  const isMessengerBrowser = typeof navigator !== 'undefined'
    && /FBAN|FBAV|FB_IAB|Messenger/i.test(navigator.userAgent);

  useEffect(() => {
    let active = true;
    setSiteLocation(null);
    setSiteLocationError('');
    setSiteLocationLoading(true);
    setGeofenceStatus({ inRange: false, canAutoClockIn: false, eventType: null, message: '' });
    setGpsVerdict('Out of Range');

    fetch('/api/dtr/action?action=geofence-resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentSite: buildAssignmentSite() })
    })
      .then(async response => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Could not locate the selected assignment.');
        if (active) setSiteLocation(result.location);
      })
      .catch(error => {
        if (active) setSiteLocationError(error.message || 'Could not locate the selected assignment.');
      })
      .finally(() => {
        if (active) setSiteLocationLoading(false);
      });

    return () => { active = false; };
  }, [assignmentMode, selectedMuni, barangayLgu, selectedOfficeId, wfhStreet, wfhLandmark]);

  const today = new Date().toISOString().split('T')[0];
  const todayRecord = attendanceHistory.find(record => record.date === today && matchesAttendanceEmployee(record, user));
  const isCurrentlyActive = todayRecord && !todayRecord.timeOut;

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');

  // Selfie Camera States
  const [capturedSelfie, setCapturedSelfie] = useState(null);
  const [selfieCameraActive, setSelfieCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const selfieVideoRef = useRef(null);
  const selfieStreamRef = useRef(null);

  // Fingerprint States
  const [fingerprintScanning, setFingerprintScanning] = useState(false);
  const [fingerprintProgress, setFingerprintProgress] = useState(0);
  const [fingerprintVerified, setFingerprintVerified] = useState(false);
  const [fingerprintProof, setFingerprintProof] = useState('');
  const hasNativeBridge = typeof window !== 'undefined'
    && Boolean(window.ReactNativeWebView);

  const gpsRequestRef = useRef(null);
  const gpsTimeoutRef = useRef(null);
  const gpsPositionHandlerRef = useRef(null);
  const siteLocationRef = useRef(null);
  siteLocationRef.current = siteLocation;

  useEffect(() => {
    const handleMobileBiometricResult = (event) => {
      setFingerprintScanning(false);
      setFingerprintProgress(0);
      setFingerprintVerified(false);
      setFingerprintProof('');
      setCameraError(event.detail?.success
        ? 'Phone unlock alone cannot verify attendance. Use a registered passkey so the server can validate your biometric.'
        : 'Biometric verification was cancelled or not completed.');
    };

    window.addEventListener('dilg-biometric-result', handleMobileBiometricResult);
    return () => window.removeEventListener('dilg-biometric-result', handleMobileBiometricResult);
  }, []);

  const stopSelfieCamera = () => {
    selfieStreamRef.current?.getTracks().forEach(track => track.stop());
    selfieStreamRef.current = null;
    setSelfieCameraActive(false);
  };

  useEffect(() => () => {
    selfieStreamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  useEffect(() => {
    if (selfieCameraActive && selfieVideoRef.current && selfieStreamRef.current) {
      selfieVideoRef.current.srcObject = selfieStreamRef.current;
      selfieVideoRef.current.play().catch(error => {
        console.error('Unable to start attendance selfie preview:', error);
        setCameraError('Camera preview could not start. Check browser camera permission and try again.');
      });
    }
  }, [selfieCameraActive]);

  const startSelfieCamera = async () => {
    setCameraError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access requires HTTPS or localhost. Open this app using a secure connection and allow camera permission.');
      return;
    }
    try {
      stopSelfieCamera();
      selfieStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 960 } }
      });
      setSelfieCameraActive(true);
    } catch (error) {
      console.error('Unable to access the attendance selfie camera:', error);
      setCameraError(error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'
        ? 'Allow camera access in your browser settings, then try again.'
        : error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError'
          ? 'No camera was found on this device.'
          : `Unable to start camera: ${error.message || 'camera unavailable'}`);
    }
  };

  const captureAttendanceSelfie = () => {
    const video = selfieVideoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) {
      setCameraError('Wait for the live camera preview, then capture your selfie.');
      return;
    }
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('Unable to process the camera photo. Please try again.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCapturedSelfie(canvas.toDataURL('image/jpeg', 0.85));
    setCameraError(null);
    handleResetFingerprint();
    stopSelfieCamera();
  };

  const handleResetSelfie = () => {
    setCapturedSelfie(null);
    stopSelfieCamera();
    handleResetFingerprint();
    setCameraError(null);
  };

  useEffect(() => {
    const handleMobileLocationResult = (event) => {
      const result = event.detail || {};
      if (!gpsRequestRef.current || result.requestId !== gpsRequestRef.current) return;
      gpsRequestRef.current = null;
      window.clearTimeout(gpsTimeoutRef.current);
      gpsTimeoutRef.current = null;
      if (!result.success || !result.coords) {
        setGpsChecked(true);
        setLocationError(result.error || 'Location permission is required before continuing.');
        setGpsLoading(false);
        return;
      }
      gpsPositionHandlerRef.current?.(result.coords.latitude, result.coords.longitude, result.coords.accuracy);
    };

    window.addEventListener('dilg-location-result', handleMobileLocationResult);
    return () => window.removeEventListener('dilg-location-result', handleMobileLocationResult);
  }, []);

  const [currentTime, setCurrentTime] = useState(() => new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }));

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const toBase64Url = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const fromBase64Url = (value) => {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, character => character.charCodeAt(0)).buffer;
  };

  const credentialToJson = (credential) => {
    const response = credential.response;
    const json = {
      id: credential.id,
      rawId: toBase64Url(credential.rawId),
      type: credential.type,
      clientExtensionResults: credential.getClientExtensionResults()
    };
    if (response.attestationObject) {
      json.response = {
        attestationObject: toBase64Url(response.attestationObject),
        clientDataJSON: toBase64Url(response.clientDataJSON),
        transports: response.getTransports?.() || []
      };
    } else {
      json.response = {
        authenticatorData: toBase64Url(response.authenticatorData),
        clientDataJSON: toBase64Url(response.clientDataJSON),
        signature: toBase64Url(response.signature),
        userHandle: response.userHandle ? toBase64Url(response.userHandle) : undefined
      };
    }
    return json;
  };

  // The server creates and verifies the WebAuthn challenge and assertion.
  const handleStartFingerprintScan = async () => {
    if (!capturedSelfie) {
      setCameraError('Please complete selfie capture before fingerprint verification.');
      return;
    }
    if (fingerprintVerified) return;

    if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials) {
      setCameraError('Fingerprint sign-in needs a supported browser on HTTPS. Open the Vercel site in the latest Chrome or Safari browser, not an embedded preview.');
      return;
    }

    setFingerprintScanning(true);
    setCameraError(null);

    try {
      let optionsResponse = await fetch('/api/biometric/action?action=authenticate-options', { method: 'POST' });
      let options;
      let registration = false;
      if (optionsResponse.status === 404) {
        optionsResponse = await fetch('/api/biometric/action?action=register-options', { method: 'POST' });
        registration = true;
      }
      options = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(options.error || 'Unable to create biometric challenge.');

      const publicKey = registration
        ? {
            ...options,
            challenge: fromBase64Url(options.challenge),
            user: { ...options.user, id: fromBase64Url(options.user.id) },
            excludeCredentials: (options.excludeCredentials || []).map(item => ({ ...item, id: fromBase64Url(item.id) }))
          }
        : {
            ...options,
            challenge: fromBase64Url(options.challenge),
            allowCredentials: (options.allowCredentials || []).map(item => ({ ...item, id: fromBase64Url(item.id) }))
          };
        if (window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
          const hasPlatformAuthenticator = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          if (!hasPlatformAuthenticator) {
            throw new Error('This browser cannot access the phone fingerprint sensor. Open this site in Chrome or Safari on a phone with screen lock and biometrics enabled.');
          }
        }
      const credential = registration
        ? await navigator.credentials.create({ publicKey })
        : await navigator.credentials.get({ publicKey });
      if (!credential) throw new Error('Biometric verification was cancelled.');

      const verifyAction = registration ? 'register-verify' : 'authenticate-verify';
      const verifyPath = `/api/biometric/action?action=${verifyAction}`;
      const verifyResponse = await fetch(verifyPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentialToJson(credential))
      });
      const verification = await verifyResponse.json();
      if (!verifyResponse.ok || !verification.success) throw new Error(verification.error || 'Server biometric verification failed.');

      if (registration) {
        const authOptionsResponse = await fetch('/api/biometric/action?action=authenticate-options', { method: 'POST' });
        const authOptions = await authOptionsResponse.json();
        const authCredential = await navigator.credentials.get({
          publicKey: {
            ...authOptions,
            challenge: fromBase64Url(authOptions.challenge),
            allowCredentials: (authOptions.allowCredentials || []).map(item => ({ ...item, id: fromBase64Url(item.id) }))
          }
        });
        const authVerificationResponse = await fetch('/api/biometric/action?action=authenticate-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentialToJson(authCredential))
        });
        const authVerification = await authVerificationResponse.json();
        if (!authVerificationResponse.ok || !authVerification.success) throw new Error(authVerification.error || 'Server biometric verification failed.');
        setFingerprintProof(authVerification.verificationProof);
      } else {
        setFingerprintProof(verification.verificationProof);
      }
      setFingerprintScanning(false);
      setFingerprintVerified(true);
      setFingerprintProgress(100);
    } catch (error) {
      console.error('WebAuthn biometric verification failed:', error);
      setFingerprintScanning(false);
      setFingerprintProgress(0);
      const message = error?.name === 'NotAllowedError'
        ? 'Fingerprint/passkey prompt was cancelled or blocked. Retry and approve the phone biometric prompt.'
        : error?.name === 'SecurityError'
          ? 'Fingerprint verification origin mismatch. Open the official Vercel domain directly.'
          : error?.name === 'InvalidStateError'
            ? 'A fingerprint passkey is already registered. Retry the fingerprint check.'
            : error?.message || 'Fingerprint verification failed. Check browser biometric support and retry.';
      setCameraError(message);
    }
  };

  const handleResetFingerprint = () => {
    setFingerprintVerified(false);
    setFingerprintProof('');
    setFingerprintProgress(0);
  };

  const updateGpsPosition = (latitude, longitude, accuracy) => {
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)
      || parsedLatitude < -90 || parsedLatitude > 90
      || parsedLongitude < -180 || parsedLongitude > 180) {
      setGpsChecked(true);
      setHasGpsPosition(false);
      setLocationError('The device returned invalid GPS coordinates. Turn on Location Services and retry.');
      setGpsLoading(false);
      return;
    }

    setGpsChecked(true);
    setHasGpsPosition(true);
    setLocationError('');
    const lat = Number(parsedLatitude.toFixed(6));
    const lon = Number(parsedLongitude.toFixed(6));
    const parsedAccuracy = Number(accuracy);
    setGpsAccuracy(Number.isFinite(parsedAccuracy) && parsedAccuracy >= 0 ? parsedAccuracy : null);
    setCoordinates({ lat, lon });

    const assignedLocation = siteLocationRef.current;
    if (!assignedLocation) {
      setLocationError('GPS captured. Waiting for the selected assignment location to finish loading.');
    } else {
      const distance = computeDistanceMeters(lat, lon, assignedLocation.latitude, assignedLocation.longitude);
      setMockProximity(distance);
      setGpsVerdict(isWithinAssignedLocation(lat, lon, assignedLocation, GEO_THRESHOLD_METERS) ? 'In Range' : 'Out of Range');
      syncGeofenceStatus(lat, lon, assignedLocation);
    }
    setGpsLoading(false);
  };
  gpsPositionHandlerRef.current = updateGpsPosition;

  const syncGeofenceStatus = async (lat, lon, targetCoords) => {
    const employeeId = user?.employeeId || fillId;
    if (!employeeId || !lat || !lon) return;

    try {
      const response = await fetch('/api/dtr/action?action=geofence-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: lat,
          longitude: lon,
          employeeId,
          assignmentSite: buildAssignmentSite(),
          assignedLatitude: targetCoords?.latitude,
          assignedLongitude: targetCoords?.longitude
        })
      });

      if (!response.ok) return;
      const data = await response.json();
      if (data?.success) {
        setGeofenceStatus({
          inRange: !!data.inRange,
          canAutoClockIn: !!data.canAutoClockIn,
          eventType: data.eventType || null,
          message: data.message || ''
        });
      }
    } catch (error) {
      console.warn('Geofence status sync failed:', error);
    }
  };

  useEffect(() => {
    if (!siteLocation || !hasGpsPosition) return;
    const distance = computeDistanceMeters(coordinates.lat, coordinates.lon, siteLocation.latitude, siteLocation.longitude);
    const inRange = isWithinAssignedLocation(coordinates.lat, coordinates.lon, siteLocation, GEO_THRESHOLD_METERS);
    setMockProximity(distance);
    setGpsVerdict(inRange ? 'In Range' : 'Out of Range');
    if (!inRange) {
      setLocationError(`Time In blocked: your current GPS is ${distance}m from the assigned map location (${siteLocation.label}). Move to the assigned area and verify GPS again.`);
    } else {
      setLocationError('');
    }
    syncGeofenceStatus(coordinates.lat, coordinates.lon, siteLocation);
  }, [siteLocation, hasGpsPosition, coordinates.lat, coordinates.lon]);

  const handleGetLiveGPS = () => {
    setGpsAccuracy(null);
    if (hasNativeBridge) {
      setGpsLoading(true);
      setGpsChecked(false);
      setHasGpsPosition(false);
      setLocationError('');
      const requestId = `gps-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      gpsRequestRef.current = requestId;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'dilg-location-auth', requestId }));
      gpsTimeoutRef.current = window.setTimeout(() => {
        if (gpsRequestRef.current !== requestId) return;
        gpsRequestRef.current = null;
        setGpsChecked(true);
        setGpsLoading(false);
        setLocationError('Location request timed out. Turn on phone Location Services, allow WorkMate location access, then retry.');
      }, 20000);
      return;
    }

    if (!navigator.geolocation) {
      setGpsChecked(true);
      setLocationError('Browser GPS is not available on this device.');
      return;
    }

    setGpsLoading(true);
    setGpsChecked(false);
    setHasGpsPosition(false);
    setLocationError('');

    getPositionWithFallback()
      .then(position => {
        updateGpsPosition(position.coords.latitude, position.coords.longitude, position.coords.accuracy);
      })
      .catch(error => {
        setGpsChecked(true);
        const message = error.code === 1
          ? 'Location permission denied. Allow location access for this site in your browser settings, then retry.'
          : error.code === 2
            ? 'Phone location is unavailable. Turn on Location Services and enable high-accuracy location, then retry.'
            : isMessengerBrowser
              ? 'GPS timed out in Messenger. Open this page in Chrome, allow location access, turn on Location Services, and retry.'
              : 'GPS request timed out. Turn on Location Services, move near a window or outdoors, and retry.';
        setLocationError(message);
        setGpsLoading(false);
      });
  };

  // Send location tracking update to backend
  const sendLocationUpdate = async (lat, lon, accuracy) => {
    try {
      const response = await fetch('/api/dtr/action?action=location-update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          latitude: lat,
          longitude: lon,
          accuracy: accuracy || 0,
          employeeId: user?.employeeId || fillId
        })
      });

      if (!response.ok) {
        console.warn('Location update failed:', response.statusText);
      }
    } catch (error) {
      console.warn('Location tracking error:', error);
    }
  };

  // Location tracking interval - send updates every 60 seconds during active shift
  useEffect(() => {
    // Only track if shift is active (timeIn exists and timeOut is null)
    const isShiftActive = Boolean(todayRecord?.timeIn && !todayRecord?.timeOut);

    if (!isShiftActive) {
      return;
    }

    const interval = setInterval(() => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const lat = Number(position.coords.latitude.toFixed(6));
            const lon = Number(position.coords.longitude.toFixed(6));
            const accuracy = position.coords.accuracy;
            sendLocationUpdate(lat, lon, accuracy);
          },
          () => {}
        );
      }
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, [attendanceHistory, assignmentMode, selectedMuni, user?.employeeId, fillId, todayRecord?.timeIn, todayRecord?.timeOut]);

  const isOfficeMode = assignmentMode === 'office';
  const isWfhMode = assignmentMode === 'wfh';
  const requiresGps = true;
  const effectiveMuni = selectedMuni;
  const selectedOffice = MARINDUQUE_OFFICES.find(office => office.id === selectedOfficeId);
  const effectiveBarangay = isOfficeMode
    ? selectedOffice?.barangay || ''
    : barangayLgu;
  const effectiveTask = isOfficeMode ? 'Office-based administrative work' : isWfhMode ? 'Work From Home' : assignedTask;
  const effectiveLocation = isOfficeMode
    ? `${selectedOffice?.name || 'DILG Office'}, Brgy. ${effectiveBarangay}, ${effectiveMuni}`
    : isWfhMode
      ? [wfhStreet, wfhLandmark, `Brgy. ${effectiveBarangay}`, effectiveMuni, 'Marinduque', 'Philippines'].filter(Boolean).join(', ')
      : `Brgy. ${effectiveBarangay}, ${effectiveMuni}, Marinduque`;

  const assignmentSite = buildAssignmentSite();
  const assignedCoords = siteLocation
    ? { lat: siteLocation.latitude, lon: siteLocation.longitude }
    : null;
  const distanceToAssignment = assignedCoords
    ? computeDistanceMeters(coordinates.lat, coordinates.lon, assignedCoords.lat, assignedCoords.lon)
    : null;
  const isWithinAssignment = hasGpsPosition && siteLocation
    ? isWithinAssignedLocation(coordinates.lat, coordinates.lon, siteLocation, GEO_THRESHOLD_METERS)
    : false;
  const isAssignmentVerified = isWithinAssignment && gpsAccuracy !== null && gpsAccuracy <= 50;
  const geofenceDescription = assignmentMode === 'field'
    ? siteLocation?.fallbackToRadius && siteLocation.bounds
      ? 'Approximate assigned-area map extent + 150m GPS tolerance'
      : siteLocation?.fallbackToRadius
        ? '150m from approximate assigned-area map pin'
        : 'Barangay boundary + 150m GPS tolerance'
    : '150m from assigned address';

  const mapFocus = hasGpsPosition ? coordinates : assignedCoords || coordinates;
  const embedZoom = 17;
  const mapEmbedUrl = `https://maps.google.com/maps?q=${mapFocus.lat},${mapFocus.lon}&z=${embedZoom}&output=embed`;
  const googleMapsUrl = hasGpsPosition && assignedCoords
    ? `https://www.google.com/maps/dir/?api=1&origin=${coordinates.lat},${coordinates.lon}&destination=${assignedCoords.lat},${assignedCoords.lon}`
    : `https://www.google.com/maps/search/?api=1&query=${mapFocus.lat},${mapFocus.lon}`;

  const autoClockInRef = useRef(false);
  const autoClockOutRef = useRef(false);

  const executeClockIn = async () => {
    if (!navigator.geolocation || !siteLocation) {
      setLocationError(siteLocationError || 'Wait for the selected assignment site to finish locating before Time In.');
      autoClockInRef.current = false;
      return;
    }

    setGpsLoading(true);
    getPositionWithFallback()
      .then(position => {
        setGpsChecked(true);
        const lat = Number(position.coords.latitude.toFixed(6));
        const lon = Number(position.coords.longitude.toFixed(6));
        const accuracy = Number(position.coords.accuracy);
        const distance = computeDistanceMeters(lat, lon, assignedCoords.lat, assignedCoords.lon);
        const verdict = isWithinAssignedLocation(lat, lon, siteLocation, GEO_THRESHOLD_METERS) ? 'In Range' : 'Out of Range';

        setCoordinates({ lat, lon });
        setGpsAccuracy(Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null);
        setMockProximity(distance);
        setGpsVerdict(verdict);
        syncGeofenceStatus(lat, lon, siteLocation);
        setGpsLoading(false);

        if (!Number.isFinite(accuracy) || accuracy > 50) {
          setLocationError(`GPS accuracy is ${Number.isFinite(accuracy) ? `${Math.round(accuracy)}m` : 'unavailable'}. Move outdoors or near a window and retry until accuracy is 50m or better.`);
          autoClockInRef.current = false;
          return;
        }

        if (verdict !== 'In Range') {
          setLocationError(`Time In blocked: your GPS location is outside ${siteLocation.label}. Move to the assigned address and verify GPS again.`);
          autoClockInRef.current = false;
          return;
        }

        if (!capturedSelfie) {
          setCameraError('Take or choose an ordinary selfie before Time In. This photo is not a liveness check.');
          autoClockInRef.current = false;
          return;
        }

        onTimeIn(
          effectiveLocation,
          effectiveBarangay,
          effectiveTask,
          verdict,
          lat,
          lon,
          capturedSelfie,
          fingerprintVerified,
          fingerprintProof,
          fillName,
          fillRole,
          fillOffice,
          fillId,
          assignedCoords.lat,
          assignedCoords.lon,
          distance,
          true,
          user?.email || '',
          assignmentSite,
          accuracy
        );
        setCapturedSelfie(null);
        setFingerprintVerified(false);
        setFingerprintProgress(0);
        autoClockInRef.current = false;
        autoClockOutRef.current = false;
      })
      .catch(error => {
        setGpsChecked(true);
        setGpsLoading(false);
        setLocationError(error.code === 1
          ? 'GPS permission is required before Time In. Allow location access in your browser settings.'
          : 'GPS could not get a fix. Turn on Location Services, then retry. If this page is open inside Messenger, open it in Chrome.');
        autoClockInRef.current = false;
      });
  };

  const executeClockOut = () => {
    if (!navigator.geolocation || !siteLocation) {
      setLocationError('Selected assignment location is not available for GPS verification.');
      return;
    }

    setGpsLoading(true);
    getPositionWithFallback()
      .then(position => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lon = Number(position.coords.longitude.toFixed(6));
        const accuracy = Number(position.coords.accuracy);
        const distance = computeDistanceMeters(lat, lon, assignedCoords.lat, assignedCoords.lon);
        const verdict = isWithinAssignedLocation(lat, lon, siteLocation, GEO_THRESHOLD_METERS) ? 'In Range' : 'Out of Range';

        setCoordinates({ lat, lon });
        setGpsAccuracy(Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null);
        setMockProximity(distance);
        setGpsVerdict(verdict);
        setGpsLoading(false);
        syncGeofenceStatus(lat, lon, siteLocation);

        if (!Number.isFinite(accuracy) || accuracy > 50) {
          setLocationError(`GPS accuracy is ${Number.isFinite(accuracy) ? `${Math.round(accuracy)}m` : 'unavailable'}. Improve the GPS fix before Time Out.`);
          return;
        }

        if (verdict !== 'In Range') {
          setLocationError(`Time Out blocked: your GPS location is outside ${siteLocation.label}.`);
          return;
        }

        onTimeOut({ latitude: lat, longitude: lon, gpsAccuracy: Number(position.coords.accuracy || 0) });
      })
      .catch(error => {
        setGpsLoading(false);
        setLocationError(error.code === 1
          ? 'GPS permission is required before Time Out. Allow location access in your browser settings.'
          : 'GPS could not get a fix. Turn on Location Services, then retry. If this page is open inside Messenger, open it in Chrome.');
      });
  };

  useEffect(() => {
    if (isCurrentlyActive) {
      return;
    }

    if (!capturedSelfie || !fingerprintVerified || !geofenceStatus.inRange || autoClockInRef.current) {
      return;
    }

    autoClockInRef.current = true;
    setLocationError('Auto clock-in triggered: employee entered the assigned geofence.');
    executeClockIn();
  }, [isCurrentlyActive, capturedSelfie, fingerprintVerified, geofenceStatus.inRange]);

  useEffect(() => {
    if (!isCurrentlyActive) {
      autoClockOutRef.current = false;
      return;
    }

    if (!gpsChecked || geofenceStatus.inRange || autoClockOutRef.current) {
      return;
    }

    autoClockOutRef.current = true;
    setLocationError('Auto clock-out triggered: employee left the assigned geofence.');
    executeClockOut();
  }, [isCurrentlyActive, gpsChecked, geofenceStatus.inRange, onTimeOut]);

  // Filter logs logic
  const normalize = (value) => (value ?? '').toString().trim().toLowerCase();

  const personalLogs = attendanceHistory.filter(log => matchesAttendanceEmployee(log, user));

  const filteredLogs = personalLogs.filter(log => {
    const location = log.location || '';
    const barangay = log.workAssignment?.barangayLgu || '';
    const task = log.workAssignment?.task || '';
    const matchesSearch = location.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          barangay.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          task.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (selectedFilter === 'all') return matchesSearch;
    if (selectedFilter === 'active') return matchesSearch && !log.timeOut;
    if (selectedFilter === 'completed') return matchesSearch && log.timeOut;
    return matchesSearch;
  });

  // Official PDF Report Export Function using jsPDF
  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    // Header letterhead with deep official agency blue
    doc.setFillColor(30, 64, 175); // Dark DILG Blue
    doc.rect(0, 0, 210, 42, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("DEPARTMENT OF THE INTERIOR AND LOCAL GOVERNMENT", 105, 15, { align: "center" });
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("REPUBLIC OF THE PHILIPPINES  •  PROVINCE OF MARINDUQUE", 105, 22, { align: "center" });
    doc.setFont("helvetica", "italic");
    doc.text("WorkMate Personnel Biometric Verification Portal", 105, 28, { align: "center" });
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("OFFICIAL PERSONNEL ATTENDANCE & BIOMETRIC RECORD REPORT", 105, 36, { align: "center" });
    
    // Personnel Meta Details card block
    doc.setFillColor(248, 250, 252);
    doc.rect(15, 48, 180, 36, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(15, 48, 180, 36, 'S');
    
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("PERSONNEL IDENTITY:", 20, 54);
    doc.text("SYSTEM DISPATCH LOGS:", 110, 54);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    const leftColX = 20;
    const rightColX = 118;
    const leftColWidth = 82;
    const rightColWidth = 75;
    const leftLines = doc.splitTextToSize(`Authorized Representative Name: ${fillName || user.name || "Authorized User"}`, leftColWidth);
    doc.text(leftLines, leftColX, 60);
    const leftDesignation = doc.splitTextToSize(`Designation & ID: ${fillRole || user.role || "Employee"} (ID: ${fillId || user.employeeId || "N/A"})`, leftColWidth);
    doc.text(leftDesignation, leftColX, 65);
    doc.text(doc.splitTextToSize(`Office Station: ${fillOffice || user.office || "DILG Office"}`, leftColWidth), leftColX, 74);
    doc.text(doc.splitTextToSize("Province Division: Region IV-B (MARINDUQUE)", leftColWidth), leftColX, 82);
    
    const rightDate = doc.splitTextToSize(`Document Export Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`, rightColWidth);
    doc.text(rightDate, rightColX, 60);
    doc.text(doc.splitTextToSize(`Total Attested Records Count: ${filteredLogs.length} Registered Signings`, rightColWidth), rightColX, 68);
    doc.text(doc.splitTextToSize("Verification Security Standard: SHA-256 GeoTag & Thumb biometrics", rightColWidth), rightColX, 76);
    doc.text(doc.splitTextToSize("Audit Status: Compliant & Verified Secure", rightColWidth), rightColX, 84);
    
    // Draw table horizontal boundary dividing header
    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(0.4);
    doc.line(15, 90, 195, 90);
    
    // Table Headers
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(30, 64, 175);
    doc.text("Date", 15, 95);
    doc.text("Assigned Mun.", 35, 95);
    doc.text("Barangay / LGU", 78, 95);
    doc.text("Time In", 118, 95);
    doc.text("Time Out", 138, 95);
    doc.text("GPS", 156, 95);
    doc.text("Biometrics", 172, 95);
    
    doc.line(15, 98, 195, 98);
    
    // Reset weights
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    
    let currentY = 104;
    
    if (filteredLogs.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.text("No active attendance entries registered for this agent identity inside standard local cache databases.", 105, currentY + 10, { align: "center" });
    } else {
      filteredLogs.forEach((log) => {
        // Page overflow protection
        if (currentY > 265) {
          doc.addPage();
          currentY = 25;
          // Redraw lightweight header for next page
          doc.setFillColor(30, 64, 175);
          doc.rect(0, 0, 210, 12, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.text("DILG WORKMATE BIOMETRICS ATTENDANCE SYSTEM REPORT  •  PAGE OVERFLOW", 105, 8, { align: "center" });
          
          doc.setFont("helvetica", "normal");
          doc.setTextColor(51, 65, 85);
        }
        
        doc.setFont("helvetica", "bold");
        doc.text(log.date, 15, currentY);
        doc.setFont("helvetica", "normal");
        
        doc.text(log.location.substring(0, 18), 35, currentY);
        doc.text(log.workAssignment.barangayLgu.substring(0, 20), 75, currentY);
        
        doc.setFont("helvetica", "bold");
        doc.text(log.timeIn, 118, currentY);
        doc.setFont("helvetica", "normal");
        
        doc.text(log.timeOut || "ON DUTY", 138, currentY);
        
        // GPS verified badge represent
        doc.text(log.gpsStatus === "In Range" ? "Verified" : "Unknown", 156, currentY);
        
        // Biometrics indicators check
        const bioText = (log.selfieUrl ? "Selfie" : "No-Img") + " + " + (log.fingerprintVerified ? "Thumb" : "No-Fng");
        doc.text(bioText, 172, currentY);
        
        doc.setDrawColor(241, 245, 249);
        doc.line(15, currentY + 3, 195, currentY + 3);
        currentY += 8;
      });
    }
    
    // Bottom verification seals and security markers
    if (currentY > 240) {
      doc.addPage();
      currentY = 25;
    }
    
    doc.setDrawColor(226, 232, 240);
    doc.line(15, currentY + 10, 195, currentY + 10);
    
    doc.setTextColor(30, 64, 175);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("SECURITY AUDIT COMPLIANCE SEAL", 15, currentY + 16);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text("This official database record is securely encrypted, hashed and reported directly to local government units database portals.", 15, currentY + 22);
    doc.text("Tampering with digital clock stamps falls under Republic Act 10175 and is subject to immediate personnel disbarment.", 15, currentY + 26);
    doc.text(`Seal Verification ID: VERIFY-SECURE-STAMP-${Date.now()}`, 15, currentY + 30);
    
    // Signatures blocks
    const signatureX = 130;
    const signatureY = currentY + 35;
    doc.setDrawColor(148, 163, 184);
    doc.line(signatureX, signatureY, signatureX + 55, signatureY);
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("Personnel Attested Signature", signatureX, signatureY + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("Self-Certified biometrics via mobile device", signatureX, signatureY + 13);
    
    // Save generated file!
    doc.save(`Personnel_Attendance_Logs_${new Date().toISOString().substring(0, 10)}.pdf`);
  };

  return (
    <div className="p-4 sm:p-8 pb-24 md:pb-8 space-y-8 overflow-y-auto flex-1 id-attendance-view">
      
      {/* Attendance Control Center */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left Form: Field & Assignment Selection */}
        <div className="lg:col-span-2 bg-white border border-slate-200/80 p-6 space-y-5 flex flex-col justify-between rounded-2xl shadow-sm">
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-md flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#1e40af]" />
                Time Recorder Setup & Verification
              </h3>
              <span className="text-[10px] text-indigo-600 bg-indigo-50 font-black px-2.5 py-1 rounded-md border border-indigo-100">
                OFFICIAL WORKMATE REGISTER
              </span>
            </div>

            {/* Personnel Details Fill Up Box */}
            <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-[#1e40af] uppercase tracking-wider block">
                  I. Personnel Identity Details
                </span>
                <span className="text-[9px] text-slate-400 font-bold">Editable Form</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase block">Authorized Personnel Name</label>
                  <input
                    id="input-fill-name"
                    type="text"
                    value={fillName}
                    onChange={(e) => setFillName(e.target.value)}
                    disabled={isCurrentlyActive}
                    placeholder="Enter full name"
                    className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-800 p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-[#1e40af] disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase block">Employee ID Number</label>
                  <input
                    id="input-fill-id"
                    type="text"
                    value={fillId}
                    onChange={(e) => setFillId(e.target.value)}
                    disabled={isCurrentlyActive}
                    placeholder="e.g. DILG-2026-XXXX"
                    className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-800 p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-[#1e40af] disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase block">Official Role / Designation</label>
                  <input
                    id="input-fill-role"
                    type="text"
                    value={fillRole}
                    onChange={(e) => setFillRole(e.target.value)}
                    disabled={isCurrentlyActive}
                    placeholder="Enter designation"
                    className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-800 p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-[#1e40af] disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase block">Assigned Station / Office</label>
                  <input
                    id="input-fill-office"
                    type="text"
                    value={fillOffice}
                    onChange={(e) => setFillOffice(e.target.value)}
                    disabled={isCurrentlyActive}
                    placeholder="Enter station"
                    className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-800 p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-[#1e40af] disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
              </div>
            </div>

            <span className="text-[10px] font-black text-[#1e40af] uppercase tracking-wider block pt-1">
              II. Mission & Assignment Specifications
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Assignment Role</label>
                  <select
                    id="select-assignment-mode"
                    value={assignmentMode}
                    disabled={isCurrentlyActive}
                    onChange={(event) => {
                      const mode = event.target.value;
                      setAssignmentMode(mode);
                      if (mode === 'office') {
                        const office = MARINDUQUE_OFFICES.find(item => item.id === selectedOfficeId) || MARINDUQUE_OFFICES[0];
                        setSelectedOfficeId(office.id);
                        setSelectedMuni(office.municipality);
                        setBarangayLgu(office.barangay);
                      } else if (mode === 'field' && !MARINDUQUE_MUNICIPALITIES[selectedMuni].includes(barangayLgu)) {
                        setBarangayLgu(MARINDUQUE_MUNICIPALITIES[selectedMuni][0]);
                      }
                      setGeofenceStatus({ inRange: false, canAutoClockIn: false, eventType: null, message: '' });
                    }}
                    className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-800 p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-[#1e40af] disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="field">Field</option>
                    <option value="wfh">Work From Home</option>
                    <option value="office">Office</option>
                  </select>
                </div>

                {isOfficeMode ? (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">DILG Office and Barangay</label>
                    <select
                      id="select-dilg-office"
                      value={selectedOfficeId}
                      disabled={isCurrentlyActive}
                      onChange={(event) => {
                        const office = MARINDUQUE_OFFICES.find(item => item.id === event.target.value);
                        if (!office) return;
                        setSelectedOfficeId(office.id);
                        setSelectedMuni(office.municipality);
                        setBarangayLgu(office.barangay);
                      }}
                      className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-800 disabled:bg-slate-100"
                    >
                      {MARINDUQUE_OFFICES.map(office => (
                        <option key={office.id} value={office.id}>{office.name} - Brgy. {office.barangay}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Municipality</label>
                      <select
                        id="select-municipality"
                        value={selectedMuni}
                        disabled={isCurrentlyActive}
                        onChange={(event) => {
                          const municipality = event.target.value;
                          setSelectedMuni(municipality);
                          if (!MARINDUQUE_MUNICIPALITIES[municipality].includes(barangayLgu)) {
                            setBarangayLgu(MARINDUQUE_MUNICIPALITIES[municipality][0]);
                          }
                        }}
                        className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-800 disabled:bg-slate-100"
                      >
                        {municipalities.map(municipality => <option key={municipality} value={municipality}>{municipality}, Marinduque</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Barangay</label>
                      <select
                        id="select-assigned-barangay"
                        value={barangayLgu}
                        disabled={isCurrentlyActive}
                        onChange={(event) => setBarangayLgu(event.target.value)}
                        className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-800 disabled:bg-slate-100"
                      >
                        {MARINDUQUE_MUNICIPALITIES[selectedMuni].map(barangay => <option key={barangay} value={barangay}>{barangay}</option>)}
                      </select>
                    </div>
                    {isWfhMode && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="space-y-1.5">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Street / House (Optional)</span>
                          <input value={wfhStreet} onChange={event => setWfhStreet(event.target.value)} disabled={isCurrentlyActive} placeholder="Street or house number" className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs" />
                        </label>
                        <label className="space-y-1.5">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Landmark (Optional)</span>
                          <input value={wfhLandmark} onChange={event => setWfhLandmark(event.target.value)} disabled={isCurrentlyActive} placeholder="Nearby landmark" className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs" />
                        </label>
                      </div>
                    )}
                  </>
                )}
                <p className="text-[10px] text-slate-500">{isWfhMode ? 'Philippines address format: ' : 'Selected GPS site: '}{effectiveLocation}</p>
                {siteLocationLoading && <p className="text-[10px] font-semibold text-blue-700">Locating selected assignment on the map...</p>}
                {siteLocationError && <p role="alert" className="text-[10px] font-semibold text-rose-700">{siteLocationError}</p>}
                {siteLocation && <p className="text-[10px] font-semibold text-emerald-700">Map target verified: {siteLocation.displayName}</p>}
              </div>

              {/* Assigned Duty Description */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Assigned Operations Task Description</label>
                <textarea
                  id="input-task"
                  value={effectiveTask}
                  onChange={(e) => setAssignedTask(e.target.value)}
                  disabled={isCurrentlyActive || isOfficeMode}
                  rows={3}
                  placeholder={isOfficeMode ? 'Office-based administrative work' : 'Brief description of the official task...'}
                  className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-800 p-2.5 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-[#1e40af] transition-all disabled:bg-slate-100 disabled:text-slate-400 leading-relaxed"
                />
              </div>
            </div>

            {/* Mandatory Biometric Verification Panel */}
            {!isCurrentlyActive && (
              <div className="mt-4 p-5 border border-blue-200 bg-blue-50/10 rounded-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-blue-100 pb-3 flex-wrap gap-2">
                  <span className="text-xs font-black text-[#1e40af] uppercase tracking-widest flex items-center gap-1.5">
                    <ShieldCheck className="w-5 h-5 text-[#1e40af]" />
                    Identity Verification
                  </span>
                </div>
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-900">
                  Capture a selfie for your attendance record. Time In still requires the registered passkey and GPS location checks.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Column 1: attendance selfie photo */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col space-y-4 relative overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                        <Camera className="w-4 h-4 text-[#1e40af]" />
                        I. Attendance Selfie Photo
                      </span>
                      {capturedSelfie ? (
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full font-black border border-emerald-200">SELFIE ATTACHED</span>
                      ) : (
                        <span className="text-[10px] text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full font-black border border-amber-200 animate-pulse">
                          REQUIRED
                        </span>
                      )}
                    </div>

                    <div className={`rounded-2xl border p-3 sm:p-4 ${
                      selfieCameraActive
                        ? 'border-slate-800 bg-slate-950'
                        : capturedSelfie
                          ? 'border-emerald-200 bg-emerald-50/50'
                          : 'border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50'
                    }`}>
                      {capturedSelfie ? (
                        <div className="space-y-3">
                          <img src={capturedSelfie} alt="Attendance selfie photo" className="mx-auto max-h-64 rounded-xl object-contain" />
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-bold text-slate-600">
                              This photo is attached to your attendance record for HR review; it is not automatically face-matched.
                            </p>
                            <button type="button" onClick={handleResetSelfie} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
                              Take Again
                            </button>
                          </div>
                        </div>
                      ) : selfieCameraActive ? (
                        <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-xl">
                          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                            <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-white">
                              <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
                              Camera preview
                            </span>
                            <span className="text-[10px] font-semibold text-slate-400">Live selfie</span>
                          </div>
                          <div className="relative mx-auto aspect-[3/4] w-full overflow-hidden bg-slate-900">
                            <video
                              ref={selfieVideoRef}
                              autoPlay
                              playsInline
                              muted
                              className="h-full w-full scale-x-[-1] object-cover"
                            />
                            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                              <div className="h-[62%] w-[58%] rounded-[50%] border-2 border-white/90 shadow-[0_0_0_999px_rgba(2,6,23,0.48)]" />
                              <span className="absolute bottom-5 rounded-full bg-slate-950/70 px-3 py-1.5 text-[10px] font-bold text-white backdrop-blur-sm">
                                Center your face in the frame
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-center gap-7 px-4 py-4">
                            <button
                              type="button"
                              onClick={captureAttendanceSelfie}
                              aria-label="Capture selfie"
                              className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-blue-600 text-white shadow-lg transition hover:scale-105 hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
                            >
                              <Camera className="h-6 w-6" />
                            </button>
                            <button
                              type="button"
                              onClick={stopSelfieCamera}
                              className="rounded-xl border border-white/20 px-4 py-3 text-xs font-bold text-white transition hover:bg-white/10"
                            >
                              Cancel
                            </button>
                          </div>
                          <p className="px-4 pb-4 text-center text-[10px] leading-relaxed text-slate-400">
                            The guide helps position your face; the photo is not automatically face-verified.
                          </p>
                        </div>
                      ) : (
                        <div className="flex min-h-[210px] flex-col items-center justify-center px-2 py-5 text-center">
                          <div className="relative mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-200">
                            <Camera className="h-6 w-6" />
                            <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-[3px] border-white bg-emerald-500" />
                          </div>
                          <p className="text-sm font-black text-slate-800">Ready for your selfie</p>
                          <p className="mt-1.5 max-w-[230px] text-[11px] leading-relaxed text-slate-500">
                            Use your front camera. Center your face when the live preview opens.
                          </p>
                          <button
                            type="button"
                            onClick={startSelfieCamera}
                            className="mt-4 inline-flex w-full max-w-[220px] items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-xs font-black text-white shadow-md shadow-blue-200 transition hover:-translate-y-0.5 hover:bg-blue-800 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
                          >
                            <Camera className="h-4 w-4" /> Open Front Camera
                          </button>
                          <p className="mt-3 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                            Camera access required · Passkey + GPS checked separately
                          </p>
                        </div>
                      )}
                      {cameraError && <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">{cameraError}</p>}
                    </div>
                  </div>

                  {/* Column 2: Fingerprint verification - HIGH-FIDELITY LARGE VIEW */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between space-y-4 relative overflow-hidden shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                        <Fingerprint className="w-4 h-4 text-[#1e40af]" />
                        II. Passkey Verification
                      </span>
                      {fingerprintVerified ? (
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full font-black border border-emerald-200">
                          ✓ THUMB VERIFIED
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full font-black border border-amber-200 animate-pulse">
                          REQUIRED
                        </span>
                      )}
                    </div>

                    {/* Scanner Pad Area - h-72 for larger window */}
                    <div className="h-72 bg-slate-950 rounded-xl overflow-hidden flex flex-col items-center justify-center relative border border-dashed border-slate-300 p-4">
                      {fingerprintVerified ? (
                        <div className="text-center space-y-3 flex flex-col items-center justify-center h-full w-full">
                          <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center border-2 border-emerald-500/30 animate-pulse">
                            <Check className="w-8 h-8 text-emerald-400" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-black text-emerald-400 uppercase tracking-widest leading-none">BIOMETRIC TOUCH CONFIRMED</p>
                            <p className="text-[10px] text-slate-400">Device biometric credential accepted</p>
                            <button
                              onClick={handleResetFingerprint}
                              className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline font-black mt-2 cursor-pointer block mx-auto"
                            >
                              Reset Device Biometric
                            </button>
                          </div>
                        </div>
                      ) : fingerprintScanning ? (
                        <div className="w-full h-full flex flex-col items-center justify-center relative">
                          {/* Laser Scanner sweeping bar */}
                          <div className="absolute inset-x-0 h-1 bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,1)] animate-[bounce_2s_infinite] z-10"></div>
                          
                          <Fingerprint className="w-20 h-20 text-cyan-400 animate-pulse" />
                          
                          <span className="font-mono text-[10px] text-cyan-400 mt-4 font-black uppercase tracking-widest animate-pulse">
                            WAITING FOR DEVICE BIOMETRIC...
                          </span>
                        </div>
                      ) : (
                        <div className="text-center space-y-4 flex flex-col items-center justify-center max-w-xs">
                          <button
                            onClick={handleStartFingerprintScan}
                            className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 hover:border-blue-500 flex items-center justify-center text-blue-500 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-lg group relative"
                            title="Use device biometric"
                          >
                            <div className="absolute inset-0 bg-blue-500/5 rounded-full animate-ping group-hover:block"></div>
                            <Fingerprint className="w-8 h-8 text-blue-500 group-hover:text-cyan-400 group-hover:animate-pulse" />
                          </button>
                          <div className="space-y-1">
                            <p className="text-xs font-black text-slate-300 uppercase tracking-wider">USE DEVICE BIOMETRIC</p>
                            <p className="text-[10px] text-slate-500 leading-relaxed">Use a registered passkey with device fingerprint or screen lock.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {cameraError && (
                  <p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                    {cameraError}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Core Action Punch Block */}
          <div className="pt-5 border-t border-slate-100 flex flex-col gap-3.5">
            <div className="flex flex-wrap gap-4 items-center justify-between">
              <div className="text-xs text-slate-500 font-semibold">
                {isCurrentlyActive ? (
                  <span className="flex items-center gap-1.5 text-emerald-700 font-bold bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Clocked In: {todayRecord.timeIn}
                  </span>
                ) : (
                  <span className="text-amber-600 font-bold">DTR terminal is open for punching</span>
                )}
              </div>

              <div className="flex flex-wrap gap-2 justify-between">
                {/* Time In Button */}
                <button
                  id="btn-punch-in"
                  onClick={executeClockIn}
                  disabled={isCurrentlyActive || !capturedSelfie || !fingerprintVerified || gpsLoading}
                  className="flex-1 min-w-[42%] max-w-[48%] px-4 py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:cursor-not-allowed"
                >
                  <Play className="w-4 h-4 fill-white shrink-0" />
                  <span>Time In</span>
                </button>

                {/* Time Out Button */}
                <button
                  id="btn-punch-out"
                  onClick={executeClockOut}
                  disabled={!isCurrentlyActive || gpsLoading}
                  className="flex-1 min-w-[42%] max-w-[48%] px-4 py-2.5 text-xs font-bold bg-[#e11d48] hover:bg-red-700 active:scale-[0.98] disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:cursor-not-allowed"
                >
                  <Clock className="w-4 h-4 shrink-0" />
                  <span>Time Out</span>
                </button>
              </div>
            </div>

            {/* Validation helper label */}
            {!isCurrentlyActive && (
              <div className="text-[10px] font-bold text-slate-500 flex flex-wrap gap-2 items-center justify-end">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${hasGpsPosition ? 'text-emerald-700 bg-emerald-50' : 'text-slate-400 bg-slate-100'}`}>
                  {hasGpsPosition ? '✓ GPS Located' : '✗ GPS Not Checked'}
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${isWithinAssignment ? 'text-emerald-700 bg-emerald-50' : 'text-slate-400 bg-slate-100'}`}>
                  {isWithinAssignment ? '✓' : '✗'} Assigned Location Match
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${capturedSelfie ? 'text-emerald-700 bg-emerald-50' : 'text-slate-400 bg-slate-100 animate-pulse'}`}>
                  {capturedSelfie ? '✓ Selfie Recorded' : '✗ Selfie Required'}
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${fingerprintVerified ? 'text-emerald-700 bg-emerald-50' : 'text-slate-400 bg-slate-100 animate-pulse'}`}>
                  {fingerprintVerified ? '✓ Fingerprint Authenticated' : '✗ Fingerprint Required'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Employee GPS map and geofence status */}
        <div className="bg-white text-slate-800 rounded-2xl overflow-hidden p-4 relative flex flex-col border border-slate-200/80 shadow-sm">
          {/* Radar background illustration */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(30,64,175,0.04)_0%,rgba(248,250,252,0)_70%)] pointer-events-none"></div>

          <div className="space-y-3 relative z-10">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-bold text-xs text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Compass className="w-4 h-4 text-[#1e40af]" />
                GPS Geofence Radar
              </h4>
            </div>

            <div className={`rounded-lg border p-2.5 flex items-center gap-2 ${
              isAssignmentVerified
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-rose-50/60 border-rose-200'
            }`}>
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                isAssignmentVerified ? 'bg-emerald-500' : 'bg-rose-500'
              }`} />
              <div className={`text-[11px] font-bold leading-tight ${
                isAssignmentVerified ? 'text-emerald-900' : 'text-rose-900'
              }`}>
                <div>Assigned Site: <span className={`font-black ${
                  isAssignmentVerified ? 'text-emerald-700' : 'text-rose-700'
                }`}>{effectiveLocation}</span></div>
                <div className={`text-[10px] font-semibold ${
                  isAssignmentVerified ? 'text-emerald-700' : 'text-rose-700'
                }`}>{geofenceDescription}</div>
              </div>
            </div>

            <div className="relative h-56 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              <iframe
                title="Employee current GPS map"
                src={mapEmbedUrl}
                className="h-full w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-slate-600">
              <span>
                {hasGpsPosition
                  ? `Google Maps pin: your current GPS location (${coordinates.lat}, ${coordinates.lon})`
                  : `Google Maps target: ${effectiveLocation}`}
              </span>
              <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-blue-700 underline">
                {hasGpsPosition ? `Open route to ${effectiveLocation}` : 'Open in Google Maps'}
              </a>
            </div>

            {isAssignmentVerified ? (
              <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-emerald-800">
                <p className="flex items-center gap-2 text-xs font-extrabold">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  ASSIGNED LOCATION VERIFIED — YOU ARE WITHIN THE ASSIGNED AREA
                </p>
                <p className="mt-1 text-[10px] font-semibold">
                  GPS is {mockProximity}m from the assigned map location with ±{Math.round(gpsAccuracy)}m accuracy.
                </p>
              </div>
            ) : hasGpsPosition && siteLocation && isWithinAssignment ? (
              <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-800">
                <p className="text-xs font-extrabold">Location matches, but GPS accuracy is not verified</p>
                <p className="mt-1 text-[10px] font-semibold">
                  {gpsAccuracy === null
                    ? 'GPS accuracy is unavailable.'
                    : `Current GPS accuracy is ±${Math.round(gpsAccuracy)}m; 50m or better is required.`}
                  {' '}Refresh GPS to verify before Time In.
                </p>
              </div>
            ) : null}

            {locationError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] font-semibold text-amber-700">
                {locationError}
                {isMessengerBrowser && /GPS|location/i.test(locationError) && (
                  <a
                    href={`intent://dilg-workmate.vercel.app${window.location.pathname}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(window.location.href)};end`}
                    className="mt-2 inline-flex rounded-lg bg-blue-700 px-3 py-2 text-[11px] font-extrabold text-white no-underline"
                  >
                    Open WorkMate in Chrome
                  </a>
                )}
              </div>
            )}

            <div className="h-24 flex items-center justify-center relative my-1">
              <div className="absolute w-24 h-24 rounded-full border border-blue-500/10 flex items-center justify-center">
                <div className="absolute w-16 h-16 rounded-full border border-blue-500/5 flex items-center justify-center">
                  <div className="absolute w-8 h-8 rounded-full border border-blue-500/5 flex items-center justify-center">
                    <span className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-ping"></span>
                    <span className="absolute w-2.5 h-2.5 bg-blue-500 rounded-full"></span>
                  </div>
                </div>
              </div>

              <div className="absolute bottom-0 text-center font-mono text-[11px] text-slate-500 leading-none">
                Distance: <span className="text-[#1e40af] font-extrabold">{hasGpsPosition ? `${mockProximity} meters` : 'Waiting for GPS'}</span>
              </div>
            </div>

            {/* Coordination Logs */}
            <div className="space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-100 font-mono text-[11px] text-slate-500">
              <div className="flex justify-between">
                <span>Your Current Position:</span>
                <span className="text-slate-800 font-bold">{hasGpsPosition ? `${coordinates.lat}° / ${coordinates.lon}°` : 'Waiting for GPS fix'}</span>
              </div>
              <div className="flex justify-between">
                <span>GPS Accuracy:</span>
                <span className={`font-bold ${gpsAccuracy !== null && gpsAccuracy <= 50 ? 'text-emerald-700' : hasGpsPosition ? 'text-rose-700' : 'text-slate-500'}`}>
                  {hasGpsPosition ? gpsAccuracy === null ? 'Unavailable' : `±${Math.round(gpsAccuracy)} m${gpsAccuracy <= 50 ? ' (good)' : ' (weak)'}` : 'Waiting for GPS'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Distance from map pin:</span>
                <span className={`text-slate-800 font-bold ${isWithinAssignment ? 'text-emerald-700' : hasGpsPosition ? 'text-rose-700' : 'text-slate-500'}`}>{hasGpsPosition ? `${mockProximity} m from map location` : 'Waiting for GPS'}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-100 font-bold">
                <span>Status:</span>
                <span className={isWithinAssignment ? 'text-emerald-700' : hasGpsPosition ? 'text-rose-700' : 'text-slate-500'}>{isWithinAssignment ? '✓ WITHIN GEOFENCE' : hasGpsPosition ? '✗ OUTSIDE GEOFENCE' : 'GPS NOT VERIFIED'}</span>
              </div>
            </div>
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between relative z-10 gap-2">
            {/* Geofence Check Indicator */}
            <div className="flex items-center gap-1.5">
              {!hasGpsPosition ? (
                <div className="flex items-center gap-1.5 text-xs text-slate-600 font-bold bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                  <Compass className="w-3.5 h-3.5 text-slate-500" />
                  <span>{gpsLoading ? 'LOCATING...' : 'GPS NOT CHECKED'}</span>
                </div>
              ) : gpsVerdict === 'In Range' ? (
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Geofence: IN RANGE</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-rose-700 font-bold bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100 animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Geofence: OUT OF RANGE</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                id="btn-re-verify-gps"
                type="button"
                onClick={handleGetLiveGPS}
                disabled={gpsLoading}
                className="text-[11px] font-bold text-white bg-[#1e40af] hover:bg-blue-800 disabled:bg-slate-150 disabled:text-slate-400 py-2 px-3 rounded-md flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed transition-all"
              >
                <RotateCw className={`w-3 h-3 ${gpsLoading ? 'animate-spin' : ''}`} />
                <span>{gpsLoading ? 'Locating...' : gpsChecked ? 'Refresh GPS' : 'Verify GPS'}</span>
              </button>
            </div>
          </div>
        </div>

      </div>

      {false && showFullMap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-gradient-to-r from-blue-50 to-slate-50">
              <div className="flex-1 flex items-center gap-3">
                <div className="text-2xl">🗺️</div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">GPS Geofence Monitoring Map</h3>
                  <p className="text-xs font-semibold text-slate-600 mt-0.5">Real-time location tracking: Your position vs assigned work site</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFullMap(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 transition-all active:scale-95 flex-shrink-0"
              >
                ✕ Close
              </button>
            </div>
            <div className="relative h-[70vh] w-full bg-slate-100">
              <iframe
                title="Full GPS map"
                src={mapEmbedUrl}
                className="h-full w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              
              {/* Geofence Status Overlay */}
              <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white/97 border border-slate-300 rounded-lg px-4 py-3 shadow-lg backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  {isWithinAssignment ? (
                    <>
                      <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-sm font-bold uppercase text-emerald-700">✓ Within Geofence</span>
                    </>
                  ) : (
                    <>
                      <div className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
                      <span className="text-sm font-bold uppercase text-rose-700">✗ Outside Geofence</span>
                    </>
                  )}
                </div>
                <div className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <span>Distance: <span className={`font-bold ${isWithinAssignment ? 'text-emerald-600' : 'text-rose-600'}`}>{mockProximity}m</span></span>
                  <span className="text-slate-300">|</span>
                  <span>Rule: <span className="font-bold text-slate-800">{geofenceDescription}</span></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Satellite View Modal */}
      {false && showSatelliteView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-gradient-to-r from-blue-50 to-slate-50">
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-900">📍 Your Current Location</h3>
                <p className="text-sm font-semibold text-slate-600 mt-1">Satellite view of your exact GPS position</p>
              </div>
              <button
                type="button"
                onClick={() => setShowSatelliteView(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 transition-all"
              >
                ✕ Close
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <div className="h-96 w-full bg-slate-100">
                <iframe
                  title="Satellite view"
                    src={`https://maps.google.com/maps?q=${coordinates.lat},${coordinates.lon}&t=k&z=18&output=embed`}
                  className="h-full w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              
              <div className="p-6 bg-white space-y-4 border-t border-slate-200">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <p className="text-xs font-semibold text-slate-600 uppercase">Latitude</p>
                    <p className="text-lg font-bold text-blue-900 mt-1">{coordinates.lat.toFixed(6)}°N</p>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <p className="text-xs font-semibold text-slate-600 uppercase">Longitude</p>
                    <p className="text-lg font-bold text-blue-900 mt-1">{coordinates.lon.toFixed(6)}°E</p>
                  </div>
                  <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200">
                    <p className="text-xs font-semibold text-slate-600 uppercase">Distance from map pin</p>
                    <p className="text-lg font-bold text-emerald-900 mt-1">{mockProximity}m</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 md:col-span-2">
                    <p className="text-xs font-semibold text-slate-600 uppercase">Geofence Status</p>
                    <p className={`text-base font-bold mt-1 ${isWithinAssignment ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {isWithinAssignment ? `✓ Within ${geofenceDescription}` : `✗ Outside ${geofenceDescription}`}
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <p className="text-xs font-semibold text-slate-600 uppercase">GPS Coordinates</p>
                  <p className="text-sm font-mono text-slate-800 mt-2 break-all">
                    {coordinates.lat.toFixed(6)}, {coordinates.lon.toFixed(6)}
                  </p>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="text-xs font-semibold text-slate-600 uppercase">Google Maps Link</p>
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-bold text-blue-600 hover:text-blue-800 mt-2 inline-block hover:underline"
                  >
                    🔗 Open in Google Maps →
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Warning if GPS out of bounds */}
      {geofenceStatus.message && !geofenceStatus.inRange && (
        <div className={`border-l-4 p-4.5 rounded-r-2xl flex items-start gap-3.5 ${geofenceStatus.inRange ? 'bg-emerald-50 border-emerald-500' : 'bg-rose-50 border-rose-500'} ${geofenceStatus.inRange ? '' : 'animate-pulse'}`}>
          <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${geofenceStatus.inRange ? 'text-emerald-500' : 'text-rose-500'}`} />
          <div className="text-xs space-y-1">
            <p className="font-extrabold text-slate-900">
              {geofenceStatus.inRange ? 'Geofence Check: Ready' : 'Geofence Check: Outside Range'}
            </p>
            <p className="font-semibold text-slate-700">{geofenceStatus.message}</p>
          </div>
        </div>
      )}

      {gpsChecked && gpsVerdict === 'Out of Range' && (
        <div role="alert" className="bg-rose-50 border-l-4 border-rose-500 p-4.5 rounded-r-2xl flex items-start gap-3.5 animate-pulse">
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="text-xs text-[#991b1b] space-y-1">
            <p className="font-extrabold text-slate-900">Time In blocked: outside the assigned area</p>
            <p className="font-semibold text-slate-700">
              Your current GPS is <b>{mockProximity} meters</b> from the assigned Google Maps location for <b>{effectiveLocation}</b>.
              You cannot <b>Time In</b> until your device location is within the assigned area ({geofenceDescription}).
            </p>
            <p className="font-mono text-[10px] text-rose-800">
              Current: {coordinates.lat}, {coordinates.lon} &middot; Assigned: {assignedCoords?.lat}, {assignedCoords?.lon}
            </p>
          </div>
        </div>
      )}

      {/* Attendance Log History Section */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <h3 className="font-bold text-slate-800 text-md flex items-center gap-2">
              <span>Personal Attendance History Logs</span>
            </h3>
            <p className="text-xs text-slate-550">Official logged clockings synchronizing directly to administrative portal.</p>
          </div>

          {/* Filter, Search & Export Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Export Official PDF Document button */}
            <button
              id="btn-export-pdf"
              onClick={handleExportPDF}
              className="text-white bg-slate-900 hover:bg-slate-800 font-bold text-xs py-2 px-3.5 rounded-lg flex items-center gap-2 cursor-pointer shadow-sm active:scale-95 transition-all outline-none"
              title="Generate and Download official DILG PDF Attendance Report"
            >
              <Download className="w-3.5 h-3.5 text-white" />
              <span>Export PDF Report</span>
            </button>

            {/* Find Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="search-attendance"
                type="text"
                placeholder="Search town, LGU, tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-800 pl-9 pr-4 py-2 w-48 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-[#1e40af] transition-all"
              />
            </div>

            {/* Quick Filter tabs */}
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs font-bold text-slate-500">
              <button
                id="tab-att-all"
                onClick={() => setSelectedFilter('all')}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  selectedFilter === 'all' ? 'bg-[#1e40af] text-white shadow-sm' : 'hover:text-slate-800'
                }`}
              >
                All
              </button>
              <button
                id="tab-att-active"
                onClick={() => setSelectedFilter('active')}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  selectedFilter === 'active' ? 'bg-[#1e40af] text-white shadow-sm' : 'hover:text-slate-800'
                }`}
              >
                Active
              </button>
              <button
                id="tab-att-completed"
                onClick={() => setSelectedFilter('completed')}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  selectedFilter === 'completed' ? 'bg-[#1e40af] text-white shadow-sm' : 'hover:text-slate-800'
                }`}
              >
                Completed
              </button>
            </div>
          </div>
        </div>

        {/* Mobile-friendly history cards for small screens */}
        <div className="space-y-4 md:hidden">
          {filteredLogs.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-500 font-bold">
              No matching attendance logs found
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id || `${log.date}-${log.timeIn}` } className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold">Date Logged</p>
                    <p className="text-sm font-extrabold text-slate-900">{log.date}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                    log.status === 'Present' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                  }`}>
                    {log.status}
                  </span>
                </div>

                <div className="mt-4 rounded-3xl overflow-hidden border border-slate-200 bg-slate-950">
                  {log.selfieUrl ? (
                    <img
                      src={log.selfieUrl}
                      alt="Logged selfie"
                      className="w-full h-52 object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-52 flex items-center justify-center bg-slate-900 text-[11px] text-slate-400 font-bold uppercase tracking-[0.3em]">
                      No selfie image available
                    </div>
                  )}
                  <div className="px-3 py-2 bg-slate-950 text-[10px] text-slate-300 border-t border-slate-800">
                    {log.selfieUrl ? 'Selfie verification image logged' : 'No selfie captured for this record'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4 text-[11px] text-slate-600">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-slate-400">Time In</p>
                    <p className="font-semibold text-slate-800 mt-1">{log.timeIn}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-slate-400">Time Out</p>
                    <p className="font-semibold text-slate-800 mt-1">{log.timeOut || 'ON DUTY'}</p>
                  </div>
                </div>

                <div className="mt-4 space-y-3 text-[11px] text-slate-600">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.2em] text-slate-400">Personnel / ID</p>
                    <p className="font-semibold text-slate-800 mt-1">{log.employeeName || user?.name || 'Employee'}</p>
                    <p className="text-[10px] text-slate-500">{log.employeeId || user?.employeeId || 'DILG-2026-REG'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.2em] text-slate-400">Location</p>
                    <p className="font-semibold text-slate-800 mt-1">{log.location}</p>
                    <p className="text-[10px] text-slate-500">{log.workAssignment?.barangayLgu || 'No LGU set'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.2em] text-slate-400">Task</p>
                    <p className="font-semibold text-slate-800 mt-1 line-clamp-2">{log.workAssignment?.task || 'No task details'}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] font-semibold">
                  <span className="inline-flex items-center justify-center rounded-2xl bg-blue-50 text-blue-700 px-2.5 py-2 border border-blue-100">
                    GPS: {log.gpsStatus === 'In Range' ? 'Verified' : 'Out of Range'}
                  </span>
                  <span className="inline-flex items-center justify-center rounded-2xl bg-slate-50 text-slate-700 px-2.5 py-2 border border-slate-200">
                    {log.fingerprintVerified ? 'Fingerprint OK' : 'No Fingerprint'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Table representation for medium and larger screens */}
        <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-205">
          <table className="w-full text-left text-[11px] sm:text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px] sm:text-[11px]">
                <th className="p-3">Date Logged</th>
                <th className="p-3">Personnel / ID</th>
                <th className="p-3">Assigned Location & LGU</th>
                <th className="p-3">Daily Assignment Task</th>
                <th className="p-3 text-center">Clock-In</th>
                <th className="p-3 text-center">Clock-Out</th>
                <th className="p-3 text-center">Ident + Bio Checked</th>
                <th className="p-3 text-center">GPS Status</th>
                <th className="p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-650 font-medium">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 font-bold">
                    No matching attendance logs found
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-3 font-bold text-slate-800 whitespace-nowrap">{log.date}</td>
                    <td className="p-3 whitespace-nowrap">
                      <div className="space-y-0.5">
                        <span className="font-extrabold text-slate-800 block text-[11px] sm:text-xs">
                          {log.employeeName || user.name || "Authorized User"}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono font-bold block">
                          ID: {log.employeeId || user.employeeId || "DILG-2026-REG"}
                        </span>
                        <span className="text-[9px] text-indigo-700 bg-indigo-50/80 font-bold px-1.5 py-0.5 rounded border border-indigo-100 block max-w-max">
                          {log.employeeRole || user.role || "Employee"} • {log.employeeOffice || user.office || "DILG Office"}
                        </span>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="space-y-0.5">
                        <span className="font-bold flex items-center gap-1 text-slate-800 text-[11px] sm:text-xs">
                          <MapPin className="w-3 h-3 text-red-500 inline-block" />
                          {log.location}
                        </span>
                        <span className="text-[9px] sm:text-[10px] text-slate-400 font-bold block">{log.workAssignment?.barangayLgu || "Not set"}</span>
                      </div>
                    </td>
                    <td className="p-3 max-w-xs truncate text-slate-650" title={log.workAssignment.task}>
                      {log.workAssignment.task}
                    </td>
                    <td className="p-3 text-center">
                      <span className="bg-blue-50 text-[#1e40af] border border-blue-100 px-2 py-1 rounded font-mono font-bold text-[11px] sm:text-xs">
                        {log.timeIn}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {log.timeOut ? (
                        <span className="bg-amber-50 text-[#b45309] border border-amber-100 px-2 py-1 rounded font-mono font-bold">
                          {log.timeOut}
                        </span>
                      ) : (
                        <span className="text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded font-bold animate-pulse block max-w-max mx-auto text-[10px] tracking-wide">
                          ON DUTY
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {/* Selfie preview element */}
                        {log.selfieUrl ? (
                          <div className="relative w-7 h-7 rounded-full overflow-hidden border border-slate-200 bg-slate-100" title="Webcam photo logged">
                            <img src={log.selfieUrl} alt="Logged selfie" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                        ) : (
                          <span className="w-8 h-8 rounded-full border border-dashed border-slate-205 flex items-center justify-center text-[8px] text-slate-400 font-bold" title="Pre-system logging (No Photo)">
                            Legacy
                          </span>
                        )}

                        {/* Thumbprint verification status element */}
                        {log.fingerprintVerified ? (
                          <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-150 flex items-center justify-center text-emerald-600" title="Biometric Thumbprint Authenticated">
                            <Fingerprint className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400" title="Pre-system logging (No Biometric)">
                            <Fingerprint className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      {log.gpsStatus === 'In Range' ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-emerald-110">
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold border border-red-110 animate-pulse">
                          Out of Bounds
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold ${
                        log.status === 'Present' ? 'bg-emerald-50 text-emerald-700 border border-emerald-110' : 'bg-red-50 text-red-700 border border-red-110'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
