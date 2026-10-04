import { apiFetch } from './api.js';

const fetch = apiFetch;

const DB_NAME = 'dilg-workmate-offline';
const STORE_NAME = 'attendance-queue';
const DB_VERSION = 1;

const openDatabase = () => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('IndexedDB is not available in this browser.'));
    return;
  }

  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('Unable to open offline attendance storage.'));
});

export const queueAttendance = async (payload) => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).add({
      ...payload,
      queuedAt: new Date().toISOString()
    });
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('Unable to queue offline attendance.'));
    };
  });
};

const readQueue = async () => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      database.close();
      resolve(request.result || []);
    };
    request.onerror = () => {
      database.close();
      reject(request.error || new Error('Unable to read offline attendance.'));
    };
  });
};

const removeQueuedAttendance = async (id) => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('Unable to remove synced attendance.'));
    };
  });
};

// A queued record is only discarded when the server rejects the record itself. Session
// problems (401/403) and temporary limits (408/429) keep it queued for a later retry.
const RETRYABLE_CLIENT_ERRORS = [401, 403, 408, 429];
export const shouldDiscardQueuedAttendance = status => status >= 400 && status < 500 && !RETRYABLE_CLIENT_ERRORS.includes(status);

const normalizeIdentity = value => value?.toString().trim().toLowerCase() || '';

// True when the queued record belongs to the signed-in employee.
export const isQueuedForOwner = (item, owner) => {
  const record = item?.payload?.record || {};
  const employeeId = normalizeIdentity(owner?.employeeId);
  const email = normalizeIdentity(owner?.email);
  return Boolean(
    (employeeId && normalizeIdentity(record.employeeId) === employeeId)
    || (email && normalizeIdentity(record.employeeEmail) === email)
  );
};

// How many of the signed-in employee's records are saved on this device, waiting to sync.
export const countQueuedAttendance = async owner => (await readQueue()).filter(item => isQueuedForOwner(item, owner)).length;

export const syncQueuedAttendance = async (onRecord, owner) => {
  const queuedItems = (await readQueue()).filter(item => isQueuedForOwner(item, owner));
  for (const item of queuedItems) {
    try {
      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload)
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        if (shouldDiscardQueuedAttendance(response.status)) {
          await removeQueuedAttendance(item.id);
          console.warn('Discarding invalid queued attendance record:', data?.error || response.statusText);
          continue;
        }
        break;
      }
      await removeQueuedAttendance(item.id);
      if (data.record) onRecord?.(item.payload.action, data.record);
    } catch (error) {
      break;
    }
  }
};
