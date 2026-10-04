// The WorkMate phone app keeps a copy of the signed-in employee's profile and recent
// attendance, so it can open without internet and still record attendance (sent when the
// phone is back online). The copy is removed when the employee signs out.
const SESSION_KEY = 'dilg_offline_session';
const MAX_RECORDS = 40;

// Pictures (saved as data: URLs) are left out to keep the copy small.
const withoutPictures = object => Object.fromEntries(Object.entries(object || {})
  .filter(([, value]) => !(typeof value === 'string' && value.startsWith('data:'))));

// A record as attendance lists hold it: without its selfie, GPS history, or area outline.
const listRecord = ({ selfieUrl, locationHistory, siteVisits, geofenceEvents, ...record }) => ({
  ...record,
  hasSelfie: Boolean(record.hasSelfie || selfieUrl),
  ...(record.assignmentSite ? { assignmentSite: { ...record.assignmentSite, geometry: undefined } } : {})
});

export const saveOfflineSession = (user, attendance = []) => {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({
      user: withoutPictures(user),
      attendance: attendance.slice(0, MAX_RECORDS).map(listRecord)
    }));
  } catch {
    // Without storage (or space), the app needs internet to open.
  }
};

// { user, attendance } saved last time, or null.
export const readOfflineSession = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SESSION_KEY) || 'null');
    return saved?.user && Array.isArray(saved.attendance) ? saved : null;
  } catch {
    return null;
  }
};

export const clearOfflineSession = () => {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to clear when storage is blocked.
  }
};
