import assert from 'node:assert/strict';
import test from 'node:test';

// The phone's storage, kept in memory.
const stored = new Map();
globalThis.window = {
  crypto: globalThis.crypto,
  localStorage: {
    getItem: key => (stored.has(key) ? stored.get(key) : null),
    setItem: (key, value) => stored.set(key, String(value)),
    removeItem: key => stored.delete(key)
  }
};
const { isNetworkError, readPhoneKey, rememberPhoneKey, rememberSiteLocation, resolveSiteOffline } = await import('./offlineTimeIn.js');
const { clearOfflineSession, readOfflineSession, saveOfflineSession } = await import('./offlineSession.js');

test('only a phone that verified the fingerprint online can sign a Time In offline', () => {
  assert.equal(readPhoneKey('DILG-2026-1001'), null);
  rememberPhoneKey('DILG-2026-1001', '0123456789abcdef0123456789abcdef');
  assert.equal(readPhoneKey('dilg-2026-1001'), '0123456789abcdef0123456789abcdef');
  assert.equal(readPhoneKey('DILG-2026-2002'), null);
});

test('without internet, the assignment area comes from the app or from the last time it was found', async () => {
  const field = await resolveSiteOffline({ mode: 'field', municipality: 'Boac', barangay: 'Pawa' });
  assert.equal(field.label, 'Brgy. Pawa, Boac, Marinduque, Philippines');
  assert.ok(field.geometry);

  const office = { mode: 'office', municipality: 'Boac', officeId: 'provincial' };
  assert.equal(await resolveSiteOffline(office), null);
  rememberSiteLocation(office, { mode: 'office', latitude: 13.44, longitude: 121.84, label: 'DILG Provincial Office' });
  assert.equal((await resolveSiteOffline(office)).label, 'DILG Provincial Office');
});

test('a failed connection is told apart from an error answer', () => {
  assert.equal(isNetworkError(new TypeError('Failed to fetch')), true);
  assert.equal(isNetworkError(Object.assign(new Error('timed out'), { name: 'TimeoutError' })), true);
  assert.equal(isNetworkError(new Error('Phone fingerprint verification failed.')), false);
});

test('the phone keeps a small copy of the profile and recent attendance until sign-out', () => {
  saveOfflineSession(
    { name: 'Juan', employeeId: 'E1', profilePicture: 'data:image/png;base64,AAAA' },
    [{ id: 'att-1', date: '2026-10-05', timeIn: '08:00 AM', selfieUrl: 'data:image/jpeg;base64,BBBB', locationHistory: [{}] }]
  );
  const saved = readOfflineSession();
  assert.deepEqual(saved.user, { name: 'Juan', employeeId: 'E1' });
  assert.deepEqual(saved.attendance, [{ id: 'att-1', date: '2026-10-05', timeIn: '08:00 AM', hasSelfie: true }]);
  clearOfflineSession();
  assert.equal(readOfflineSession(), null);
});
