const text = value => (typeof value === 'string' ? value.trim() : '');

const isRealDate = date => {
  const parsed = new Date(`${date}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};

// Validates HR's office order for overtime: { orderNumber, purpose, startDate, endDate,
// startTime, endTime, employeeIds }, as the CSC and DBM require it to say who, for what, and
// when. Dates are YYYY-MM-DD and times HH:MM, 24-hour, on one day: an order for work past
// midnight is entered as two orders.
export const normalizeOvertimeOrder = body => {
  const orderNumber = text(body?.orderNumber);
  const purpose = text(body?.purpose);
  const startDate = text(body?.startDate);
  const endDate = text(body?.endDate);
  const startTime = text(body?.startTime);
  const endTime = text(body?.endTime);
  if (!orderNumber || orderNumber.length > 60) return { error: 'Enter the office order number, in 60 characters or fewer.' };
  if (!purpose || purpose.length > 300) return { error: 'Enter the purpose of the overtime, in 300 characters or fewer.' };
  if (!isRealDate(startDate) || !isRealDate(endDate)) return { error: 'Each date must be a real date, like 2026-12-25.' };
  if (endDate < startDate) return { error: 'The last date cannot be before the first date.' };
  if (![startTime, endTime].every(time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return { error: 'Each time must be written like 17:30.' };
  if (endTime <= startTime) return { error: 'The end time must be after the start time.' };
  const list = Array.isArray(body?.employeeIds) ? body.employeeIds.map(text) : [];
  if (!list.length) return { error: 'Choose at least one employee.' };
  if (list.length > 1000) return { error: 'Name at most 1000 employees in an order.' };
  if (list.some(id => !id || id.length > 120)) return { error: 'Each employee needs an employee ID or email.' };
  return { order: { orderNumber, purpose, startDate, endDate, startTime, endTime, employeeIds: [...new Set(list)] } };
};
