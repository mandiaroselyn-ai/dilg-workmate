// A Travel Order's activity time is kept as text, such as "8:00 AM - 5:00 PM", which the order
// prints as "8:00 a.m. to 5:00 p.m." (formatTravelTime). The form picks it with two clocks.

const pad = number => String(number).padStart(2, '0');

// "8:00 AM", "8 a.m.", or "08:00PM" as a clock's "HH:MM" (24-hour).
const CLOCK = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\b\.?/gi;
const toClock = (hours, minutes, half) => {
  const hour = Number(hours);
  const minute = Number(minutes || 0);
  if (hour < 1 || hour > 12 || minute > 59) return '';
  return `${pad((hour % 12) + (half.toLowerCase() === 'p' ? 12 : 0))}:${pad(minute)}`;
};

// The start and end of an activity time, as clocks' "HH:MM" (24-hour), or '' for one that is
// not there (a time typed some other way gives neither).
export const readTravelTime = text => {
  const [from = '', to = ''] = [...String(text || '').matchAll(CLOCK)].map(([, hours, minutes, half]) => toClock(hours, minutes, half));
  return { from, to };
};

// "17:30" as "5:30 PM".
const clockText = clock => {
  const [hours, minutes] = clock.split(':').map(Number);
  return `${hours % 12 || 12}:${pad(minutes)} ${hours < 12 ? 'AM' : 'PM'}`;
};

// The activity time from its two clocks, such as "8:00 AM - 5:00 PM" ('' when neither is set).
export const travelTimeText = (from, to) => (from || to
  ? `${from ? clockText(from) : ''} - ${to ? clockText(to) : ''}`.trim()
  : '');

// Why an activity time cannot be filed, or '' when it can: both clocks are needed, and it ends
// after it starts.
export const travelTimeProblem = text => {
  const { from, to } = readTravelTime(text);
  if (!from || !to) return 'Choose when the activity starts and ends (Activity Time).';
  if (to <= from) return 'The Activity Time must end after it starts.';
  return '';
};
