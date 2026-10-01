/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense, useCallback, useState, useEffect, useRef } from 'react';
import { attendanceWindowStart, getManilaDateString } from '../shared/localDate';
import { mergeAttendanceMonth, mergeRecentAttendance } from './utils/hrAttendance';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import MobileBottomNav from './components/MobileBottomNav';
import NotificationCenter from './components/NotificationCenter';
import SmsCenter from './components/SmsCenter';
import { queueAttendance, syncQueuedAttendance } from './utils/offlineAttendance';
import { matchesAttendanceEmployee } from './utils/attendanceIdentity';
import { apiFetch, clearSessionToken, parseApiResponse, readSessionToken, storeSessionToken } from './utils/api';

const DashboardView = lazy(() => import('./components/DashboardView'));
const AttendanceView = lazy(() => import('./components/AttendanceView'));
const RequestsView = lazy(() => import('./components/RequestsView'));
const AnnouncementsView = lazy(() => import('./components/AnnouncementsView'));
const CalendarView = lazy(() => import('./components/CalendarView'));
const ProfileView = lazy(() => import('./components/ProfileView'));
const SettingsView = lazy(() => import('./components/SettingsView'));
const HelpView = lazy(() => import('./components/HelpView'));
const DocumentsView = lazy(() => import('./components/DocumentsView'));
const OfficeDirectoryView = lazy(() => import('./components/OfficeDirectoryView'));
const SupervisorView = lazy(() => import('./components/SupervisorView'));
const HRAdminProfileView = lazy(() => import('./components/HRAdminProfileView'));
const HRAdminView = lazy(() => import('./components/HRAdminView'));
const LoginView = lazy(() => import('./components/LoginView'));
const PasswordResetView = lazy(() => import('./components/PasswordResetView'));

const fetch = apiFetch;
// Positions less precise than this are not sent while a shift is open.
const MAX_TRACKING_ACCURACY_METERS = 100;

const belongsToEmployee = (item, account) => {
  const hasRecipient = item?.employeeId || item?.employeeEmail;
  return Boolean(hasRecipient && matchesAttendanceEmployee(item, account));
};

// Notices with no recipient and no role go to every employee (for example, a new
// announcement). HR/Admins and supervisors see their role's notices and their own.
const isForEveryEmployee = item => !item?.employeeId && !item?.employeeEmail && !item?.recipientRole;
const scopeNotificationsToAccount = (items, role, account) => {
  if (role === 'employee') return items.filter(item => isForEveryEmployee(item) || belongsToEmployee(item, account));
  if (role === 'hr_admin' || role === 'supervisor') return items.filter(item => item.recipientRole === role || belongsToEmployee(item, account));
  return items;
};

const scopeMessagesToAccount = (items, role, account) => {
  if (role === 'employee') return items.filter(item => belongsToEmployee(item, account));
  if (role === 'supervisor') return items.filter(item => item.recipientRole === 'supervisor');
  if (role === 'hr_admin') return items.filter(item => item.recipientRole === 'hr_admin');
  return items;
};

