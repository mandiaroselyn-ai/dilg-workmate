// Official travel and leave at Time In and on the DTR. An employee with an approved Travel Order
// or an approved leave for a day has no Time In that day (see noTimeInOn); the DTR writes a day
// of official travel as such.

const dayOf = value => (typeof value === 'string' ? value.slice(0, 10) : '');

// The approved Travel Order among `requests` that covers `date` (YYYY-MM-DD), or null.
export const approvedTravelOrderOn = (requests = [], date) => requests.find(request => {
  const start = dayOf(request?.startDate);
  const end = dayOf(request?.endDate) || start;
  return request?.type === 'Travel Order' && /\bapproved\b/i.test(request.status || '')
    && Boolean(start) && start <= date && date <= end;
}) || null;

const sameText = (a, b) => Boolean(a) && Boolean(b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

// Whether `person` ({ employeeId, email }) goes on the Travel Order `request`: the employee who
// filed it, or one of the employees from other offices or towns they included (`companions`).
export const travelOrderCovers = (request, person) => request?.type === 'Travel Order' && Boolean(
  sameText(request.employeeId, person?.employeeId)
  || sameText(request.employeeEmail, person?.email ?? person?.employeeEmail)
  || (request.companions || []).some(companion => sameText(companion?.employeeId, person?.employeeId))
);

// The people a Travel Order includes besides the one who filed it, by name, as shown.
export const companionNames = request => (request?.companions || []).map(companion => companion?.name).filter(Boolean).join(', ');

// The approved leave among `requests` whose dates include `date` (YYYY-MM-DD), or null.
export const approvedLeaveOn = (requests = [], date) => requests.find(request => {
  const start = dayOf(request?.startDate);
  const end = dayOf(request?.endDate) || start;
  return request?.type === 'Leave Request' && /\bapproved\b/i.test(request.status || '')
    && Boolean(start) && start <= date && date <= end;
}) || null;

// Whether the leave `request` is `person`'s own: by Employee ID, or by email for a leave saved
// without one.
const ownsLeave = (request, person) => (request?.employeeId
  ? sameText(request.employeeId, person?.employeeId)
  : sameText(request?.employeeEmail, person?.email ?? person?.employeeEmail));

export const ON_TRAVEL_NO_TIME_IN = 'You are on official travel today (approved Travel Order), so there is no Time In. Your DTR shows today as official travel.';
export const ON_LEAVE_NO_TIME_IN = 'You are on approved leave today, so there is no Time In.';

// Why `person` ({ employeeId, email }) has no Time In on `date`: an approved Travel Order that
// includes them, or their own approved leave, that covers the day (as the user set on
// 2026-11-25: no attendance on leave or on travel). `person` is null when `requests` are already
// only theirs, as the server finds them. Returns { kind: 'travel' | 'leave', request, error }, or
// null when they time in as usual.
export const noTimeInOn = (requests = [], person, date) => {
  const list = requests || [];
  const travel = approvedTravelOrderOn(person ? list.filter(request => travelOrderCovers(request, person)) : list, date);
  if (travel) return { kind: 'travel', request: travel, error: ON_TRAVEL_NO_TIME_IN };
  const leave = approvedLeaveOn(person ? list.filter(request => ownsLeave(request, person)) : list, date);
  if (leave) return { kind: 'leave', request: leave, error: ON_LEAVE_NO_TIME_IN };
  return null;
};
