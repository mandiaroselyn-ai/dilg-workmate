// A day can be on only one leave or official travel, so an employee's leave requests and travel
// orders may not overlap: not a leave with another leave, a travel order with another travel
// order, or a leave with a travel order. A request holds its dates from the time it is
// submitted until it is turned down or withdrawn: while HR or the supervisor reviews it, while
// it is returned to the employee to fix, and once it is approved. A draft (not submitted yet),
// a rejected, a withdrawn, or a cancelled request holds no dates.
const TYPES = { 'Leave Request': 'leave', 'Travel Order': 'travel order' };
const HOLDS_DATES = ['Pending', 'For Supervisor', 'Returned', 'Approved'];

const dayOf = value => (typeof value === 'string' ? value.slice(0, 10) : '');
const sameText = (a, b) => Boolean(a) && Boolean(b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const idOf = request => request?.id || request?.customId || '';

// The same employee's other leave or travel order whose dates overlap those of `request` (both
// ends of each range included), or null. `requests` may hold anyone's requests of any type.
export const overlappingRequest = (request, requests = []) => {
  if (!TYPES[request?.type]) return null;
  const start = dayOf(request.startDate);
  const end = dayOf(request.endDate) || start;
  if (!start) return null;
  return requests.find(other => (
    TYPES[other?.type]
    && HOLDS_DATES.includes(other.status)
    && !(idOf(request) && idOf(other) === idOf(request))
    && (sameText(other.employeeId, request.employeeId) || sameText(other.employeeEmail, request.employeeEmail))
    && dayOf(other.startDate) <= end
    && start <= (dayOf(other.endDate) || dayOf(other.startDate))
  )) || null;
};

const dateText = day => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// Why a request cannot be submitted over `other`, the leave or travel order it overlaps.
export const overlapMessage = other => {
  const start = dayOf(other.startDate);
  const end = dayOf(other.endDate) || start;
  const dates = start === end ? dateText(start) : `${dateText(start)} to ${dateText(end)}`;
  const fix = other.status === 'Approved' ? 'Choose other dates.' : 'Change the dates, or withdraw that request first.';
  return `You already have a ${TYPES[other.type]} for ${dates} (Ref ${idOf(other)}, ${other.status}). Leave and travel dates cannot overlap. ${fix}`;
};
