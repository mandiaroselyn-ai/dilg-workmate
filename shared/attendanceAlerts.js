import { getManilaDateString } from './localDate.js';

// HR is told when an employee on duty has been outside their assigned area this long.
export const OUTSIDE_ALERT_AFTER_MINUTES = 30;

// Whether HR should now be told that the employee of open shift `log` is outside their assigned
// area: outside for OUTSIDE_ALERT_AFTER_MINUTES or more by the live GPS, not out for lunch,
// and not told yet for this time outside.
export const shouldAlertOutside = (log, now = new Date()) => Boolean(
  log?.outsideSince
  && !log.outsideAlertSentAt
  && !log.timeOut
  && !(log.lunchOut && !log.lunchIn)
  && now.getTime() - new Date(log.outsideSince).getTime() >= OUTSIDE_ALERT_AFTER_MINUTES * 60 * 1000
);

// HR is told when an employee's attendance selfies fail to match this many times in one day:
// someone may be trying to punch for them, or their enrollment selfie needs taking again.
export const MISMATCH_ALERT_COUNT = 3;

// How many of the employee's attendance selfies did not match on `date` (YYYY-MM-DD, Manila),
// from their verification history.
export const mismatchesOn = (audit = [], date) => audit.filter(event => (
  event?.outcome === 'attendance-face-mismatch'
  && event.timestamp
  && getManilaDateString(new Date(event.timestamp)) === date
)).length;
