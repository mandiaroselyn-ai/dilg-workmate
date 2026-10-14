// How long a travel order covers, in calendar days: the activity date through the return
// date, both counted ("2026-10-05" to "2026-10-07" is 3 days). A travel order without a
// return date covers its activity date only. 0 when the dates are missing or out of order.
export const travelDayCount = (startDate, endDate) => {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate || startDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 86400000) + 1;
};

// "3 days", "1 day", or '' when the dates do not give a duration.
export const travelDurationLabel = request => {
  const days = travelDayCount(request?.startDate, request?.endDate);
  return days ? `${days} day${days === 1 ? '' : 's'}` : '';
};
