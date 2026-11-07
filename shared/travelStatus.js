// Official travel at Time In and on the DTR. An employee with an approved Travel Order for a day
// is on official travel: they need no Time In that day, the DTR writes the day as official
// travel, and field attendance, which is for field work without a Travel Order, is not used.

const dayOf = value => (typeof value === 'string' ? value.slice(0, 10) : '');

// The approved Travel Order among `requests` that covers `date` (YYYY-MM-DD), or null.
export const approvedTravelOrderOn = (requests = [], date) => requests.find(request => {
  const start = dayOf(request?.startDate);
  const end = dayOf(request?.endDate) || start;
  return request?.type === 'Travel Order' && /\bapproved\b/i.test(request.status || '')
    && Boolean(start) && start <= date && date <= end;
}) || null;

export const FIELD_ON_TRAVEL_ERROR = 'You have an approved Travel Order today, so no Time In is needed. Field attendance is only for field work without a Travel Order.';