export default function App() {
  const [authToken, setAuthToken] = useState(() => readSessionToken());
  const [activeRole, setActiveRole] = useState(null);
  const isEmployeeMobileApp = new URLSearchParams(window.location.search).get('platform') === 'mobile'
    && new URLSearchParams(window.location.search).get('role') === 'employee';

  const [currentView, setCurrentView] = useState('dashboard');
  // Counts page picks, so picking the HR page already open starts it over (for example,
  // Attendance goes back to monitoring from DTR Records).
  const [viewVisit, setViewVisit] = useState(0);
  // What a notification's button opens on the next page ({ employeeId } or { requestId }),
  // for that one visit only.
  const [viewFocus, setViewFocus] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // State initializes empty and is loaded from MongoDB-backed API state only
  const [user, setUser] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  // HR/Admins load attendance from the start of the previous month. Earlier months are
  // loaded when HR asks (handleLoadAttendanceMonth) and kept when the recent ones reload.
  const [loadedAttendanceMonths, setLoadedAttendanceMonths] = useState([]);
  const loadedAttendanceMonthsRef = useRef(new Set());
  const [requests, setRequests] = useState([]);
  const [events, setEvents] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [smsAlerts, setSmsAlerts] = useState([]);
  // Whether the server can send texts; HR only (undefined for everyone else).
  const [smsConfigured, setSmsConfigured] = useState(undefined);
  const [adminNotifications, setAdminNotifications] = useState([]);
  const [adminSmsAlerts, setAdminSmsAlerts] = useState([]);
  const [employees, setEmployees] = useState([]);
  // Supervisors get only how many employee accounts can log in, not the employee list.
  const [activeEmployeeCount, setActiveEmployeeCount] = useState(null);
  const [acknowledgedAnnouncements, setAcknowledgedAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  // The password reset email links to /?resetToken=..., opened while signed out.
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get('resetToken'));
  const [showResetPage, setShowResetPage] = useState(() => Boolean(new URLSearchParams(window.location.search).get('resetToken')));
  const [profileToast, setProfileToast] = useState('');
  const [isSmallViewport, setIsSmallViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsSmallViewport(window.innerWidth < 768);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const applySyncedRecord = (action, record) => {
      setAttendanceHistory(previous => {
        if (action === 'clock-out') {
          return previous.map(item => item.id === record.id || (item.employeeId === record.employeeId && !item.timeOut && item.date === record.date) ? record : item);
        }
        return [record, ...previous];
      });
    };

    // Only sync while someone is signed in, and only their own queued records, so a
    // queued Time Out is never rejected (and dropped) for lack of a session or sent
    // under another person's account.
    if (!authToken || (!user?.employeeId && !user?.email)) return undefined;
    const owner = { employeeId: user.employeeId, email: user.email };
    const syncOfflineAttendance = () => {
      syncQueuedAttendance(applySyncedRecord, owner).catch(error => {
        console.warn('Offline attendance sync unavailable:', error);
      });
    };

    window.addEventListener('online', syncOfflineAttendance);
    syncOfflineAttendance();
    const syncId = window.setInterval(syncOfflineAttendance, 15000);
    return () => {
      window.removeEventListener('online', syncOfflineAttendance);
      window.clearInterval(syncId);
    };
  }, [authToken, user?.employeeId, user?.email]);

  useEffect(() => {
    if (!profileToast) return;

    const timeoutId = window.setTimeout(() => {
      setProfileToast('');
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [profileToast]);

  // Load persistent database dataset from Real Express Server on launch
  useEffect(() => {
    if (!authToken || !activeRole) {
      setLoading(false);
      return undefined;
    }

    let isCurrentSession = true;
    apiFetch('/api/state')
      .then(res => {
        if (!res.ok) throw new Error('API server unreachable');
        return res.json();
      })
      .then(data => {
        if (isCurrentSession && data) {
          if (data.user) setUser(data.user);
          if (data.attendanceHistory) {
            setAttendanceHistory(data.attendanceHistory);
            loadedAttendanceMonthsRef.current = new Set();
            setLoadedAttendanceMonths([]);
          }
          if (data.requests) setRequests(data.requests);
          if (data.events) setEvents(data.events);
          if (data.announcements) setAnnouncements(data.announcements);
          if (data.notifications) {
            setNotifications(data.notifications);
            // HR's bell shows the saved notifications addressed to HR, not only ones from this session.
            if (activeRole === 'hr_admin') setAdminNotifications(scopeNotificationsToAccount(data.notifications, 'hr_admin', data.user));
          }
          if (data.smsAlerts) setSmsAlerts(data.smsAlerts);
          setSmsConfigured(typeof data.smsConfigured === 'boolean' ? data.smsConfigured : undefined);
          if (data.adminNotifications) setAdminNotifications(data.adminNotifications);
          if (data.adminSmsAlerts) setAdminSmsAlerts(data.adminSmsAlerts);
          if (data.acknowledged) setAcknowledgedAnnouncements(data.acknowledged);
          setActiveEmployeeCount(Number.isFinite(data.activeEmployeeCount) ? data.activeEmployeeCount : null);
        }
        if (isCurrentSession) setLoading(false);
      })
      .catch(err => {
        if (isCurrentSession) {
          console.error('Failed to load backend state:', err);
          setLoading(false);
        }
      });

    apiFetch('/api/requests')
      .then(res => {
        if (!res.ok) throw new Error('Requests API unavailable');
        return res.json();
      })
      .then(data => {
        if (!isCurrentSession) return;
        if (Array.isArray(data)) {
          setRequests(data);
        } else if (Array.isArray(data?.requests)) {
          setRequests(data.requests);
        }
      })
      .catch(err => {
        if (isCurrentSession) console.error('Failed to load request history:', err);
      });

    if (activeRole === 'hr_admin') {
      apiFetch('/api/employees')
        .then(async response => {
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data?.error || `Employee records request failed (HTTP ${response.status}).`);
          }
          return data;
        })
        .then(data => {
          if (isCurrentSession) setEmployees(Array.isArray(data?.users) ? data.users : []);
        })
        .catch(err => {
          if (isCurrentSession) console.error('Failed to load registered employees:', err);
        });
    } else {
      setEmployees([]);
    }

    return () => {
      isCurrentSession = false;
    };
  }, [authToken, activeRole]);

  // Every 15 seconds while the app is on screen, and right away when the person comes back
  // to it, the app asks the server which lists changed and downloads only those. New
  // announcements, events, notifications, requests (and the leave credits a decision
  // changes), and, for HR, Time Ins and Time Outs show up within seconds without a refresh.
  const userRef = useRef(user);
  userRef.current = user;
  useEffect(() => {
    if (!authToken || !activeRole) return undefined;

    let isCurrentSession = true;
    let checking = false;
    let lastStamps = null;
    const readJson = path => apiFetch(path).then(res => {
      if (!res.ok) throw new Error(`${path} returned HTTP ${res.status}`);
      return res.json();
    });
    const reloaders = {
      announcements: async () => {
        const list = await readJson('/api/announcements');
        if (isCurrentSession && Array.isArray(list)) setAnnouncements(list);
      },
      events: async () => {
        const list = await readJson('/api/events');
        if (isCurrentSession && Array.isArray(list)) setEvents(list);
      },
      notifications: async () => {
        const list = await readJson('/api/notifications');
        if (!isCurrentSession || !Array.isArray(list)) return;
        if (activeRole === 'hr_admin') {
          setAdminNotifications(scopeNotificationsToAccount(list, 'hr_admin', userRef.current));
        } else {
          setNotifications(list);
        }
      },
      requests: async () => {
        const [list, profile] = await Promise.all([
          readJson('/api/requests'),
          activeRole === 'employee' ? readJson('/api/profile') : null
        ]);
        if (!isCurrentSession) return;
        if (Array.isArray(list)) setRequests(list);
        if (profile?.user) setUser(profile.user);
      },
      attendance: async () => {
        const list = await readJson('/api/dtr/logs');
        if (!isCurrentSession || !Array.isArray(list)) return;
        setAttendanceHistory(previous => (activeRole === 'hr_admin'
          ? mergeRecentAttendance(previous, list, loadedAttendanceMonthsRef.current, attendanceWindowStart())
          : list));
      },
      // HR only: texts sent at Time In or Time Out, failed texts, and replies.
      sms: async () => {
        const list = await readJson('/api/sms');
        if (isCurrentSession && Array.isArray(list)) setSmsAlerts(list);
      }
    };

    const checkForUpdates = async () => {
      if (checking || document.hidden) return;
      checking = true;
      try {
        const { stamps } = await readJson('/api/updates');
        if (!isCurrentSession || !stamps) return;
        // The first answer is the starting point: the lists were just loaded with the app.
        const previous = lastStamps;
        const changed = previous
          ? Object.keys(reloaders).filter(key => stamps[key] !== undefined && stamps[key] !== previous[key])
          : [];
        const reloaded = await Promise.all(changed.map(key => reloaders[key]().then(() => true, error => {
          console.warn(`Unable to reload ${key}:`, error);
          return false;
        })));
        // A list that failed to reload keeps its old fingerprint, so it is tried again.
        lastStamps = { ...stamps };
        changed.forEach((key, index) => { if (!reloaded[index]) lastStamps[key] = previous[key]; });
      } catch (error) {
        console.warn('Unable to check for updates:', error);
      } finally {
        checking = false;
      }
    };

    void checkForUpdates();
    const checkId = window.setInterval(checkForUpdates, 15000);
    document.addEventListener('visibilitychange', checkForUpdates);
    return () => {
      isCurrentSession = false;
      window.clearInterval(checkId);
      document.removeEventListener('visibilitychange', checkForUpdates);
    };
  }, [authToken, activeRole]);

  // While an employee's shift is open, their position is sent right away, every minute,
  // and whenever they come back to the app, from any page, so HR's Live GPS Map shows
  // where they are now. Browsers do not share location while the app is closed.
  const latestOwnRecord = activeRole === 'employee' && user
    ? attendanceHistory.find(record => matchesAttendanceEmployee(record, user))
    : null;
  const openShiftId = latestOwnRecord?.timeIn && !latestOwnRecord.timeOut
    ? latestOwnRecord.id || `${latestOwnRecord.date}-${latestOwnRecord.timeIn}`
    : null;
  useEffect(() => {
    if (!openShiftId || !navigator.geolocation) return undefined;

    let stopped = false;
    const sendPosition = () => {
      if (stopped || document.hidden) return;
      navigator.geolocation.getCurrentPosition(position => {
        // A laptop or desktop browser only estimates its location from the internet
        // connection (often kilometres off), so only phone-grade fixes are sent.
        if (stopped || !(position.coords.accuracy <= MAX_TRACKING_ACCURACY_METERS)) return;
        apiFetch('/api/dtr/action?action=location-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude: Number(position.coords.latitude.toFixed(6)),
            longitude: Number(position.coords.longitude.toFixed(6)),
            accuracy: position.coords.accuracy || 0
          })
        })
          .then(response => {
            // The server has no open shift for this employee any more.
            if (response.status === 404) stopped = true;
          })
          .catch(error => console.warn('Location tracking error:', error));
      }, () => {}, { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 });
    };

    sendPosition();
    const trackingId = window.setInterval(sendPosition, 60000);
    document.addEventListener('visibilitychange', sendPosition);
    return () => {
      stopped = true;
      window.clearInterval(trackingId);
      document.removeEventListener('visibilitychange', sendPosition);
    };
  }, [openShiftId]);

  const normalizeRole = (role) => role?.toString().trim().toLowerCase() || 'employee';

  const roleAllowedViews = {
    employee: ['dashboard', 'attendance', 'requests', 'announcements', 'documents', 'office_directory', 'calendar', 'profile', 'settings', 'help'],
    supervisor: ['supervisor', 'announcements', 'calendar', 'profile', 'notifications'],
    hr_admin: ['hr_dashboard', 'hr_dtr', 'dtr_records', 'attendance_history', 'hr_employees', 'hr_leave_records', 'hr_records', 'hr_announcements', 'hr_directory', 'calendar', 'hr_profile', 'notifications', 'sms_log']
  };
  // Shared links (such as the profile picture in the header) open HR's own version.
  const roleViewAliases = {
    hr_admin: { dashboard: 'hr_dashboard', profile: 'hr_profile', announcements: 'hr_announcements' }
  };

  const handleViewChange = (view) => {
    const normalizedRole = normalizeRole(activeRole);
    const allowedViews = roleAllowedViews[normalizedRole] || roleAllowedViews.employee;
    const targetView = roleViewAliases[normalizedRole]?.[view] || view;
    setViewVisit(visit => visit + 1);
    if (allowedViews.includes(targetView)) {
      setCurrentView(targetView);
      return;
    }
    if (normalizedRole === 'hr_admin') {
      setCurrentView('hr_dashboard');
    } else if (normalizedRole === 'supervisor') {
      setCurrentView('supervisor');
    } else {
      setCurrentView('dashboard');
    }
  };

  const homeViewFor = role => (role === 'supervisor' ? 'supervisor' : role === 'hr_admin' ? 'hr_dashboard' : 'dashboard');

  // `remember` keeps the session after the browser is closed ("Remember me"); the WorkMate
  // phone app always does.
  const handleLogin = (roleType, profile, token, { remember = false } = {}) => {
    const normalizedRole = normalizeRole(roleType);
    if (isEmployeeMobileApp && normalizedRole !== 'employee') {
      return;
    }
    setActiveRole(normalizedRole);
    setUser(profile);
    if (token) {
      storeSessionToken(token, isEmployeeMobileApp || remember);
      setAuthToken(token);
    }

    // Sync login profile back to modern backend server
    apiFetch('/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile)
    });

    setCurrentView(homeViewFor(normalizedRole));
  };

  // After a refresh or reopening the app, a session that is still valid (sessions last 8
  // hours) signs the person back in instead of showing the login page.
  const [restoringSession, setRestoringSession] = useState(() => Boolean(authToken));
  useEffect(() => {
    if (!authToken) {
      setRestoringSession(false);
      return undefined;
    }
    let cancelled = false;
    apiFetch('/api/profile')
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.user) throw new Error('The saved session has ended.');
        const role = normalizeRole(data.user.accessLevel);
        if (isEmployeeMobileApp && role !== 'employee') throw new Error('Only employee accounts can use the mobile app.');
        if (cancelled) return;
        setUser(data.user);
        setActiveRole(role);
        setCurrentView(homeViewFor(role));
      })
      .catch(() => {
        if (cancelled) return;
        clearSessionToken();
        setAuthToken('');
      })
      .finally(() => {
        if (!cancelled) setRestoringSession(false);
      });
    return () => {
      cancelled = true;
    };
    // Only once, when the app opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clears the signed-in user's data so the next person on a shared device never sees it.
  const clearSessionData = () => {
    setAuthToken('');
    setActiveRole(null);
    setUser(null);
    setAttendanceHistory([]);
    setRequests([]);
    setEvents([]);
    setAnnouncements([]);
    setNotifications([]);
    setSmsAlerts([]);
    setSmsConfigured(undefined);
    setAdminNotifications([]);
    setAdminSmsAlerts([]);
    setEmployees([]);
    setAcknowledgedAnnouncements([]);
    setViewFocus(null);
    setCurrentView('dashboard');
    setSidebarOpen(false);
  };

  const handleLogout = () => {
    clearSessionToken();
    clearSessionData();
  };

  useEffect(() => {
    const handleExpiredSession = () => {
      clearSessionData();
    };
    window.addEventListener('dilg:auth-expired', handleExpiredSession);
    return () => window.removeEventListener('dilg:auth-expired', handleExpiredSession);
  }, []);

  const pushSystemNotification = (notification, { admin = false, employee = false } = {}) => {
    const payload = {
      title: notification.title || 'System Update',
      message: notification.message || '',
      time: notification.time || 'Just now',
      type: notification.type || 'system',
      recipientRole: notification.recipientRole || (admin ? 'hr_admin' : ''),
      employeeId: notification.employeeId || (employee && activeRole !== 'hr_admin' && activeRole !== 'supervisor' ? user?.employeeId || '' : ''),
      employeeEmail: notification.employeeEmail || (employee && activeRole !== 'hr_admin' && activeRole !== 'supervisor' ? user?.email || '' : ''),
      // A button on the notification that opens what it is about.
      ...(notification.action ? { action: notification.action, targetId: notification.targetId } : {})
    };

    return fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(data => {
        if (!data.success || !data.notification) return null;

        if (admin) {
          setAdminNotifications(prev => [data.notification, ...prev]);
        }
        if (employee) {
          setNotifications(prev => [data.notification, ...prev]);
        }

        if (activeRole === 'hr_admin' && !admin && !notification.recipientRole) {
          setAdminNotifications(prev => [data.notification, ...prev]);
        }
        if (activeRole !== 'hr_admin' && !employee && !notification.recipientRole) {
          setNotifications(prev => [data.notification, ...prev]);
        }

        return data.notification;
      });
  };

  const handleAdminNotification = (notification) => {
    return pushSystemNotification(notification, { admin: true, employee: false });
  };

  const handleSubmitBiometricEnrollment = async enrollment => {
    if (!enrollment?.selfieImage?.startsWith('data:image/')
      || !enrollment?.dilgIdImage?.startsWith('data:image/')
      || !enrollment?.dilgIdBackImage?.startsWith('data:image/')) {
      throw new Error('Upload the front and back of your government ID and capture an enrollment selfie before submitting.');
    }
    const response = await apiFetch('/api/face-enrollment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enrollment)
    });
    const data = await parseApiResponse(response, 'Biometric enrollment');
    if (!response.ok || !data.success) throw new Error(data?.error || 'Biometric enrollment submission failed.');
    setUser(previous => ({ ...previous, ...data.enrollment }));
    if (data.notificationWarning) console.error(data.notificationWarning);
    return data;
  };

  const handleRefreshBiometricStatus = useCallback(async () => {
    const response = await apiFetch('/api/face-enrollment?action=status', { cache: 'no-store' });
    const data = await parseApiResponse(response, 'Biometric enrollment status');
    if (!response.ok || !data.success) {
      throw new Error(data?.error || 'Unable to refresh biometric enrollment status.');
    }
    setUser(previous => ({ ...previous, ...data.enrollment }));
    return data.enrollment;
  }, []);

  const handleSendSms = async ({ recipient, message, employeeId = '', employeeEmail = '' }) => {
    const response = await fetch('/api/sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient,
        message,
        employeeId,
        employeeEmail,
        timestamp: new Date().toLocaleString('en-US'),
        status: 'Sent'
      })
    });
    const data = await response.json();
    if (!response.ok || !data.success || !data.sms) {
      throw new Error(data?.error || 'Unable to send SMS reply.');
    }
    setSmsAlerts(previous => [data.sms, ...previous]);
    return data.sms;
  };

  // A Time Out saved offline keeps the time it was made; online ones use the server clock.
  const markRecordedOffline = payload => ({ ...payload, record: { ...payload.record, recordedOfflineAt: new Date().toISOString() } });

  const submitAttendance = async (payload, optimisticRecord) => {
    if (!navigator.onLine) {
      if (payload.action === 'clock-in') {
        throw new Error('An internet connection is required to verify your fingerprint and submit Time In. Reconnect and try again.');
      }
      await queueAttendance({ payload: markRecordedOffline(payload) });
      if (optimisticRecord) {
        setAttendanceHistory(previous => payload.action === 'clock-out'
          ? previous.map(item => item.employeeId === optimisticRecord.employeeId && !item.timeOut ? optimisticRecord : item)
          : [optimisticRecord, ...previous]);
      }
      return { queued: true, record: optimisticRecord };
    }

    try {
      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        const error = new Error(data?.error || 'Unable to save attendance.');
        error.isAttendanceValidationError = response.status >= 400 && response.status < 500;
        throw error;
      }
      return data;
    } catch (error) {
      if (error?.isAttendanceValidationError) {
        throw error;
      }
      if (payload.action === 'clock-in') throw error;
      await queueAttendance({ payload: markRecordedOffline(payload) });
      if (optimisticRecord) {
        setAttendanceHistory(previous => payload.action === 'clock-out'
          ? previous.map(item => item.employeeId === optimisticRecord.employeeId && !item.timeOut ? optimisticRecord : item)
          : [optimisticRecord, ...previous]);
      }
      return { queued: true, record: optimisticRecord, error };
    }
  };

  const getCurrentCoordinates = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('GPS is not available in this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        latitude: Number(position.coords.latitude.toFixed(6)),
        longitude: Number(position.coords.longitude.toFixed(6)),
        gpsAccuracy: Number(position.coords.accuracy || 0)
      }),
      error => reject(error),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });

  const handleToggleSidebar = () => {
    setSidebarOpen((prev) => !prev);
  };

  // Returns true once the server has saved the profile.
  const handleUpdateUser = async (updated) => {
    const mergedUser = {
      ...user,
      ...updated
    };

    setUser(mergedUser);

    try {
      const response = await fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...mergedUser,
          lookupEmail: user?.email || mergedUser.email
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.user) {
        throw new Error(data?.error || 'MongoDB save failed.');
      }
      setUser(data.user);
      return true;
    } catch (error) {
      console.error('User update failed:', error);
      setUser(user);
      window.alert(`Unable to save changes to MongoDB: ${error.message}`);
      return false;
    }
  };

  // Clock in handle
  const handleTimeIn = (
    municipality,
    barangay,
    task,
    gpsStatus,
    lat,
    lon,
    selfieUrl,
    fingerprintVerified,
    fingerprintProof,
    employeeName,
    employeeRole,
    employeeOffice,
    employeeId,
    assignedLatitude,
    assignedLongitude,
    distanceToAssignment,
    assignmentMatch,
    employeeEmail,
    assignmentSite = null,
    gpsAccuracy = null
  ) => {
    const today = getManilaDateString();
    const timeString = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const newRecord = {
      date: today,
      timeIn: timeString,
      timeOut: null,
      location: municipality,
      dutyType: assignmentSite?.mode || 'field',
      gpsStatus,
      latitude: lat,
      longitude: lon,
      gpsAccuracy: Number(gpsAccuracy),
      assignedLatitude: assignedLatitude || null,
      assignedLongitude: assignedLongitude || null,
      distanceToAssignmentMeters: distanceToAssignment,
      assignmentMatch: assignmentMatch ?? false,
      assignmentSite,
      selfieLatitude: lat,
      selfieLongitude: lon,
      status: 'Present',
      workAssignment: {
        assignmentRole: assignmentSite?.mode || 'field',
        location: assignmentSite?.mode === 'office'
          ? assignmentSite?.officeId || municipality
          : assignmentSite?.mode === 'wfh'
            ? [assignmentSite?.street, assignmentSite?.landmark, assignmentSite?.barangay, assignmentSite?.municipality].filter(Boolean).join(', ')
            : municipality,
        municipality: assignmentSite?.municipality || municipality || '',
        barangayLgu: assignmentSite?.barangay || barangay || '',
        officeId: assignmentSite?.officeId || '',
        street: assignmentSite?.street || '',
        landmark: assignmentSite?.landmark || '',
        task
      },
      selfieUrl,
      fingerprintVerified,
      fingerprintProof,
      fingerprintHash: user?.fingerprintHash || '',
      faceVerified: false,
      faceMatchConfidence: 0,
      faceVerificationProvider: 'ordinary-selfie-no-liveness',
      faceVerifiedAt: null,
      faceLivenessVerified: false,
      faceLivenessConfidence: 0,
      faceLivenessProvider: 'not-used',
      deviceId: '',
      employeeName: user?.name || employeeName || 'Employee',
      employeeRole: user?.role || employeeRole || 'Employee',
      employeeOffice: user?.office || employeeOffice || 'Office',
      employeeId: user?.employeeId || user?.email || employeeId || null,
      employeeEmail: user?.email || employeeEmail || null
    };

    submitAttendance({ action: 'clock-in', record: newRecord }, { ...newRecord, id: `offline-att-${Date.now()}` })
      .then((data) => {
        if (data.record) {
          if (!data.queued) setAttendanceHistory(prev => [data.record, ...prev]);
          if (data.queued) {
            window.alert('No connection. Attendance saved offline and will sync automatically when internet returns.');
          }

          // Create system notification
          const newNotif = {
            title: 'Clock-In Success',
            message: `Time In registered at ${data.record.timeIn || timeString} at ${municipality}.`,
            time: 'Just now',
            type: 'attendance',
            employeeId: user?.employeeId || '',
            employeeEmail: user?.email || ''
          };
          fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newNotif)
          })
            .then(res => res.json())
            .then(notifData => {
              if (notifData.success) {
                setNotifications(prev => [notifData.notification, ...prev]);
              }
            });

          // The server sends the SMS confirmation and returns it when one was sent.
          if (data.sms) setSmsAlerts(prev => [data.sms, ...prev]);
        }
      })
      .catch(error => {
        window.alert(`Unable to record Time In: ${error.message}`);
      });
  };

  // Clock out handle
  const handleTimeOut = async (providedGps = {}) => {
    const timeString = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    let gps = providedGps;
    if (!gps.latitude || !gps.longitude) {
      try {
        gps = await getCurrentCoordinates();
      } catch (error) {
        console.warn('Clock-out GPS capture unavailable:', error);
      }
    }

    const today = getManilaDateString();
    const employeeId = user?.employeeId?.toString().toLowerCase();
    const employeeEmail = user?.email?.toString().toLowerCase();
    const activeRecord = attendanceHistory.find(record => (
      record.date === today
      && !record.timeOut
      && (
        (employeeId && record.employeeId?.toString().toLowerCase() === employeeId)
        || (employeeEmail && record.employeeEmail?.toString().toLowerCase() === employeeEmail)
      )
    ));
    const clockOutRecord = {
      date: getManilaDateString(),
      timeOut: timeString,
      employeeId: user?.employeeId || user?.email,
      employeeEmail: user?.email || null,
      timeOutLatitude: gps.latitude || null,
      timeOutLongitude: gps.longitude || null,
      timeOutGpsAccuracy: gps.gpsAccuracy || null,
      selfieUrl: activeRecord?.selfieUrl || null
    };

    submitAttendance({ action: 'clock-out', record: clockOutRecord }, {
      ...activeRecord,
      ...clockOutRecord,
      id: activeRecord?.id || `offline-att-${Date.now()}`
    }).then(data => {
        if (data.record) {
          if (!data.queued) {
            setAttendanceHistory(prev => prev.map(record => record.id === data.record.id || (record.employeeId === data.record.employeeId && !record.timeOut && record.date === data.record.date) ? data.record : record));
          }
          if (data.queued) window.alert('No connection. Time Out saved offline and will sync automatically when internet returns.');

          // Create notification
          const newNotif = {
            title: 'Clock-Out Recorded',
            message: `Clock Out registered at ${data.record.timeOut || timeString}. Have a safe commute home.`,
            time: 'Just now',
            type: 'attendance',
            employeeId: user?.employeeId || '',
            employeeEmail: user?.email || ''
          };

          fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newNotif)
          })
            .then(res => res.json())
            .then(notifData => {
              if (notifData.success) {
                setNotifications(prev => [notifData.notification, ...prev]);
              }
            });

          // The server sends the SMS confirmation and returns it when one was sent.
          if (data.sms) setSmsAlerts(prev => [data.sms, ...prev]);
        }
      })
      .catch(error => {
        window.alert(`Unable to record Time Out: ${error.message}`);
      });
  };

  // Submit request
  const handleSubmitRequest = (
    type,
    startDate,
    endDate,
    purpose,
    extraFields
  ) => {
    const today = getManilaDateString();
    const initialStatus = extraFields?.status || 'Pending';

    const newReqInput = {
      type,
      submissionDate: today,
      startDate,
      endDate,
      purpose,
      status: initialStatus,
      employeeId: user?.employeeId || user?.email || '',
      employeeEmail: user?.email || '',
      employeePhoneNumber: user?.phoneNumber || '',
      employeeName: user?.name || '',
      employeeSignature: user?.name || '',
      employeeSignedAt: today,
      remarks: initialStatus === 'Draft' 
        ? 'Draft request saved. Not yet submitted for reviews.'
        : 'Awaiting initial HR administrative processing and review.',
      statusHistory: [{
        status: initialStatus,
        date: today,
        actor: user?.name || 'Employee'
      }],
      ...extraFields
    };

    fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newReqInput)
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok || !data.success || !data.request) {
          throw new Error(data?.error || 'Unable to save request to MongoDB.');
        }
        return data;
      })
      .then(data => {
        if (data.request) {
          setRequests(prev => [data.request, ...prev]);

          // Create system notification only for real submissions
          if (initialStatus !== 'Draft') {
            const newNotif = {
              title: 'Personnel Request Logged',
              message: `Your new '${type}' was received. Reference ID: ${data.request.id}.`,
              time: 'Just now',
              type: 'request'
            };
            pushSystemNotification(newNotif, { admin: true, employee: true });
          }
        }
      })
      .catch(error => {
        console.error('Request API error:', error);
        window.alert(`Request save failed: ${error.message}`);
      });
  };

  const handleRequestCertifiedCopy = (recordDetails) => {
    const today = getManilaDateString();
    const request = {
      type: 'Certified Copy Request',
      submissionDate: today,
      startDate: today,
      endDate: today,
      purpose: 'Request for certified copy of service record',
      status: 'Pending',
      remarks: 'Awaiting HR review and certification.',
      employeeId: user?.employeeId || '',
      employeeEmail: user?.email || '',
      employeePhoneNumber: user?.phoneNumber || '',
      employeeName: user?.name || '',
      recordDetails
    };

    return fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok || !data.success || !data.request) {
        throw new Error(data?.error || 'Unable to save certified copy request.');
      }
      setRequests(prev => [data.request, ...prev]);
      return data.request;
    });
  };

  // Simulated Admin reviewer
  const handleUpdateRequestStatus = async (
    id,
    statusOrPayload,
    approverParam,
    remarksParam
  ) => {
    let bodyPayload = {};
    let status = '';
    let approver = '';
    let remarks = '';

    if (typeof statusOrPayload === 'object' && statusOrPayload !== null) {
      bodyPayload = statusOrPayload;
      status = statusOrPayload.status || 'Pending';
      approver = statusOrPayload.approver || 'Approver';
      remarks = statusOrPayload.remarks || '';
    } else {
      status = statusOrPayload;
      approver = approverParam;
      remarks = remarksParam;
      bodyPayload = { status, approver, remarks };
    }

    const existingRequest = requests.find(req => req.id === id);
    const currentHistory = Array.isArray(existingRequest?.statusHistory) ? existingRequest.statusHistory : [];
    const nextHistory = [...currentHistory, {
      status,
      date: getManilaDateString(),
      actor: approver || (user?.name || 'System')
    }];
    bodyPayload = {
      ...bodyPayload,
      statusHistory: nextHistory
    };

    const response = await apiFetch(`/api/requests/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload)
    });
    const data = await response.json();
    if (!response.ok || !data.success || !data.request) {
      throw new Error(data.error || 'Unable to save request status.');
    }

    setRequests(prev => prev.map(req => req.id === id ? data.request : req));

    const label = data.request.type;

    const newNotif = {
      title: `${label} ${status}`,
      message: `Ref ${id} is marked as ${status} by ${approver}. Remarks: ${remarks}`,
      time: 'Just now',
      type: 'request',
      employeeId: data.request.employeeId || '',
      employeeEmail: data.request.employeeEmail || ''
    };
    if (status === 'For Supervisor') {
      pushSystemNotification({
        title: 'Request Ready for Review',
        message: `${label} ${id} was validated by HR/Admin and is ready for your review.`,
        time: 'Just now',
        type: 'request',
        recipientRole: 'supervisor',
        action: 'review_request',
        targetId: id
      });
    } else {
      pushSystemNotification(newNotif, { admin: false, employee: true });
    }
    // HR follows each request to the end, so it hears about the supervisor's decision too.
    if (activeRole === 'supervisor' && ['Approved', 'Rejected'].includes(status)) {
      pushSystemNotification({
        title: `${label} ${status === 'Approved' ? 'Approved' : 'Disapproved'} by Supervisor`,
        message: `${data.request.employeeName || 'An employee'}'s ${label} ${id} was ${status === 'Approved' ? 'approved' : 'disapproved'} by ${user?.name || 'the supervisor'}. Remarks: ${remarks || 'none'}`,
        time: 'Just now',
        type: 'request',
        recipientRole: 'hr_admin'
      }).catch(error => console.error('Unable to notify HR about the supervisor decision:', error));
    }

    const timeString = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    const formatSmsTime = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }) + ' ' + timeString;
    const requestEmployee = employees.find(employee => matchesAttendanceEmployee(data.request, employee));

    const newSms = {
      recipient: data.request.employeePhoneNumber || data.request.phoneNumber || requestEmployee?.phoneNumber || '',
      employeeId: data.request.employeeId || '',
      employeeEmail: data.request.employeeEmail || '',
      message: `[DILG WorkMate] ALERT: Your ${label} (${id}) has been ${status.toUpperCase()} by ${approver}. Notes: ${remarks}`,
      timestamp: formatSmsTime
    };

    apiFetch('/api/sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSms)
    })
      .then(res => res.json())
      .then(smsData => {
        if (smsData.success) setSmsAlerts(prev => [smsData.sms, ...prev]);
      })
      .catch(error => console.error('Failed to send request status SMS:', error));

    return data.request;
  };

  // HR announcements and calendar events. Each handler throws with the server's message
  // on failure so the HR screen can show it. The server notifies employees of new ones.
  const sendBulletinChange = async (path, method, body) => {
    const response = await apiFetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save. Please try again.');
    return data;
  };

  const handleAddEvent = async fields => {
    const { event } = await sendBulletinChange('/api/events', 'POST', fields);
    setEvents(previous => [...previous, event]);
    return event;
  };

  const handleCreateAnnouncement = async fields => {
    const { announcement } = await sendBulletinChange('/api/announcements', 'POST', fields);
    setAnnouncements(previous => [announcement, ...previous]);
    return announcement;
  };

  const handleUpdateAnnouncement = async (id, fields) => {
    const { announcement } = await sendBulletinChange(`/api/announcements/${encodeURIComponent(id)}`, 'PATCH', fields);
    setAnnouncements(previous => previous.map(item => item.id === id ? announcement : item));
    return announcement;
  };

  const handleDeleteAnnouncement = async id => {
    await sendBulletinChange(`/api/announcements/${encodeURIComponent(id)}`, 'DELETE');
    setAnnouncements(previous => previous.filter(item => item.id !== id));
  };

  const handleUpdateEvent = async (id, fields) => {
    const { event } = await sendBulletinChange(`/api/events/${encodeURIComponent(id)}`, 'PATCH', fields);
    setEvents(previous => previous.map(item => item.id === id ? event : item));
    return event;
  };

  const handleDeleteEvent = async id => {
    await sendBulletinChange(`/api/events/${encodeURIComponent(id)}`, 'DELETE');
    setEvents(previous => previous.filter(item => item.id !== id));
  };

  // Acknowledge announcement
  const handleAcknowledgeAnnouncement = (id) => {
    fetch('/api/announcements/acknowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setAcknowledgedAnnouncements(data.acknowledged);

          const currentAnn = announcements.find(a => a.id === id);
          const label = currentAnn ? currentAnn.title : 'Bulletin';

          const newNotif = {
            title: 'Bulletin Acknowledged',
            message: `Read receipt recorded for: ${label}`,
            time: 'Just now',
            type: 'announcement',
            // Addressed to the reader, so it is not sent to every employee.
            employeeId: user?.employeeId || '',
            employeeEmail: user?.email || ''
          };
          fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newNotif)
          })
            .then(res => res.json())
            .then(notifData => {
              if (notifData.success) {
                setNotifications(prev => [notifData.notification, ...prev]);
              }
            });
        }
      });
  };

  // Notifications togglers
  const handleMarkNotificationRead = (id) => {
    fetch(`/api/notifications/${id}/read`, {
      method: 'POST'
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          if (activeRole === 'hr_admin') {
            setAdminNotifications(scopeNotificationsToAccount(data.notifications, 'hr_admin', user));
          } else {
            setNotifications(scopeNotificationsToAccount(data.notifications, activeRole, user));
          }
        }
      });
  };

  // A notification's button: marks it read and opens the employee's profile (accounts,
  // password resets, enrollments) or the request it is about.
  const handleNotificationAction = (notification, target) => {
    if (!notification.read) handleMarkNotificationRead(notification.id);
    const isRequest = target.action === 'review_request';
    // handleViewChange counts this as the next visit; the focus is for that visit only.
    setViewFocus({ visit: viewVisit + 1, ...(isRequest ? { requestId: target.targetId } : { employeeId: target.targetId }) });
    handleViewChange(isRequest ? (activeRole === 'supervisor' ? 'supervisor' : 'hr_leave_records') : 'hr_employees');
  };

  // Hides every current notification; only newer ones appear afterwards.
  const handleDismissNotifications = () => {
    fetch('/api/notifications/dismiss', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (!data.success) return;
        if (activeRole === 'hr_admin') {
          setAdminNotifications(scopeNotificationsToAccount(data.notifications, 'hr_admin', user));
        } else {
          setNotifications(scopeNotificationsToAccount(data.notifications, activeRole, user));
        }
      });
  };

  const handleClearNotifications = () => {
    fetch('/api/notifications/clear', {
      method: 'POST'
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          if (activeRole === 'hr_admin') {
            setAdminNotifications(scopeNotificationsToAccount(data.notifications, 'hr_admin', user));
          } else {
            setNotifications(scopeNotificationsToAccount(data.notifications, activeRole, user));
          }
        }
      });
  };

  // Loads one earlier month ("YYYY-MM") of attendance for HR and returns how many records
  // it has.
  const handleLoadAttendanceMonth = async month => {
    const response = await apiFetch(`/api/dtr/logs?month=${encodeURIComponent(month)}`);
    const list = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(list)) throw new Error(list?.error || 'Unable to load that month.');
    loadedAttendanceMonthsRef.current.add(month);
    setLoadedAttendanceMonths([...loadedAttendanceMonthsRef.current].sort().reverse());
    setAttendanceHistory(previous => mergeAttendanceMonth(previous, list));
    return list.length;
  };

  // Administration Updates
  // Sends only the changed attendance records ({ id, ...changedFields }) and merges the
  // saved records back, so records HR did not touch are never overwritten.
  const handleUpdateAllAttendance = async (attendanceUpdates) => {
    const response = await apiFetch('/api/attendance/history', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attendanceUpdates)
    });
    const data = await response.json();
    if (!response.ok || !data.success || !Array.isArray(data.attendanceHistory)) {
      throw new Error(data.error || 'Unable to save attendance changes.');
    }
    const savedById = new Map(data.attendanceHistory.map(record => [record.id, record]));
    setAttendanceHistory(previous => previous.map(record => savedById.get(record.id) || record));
    pushSystemNotification({
      title: 'DTR Records Updated',
      message: 'Attendance records were reviewed and corrected in the HR/Admin desk.',
      time: 'Just now',
      type: 'attendance'
    }, { admin: true, employee: false });
    return data.attendanceHistory;
  };

  // Sends review updates ({ id, ...reviewFields }) and merges the saved requests back.
  const handleUpdateAllRequests = async (requestUpdates) => {
    const response = await apiFetch('/api/requests', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestUpdates)
    });
    const data = await response.json();
    if (!response.ok || !data.success || !Array.isArray(data.requests)) {
      throw new Error(data.error || 'Unable to save request changes.');
    }
    const savedById = new Map(data.requests.map(request => [request.id, request]));
    setRequests(previous => previous.map(request => savedById.get(request.id)
      ? { ...request, ...savedById.get(request.id) }
      : request));
    return data.requests;
  };

  // Lets an employee edit, submit, or discard their own drafts, or withdraw their own
  // requests that have not been decided yet.
  const handleUpdateOwnRequest = async (id, fields) => {
    const response = await apiFetch(`/api/requests/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields)
    });
    const data = await response.json();
    if (!response.ok || !data.success || !data.request) {
      throw new Error(data.error || 'Unable to save the draft.');
    }
    setRequests(previous => previous.map(request => request.id === id ? { ...request, ...data.request } : request));
    if (data.request.status === 'Pending') {
      pushSystemNotification({
        title: 'Personnel Request Logged',
        message: `Your new '${data.request.type}' was received. Reference ID: ${data.request.id}.`,
        time: 'Just now',
        type: 'request'
      }, { admin: true, employee: true });
    }
    return data.request;
  };

  // Clear system history with hard reset
  const handleClearLocalHistories = () => {
    fetch('/api/reset', {
      method: 'POST'
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setActiveRole(null);
          window.location.reload();
        }
      });
  };

  if (showResetPage && !activeRole) {
    return (
      <Suspense fallback={<div className="p-6 text-center text-sm text-slate-600">Loading…</div>}>
        <PasswordResetView mode={resetToken ? 'apply' : 'request'} token={resetToken} onBackToLogin={() => { setShowResetPage(false); setResetToken(null); window.history.replaceState({}, '', window.location.pathname); }} />
      </Suspense>
    );
  }

  if (restoringSession && !activeRole) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-sm font-semibold text-slate-600">Signing you in…</div>;
  }

  if (!activeRole) {
    return (
      <Suspense fallback={<div className="p-6 text-center text-sm text-slate-600">Loading…</div>}>
        <LoginView mobileOnly={isEmployeeMobileApp} onLogin={handleLogin} onRequestPasswordReset={() => setShowResetPage(true)} />
      </Suspense>
    );
  }

  const headerNotifications = activeRole === 'hr_admin'
    ? adminNotifications
    : scopeNotificationsToAccount(notifications, activeRole, user);
  const headerSmsAlerts = ['hr_admin', 'supervisor'].includes(activeRole)
    ? smsAlerts
    : scopeMessagesToAccount(smsAlerts, activeRole, user);
  const visibleEmployeeRecords = activeRole === 'employee'
    ? attendanceHistory.filter(record => matchesAttendanceEmployee(record, user))
    : attendanceHistory;
  const visibleEmployeeRequests = activeRole === 'employee'
    ? requests.filter(request => (request.employeeId || request.employeeEmail || request.employeeName) && matchesAttendanceEmployee(request, user))
    : requests;
  const isWebOnlyRole = activeRole === 'supervisor' || activeRole === 'hr_admin';
  const focus = viewFocus?.visit === viewVisit ? viewFocus : null;

  if (isWebOnlyRole && isSmallViewport) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6 text-center">
        <div className="max-w-md rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0B4EA2] text-xl font-black text-white shadow-sm">
            WEB
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">Desktop mode only</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            This HR/Admin and Supervisor module is only available on the desktop web version.
            Please open it on a larger screen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-frame flex bg-[#f8fafc] text-slate-800 min-h-screen font-sans relative">
      {/* Subtle modern soft lighting background gradients */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-50/50 blur-[100px] rounded-full pointer-events-none z-0"></div>
      <div className="absolute bottom-[-10%] left-[10%] w-[400px] h-[400px] bg-slate-100/50 blur-[100px] rounded-full pointer-events-none z-0"></div>

      {/* Sidebar navigation deck */}
      <Sidebar
        currentView={currentView}
        onViewChange={(view) => {
          handleViewChange(view);
          setSidebarOpen(false);
        }}
        user={user}
        activeRole={activeRole}
        onLogout={handleLogout}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main viewport flow */}
      <div className="app-frame flex-1 flex flex-col h-screen relative z-10">
        {/* Persistent top-bar HUD */}
        <Header
          currentView={currentView}
          user={user}
          activeRole={activeRole}
          notifications={headerNotifications}
          smsAlerts={headerSmsAlerts}
          employees={employees}
          requests={requests}
          smsConfigured={smsConfigured}
          onMarkNotificationRead={handleMarkNotificationRead}
          onClearNotifications={handleClearNotifications}
          onDismissNotifications={handleDismissNotifications}
          onNotificationAction={handleNotificationAction}
          onSendSms={handleSendSms}
          onViewChange={handleViewChange}
          onToggleSidebar={handleToggleSidebar}
          onLogout={handleLogout}
        />

        {/* Selected Panels Layout rendering */}
        <main className="flex-1 overflow-y-auto flex flex-col relative w-full">
          <Suspense fallback={<div className="p-6 text-center text-sm text-slate-600">Loading page…</div>}>
          {currentView === 'dashboard' && (
            <DashboardView
              user={user}
              attendanceHistory={visibleEmployeeRecords}
              requests={visibleEmployeeRequests}
              announcements={announcements}
              events={events}
              onViewChange={handleViewChange}
              onQuickAction={handleViewChange}
            />
          )}

          {currentView === 'attendance' && (
            <AttendanceView
              user={user}
              attendanceHistory={visibleEmployeeRecords}
              onTimeIn={handleTimeIn}
              onTimeOut={handleTimeOut}
              onUpdateUser={handleUpdateUser}
            />
          )}

          {currentView === 'requests' && (
            <RequestsView
              user={user}
              activeRole={activeRole}
              requests={visibleEmployeeRequests}
              onSubmitRequest={handleSubmitRequest}
              onUpdateOwnRequest={handleUpdateOwnRequest}
            />
          )}

          {currentView === 'supervisor' && (
            <SupervisorView
              user={user}
              requests={requests}
              employees={employees}
              activeEmployeeCount={activeEmployeeCount}
              onUpdateRequestStatus={handleUpdateRequestStatus}
              focus={focus}
            />
          )}

          {currentView === 'notifications' && isWebOnlyRole && (
            <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
              <NotificationCenter
                variant="page"
                notifications={headerNotifications}
                context={{ role: activeRole, employees, requests }}
                onMarkRead={handleMarkNotificationRead}
                onMarkAllRead={handleClearNotifications}
                onClearAll={handleDismissNotifications}
                onAction={handleNotificationAction}
              />
            </div>
          )}

          {currentView === 'sms_log' && activeRole === 'hr_admin' && (
            <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
              <SmsCenter variant="page" smsAlerts={headerSmsAlerts} employees={employees} smsConfigured={smsConfigured} />
            </div>
          )}

          {['hr_dashboard', 'hr_dtr', 'dtr_records', 'attendance_history', 'hr_employees', 'hr_leave_records', 'hr_records', 'hr_announcements', 'hr_directory', 'hr_profile'].includes(currentView) && (
            <HRAdminView
              key={viewVisit}
              section={currentView}
              user={user}
              employees={employees}
              attendanceHistory={attendanceHistory}
              attendanceFrom={attendanceWindowStart()}
              loadedAttendanceMonths={loadedAttendanceMonths}
              onLoadAttendanceMonth={handleLoadAttendanceMonth}
              onUpdateAttendance={handleUpdateAllAttendance}
              requests={requests}
              onUpdateRequests={handleUpdateAllRequests}
              onUpdateRequestStatus={handleUpdateRequestStatus}
              onViewChange={handleViewChange}
              onEmployeesChange={setEmployees}
              onUpdateUser={handleUpdateUser}
              onAdminNotification={handleAdminNotification}
              announcements={announcements}
              events={events}
              onCreateAnnouncement={handleCreateAnnouncement}
              onUpdateAnnouncement={handleUpdateAnnouncement}
              onDeleteAnnouncement={handleDeleteAnnouncement}
              onCreateEvent={handleAddEvent}
              onUpdateEvent={handleUpdateEvent}
              onDeleteEvent={handleDeleteEvent}
              focus={focus}
            />
          )}

          {currentView === 'announcements' && (
            <AnnouncementsView
              announcements={announcements}
              acknowledgedIds={acknowledgedAnnouncements}
              onAcknowledge={handleAcknowledgeAnnouncement}
            />
          )}

          {currentView === 'documents' && (
            <DocumentsView
              user={user}
              requests={visibleEmployeeRequests}
              attendanceHistory={visibleEmployeeRecords}
            />
          )}
          {currentView === 'office_directory' && <OfficeDirectoryView />}

          {currentView === 'calendar' && (
            <CalendarView
              events={events}
              onAddEvent={activeRole === 'hr_admin' ? handleAddEvent : undefined}
            />
          )}

          {currentView === 'profile' && activeRole === 'supervisor' && (
            <div className="hr-admin-profile-screen">
              <HRAdminProfileView
                user={user}
                onUpdateUser={handleUpdateUser}
                onToast={setProfileToast}
                title="Supervisor Profile"
              />
            </div>
          )}

          {currentView === 'profile' && activeRole !== 'supervisor' && (
            <ProfileView
              user={user}
              onUpdateUser={handleUpdateUser}
              onSubmitEnrollment={handleSubmitBiometricEnrollment}
              onRefreshEnrollmentStatus={handleRefreshBiometricStatus}
            />
          )}

          {currentView === 'settings' && (
            <SettingsView
              smsNumber={user.phoneNumber}
              onUpdateSMSNumber={(num) => handleUpdateUser({ ...user, phoneNumber: num })}
              hasPassword={user.hasPassword !== false}
              onClearLocalHistories={handleClearLocalHistories}
            />
          )}

          {currentView === 'help' && (
            <HelpView />
          )}
          </Suspense>
        </main>
        <MobileBottomNav currentView={currentView} onViewChange={handleViewChange} activeRole={activeRole} />
      </div>

      {profileToast && (
        <div className="fixed bottom-5 right-5 z-[60] rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 shadow-lg">
          {profileToast}
        </div>
      )}
    </div>
  );
}
