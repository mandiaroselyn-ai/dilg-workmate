import { apiFetch } from './api';

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

export const syncQueuedAttendance = async (onRecord) => {
  const queuedItems = await readQueue();
  for (const item of queuedItems) {
    try {
      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload)
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        if (response.status >= 400 && response.status < 500) {
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
