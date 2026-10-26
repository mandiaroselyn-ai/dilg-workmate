// The server's clock, kept as an offset from this device's. Attendance times are saved by the
// server, so the time shown before a punch is the server's, even on a phone whose clock is
// set wrong. Until it is known (or without internet), this device's clock is used.

let offsetMs = 0;
let synced = false;
let syncing = null;

export const serverNow = () => new Date(Date.now() + offsetMs);
export const isServerClockSynced = () => synced;

// Reads the server's time from the Date header of a HEAD request for the site, which goes to
// the network (the service worker only answers GET requests). Resolves once done or failed.
export const syncServerClock = () => {
  if (!syncing) {
    const sentAt = Date.now();
    syncing = fetch('/', { method: 'HEAD', cache: 'no-store' })
      .then(response => {
        const serverTime = Date.parse(response.headers.get('date') || '');
        if (!Number.isFinite(serverTime)) return;
        const receivedAt = Date.now();
        // The header is in whole seconds, so on average half a second was dropped.
        offsetMs = serverTime + 500 + (receivedAt - sentAt) / 2 - receivedAt;
        synced = true;
      })
      .catch(() => {})
      .finally(() => {
        syncing = null;
      });
  }
  return syncing;
};
