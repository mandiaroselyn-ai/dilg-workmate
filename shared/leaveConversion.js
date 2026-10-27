// Tardiness and undertime are charged to vacation leave by the CSC table that converts working
// hours and minutes into fractions of a day, based on an 8-hour day: 1 hour is 0.125 day, and
// each minute is minutes ÷ 480 written to three places (1 minute is 0.002 day, 30 minutes
// 0.062). The table rounds a value exactly halfway down: 6 minutes is 0.012 day.
export const minutesToLeaveDays = minutes => {
  const whole = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(whole / 60);
  const thousandths = Math.round((whole % 60) * 1000 / 480 - 1e-9);
  return (hours * 125 + thousandths) / 1000;
};
