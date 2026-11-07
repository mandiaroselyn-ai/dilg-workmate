import assert from 'node:assert/strict';
import test from 'node:test';
import { dtrDayLogs, dtrEarlyMinutes, dtrLateMinutes, dtrOvertime, dtrUndertimeMinutes, durationText, isRestDate, isRestDay, LUNCH_LOGS_FROM, missingLunchLog, officeHoursText, officeRangeText, officeTimeText, punchStanding, tardiness, tardinessText, usesLunchLogs } from './dtrDay.js';
import { dtrIssue, dtrRecordStatus, isLate, markDtrDay, missingDtrLog, totalHoursWorked } from './hrAttendance.js';

// A Tuesday, so a flexitime day: in from 7:00 to 9:00 AM, out eight working hours later.
const day = LUNCH_LOGS_FROM;
// A Monday, with fixed hours: 7:00 AM to 4:00 PM.
const monday = '2026-11-09';
const wholeDay = {
  date: day,
  timeIn: '07:55 AM',
  lunchOut: '12:02 PM',
  lunchIn: '12:58 PM',
  timeOut: '05:04 PM',
  selfieUrl: 'data:image/jpeg;base64,selfie',
  fingerprintVerified: true
};

test('a whole day shows its own four logs, with no tardiness or undertime inside office hours', () => {
  const logs = dtrDayLogs(wholeDay);
  assert.deepEqual(logs, { amArrival: '07:55 AM', amDeparture: '12:02 PM', pmArrival: '12:58 PM', pmDeparture: '05:04 PM' });
  assert.equal(dtrUndertimeMinutes(logs, day), 0);
});

test('on Monday, arriving after 7:00 AM, back late from lunch, and leaving before 4:00 PM all count', () => {
  const logs = dtrDayLogs({ ...wholeDay, date: monday, timeIn: '07:10 AM', lunchOut: '11:50 AM', lunchIn: '01:20 PM', timeOut: '03:45 PM' });
  // 10 late in the morning, 10 early for lunch, 20 late back, 15 early home.
  assert.equal(dtrUndertimeMinutes(logs, monday), 55);
  assert.equal(dtrLateMinutes(logs, monday), 30);
  assert.equal(dtrEarlyMinutes(logs, monday), 25);
  assert.equal(dtrUndertimeMinutes(dtrDayLogs({ ...wholeDay, date: monday, timeIn: '07:00 AM', timeOut: '04:00 PM' }), monday), 0);
});

test('on a flexitime day, the eight hours count from the arrival between 7:00 and 9:00 AM', () => {
  const flexi = (timeIn, timeOut) => dtrDayLogs({ ...wholeDay, lunchOut: '12:00 PM', lunchIn: '01:00 PM', timeIn, timeOut });
  // In at 8:30, so out at 5:30.
  assert.equal(dtrUndertimeMinutes(flexi('08:30 AM', '05:30 PM'), day), 0);
  assert.equal(dtrEarlyMinutes(flexi('08:30 AM', '05:00 PM'), day), 30);
  // Coming before 7:00 counts from 7:00, so out at 4:00 PM.
  assert.equal(dtrUndertimeMinutes(flexi('06:40 AM', '04:00 PM'), day), 0);
  // After 9:00 is late, and the day ends at 6:00 PM: staying later does not make up for it.
  assert.equal(dtrLateMinutes(flexi('09:20 AM', '06:00 PM'), day), 20);
  assert.equal(dtrUndertimeMinutes(flexi('09:20 AM', '06:20 PM'), day), 20);
  assert.equal(dtrUndertimeMinutes(flexi('09:20 AM', '05:30 PM'), day), 50);
});

const juan = { employeeId: 'E1' };
const order = (changes = {}) => ({ orderNumber: 'OO 14', startDate: day, endDate: day, startTime: '17:00', endTime: '19:00', employeeIds: ['E1'], ...changes });
// The day's overtime once the office calendar is marked on the record.
const overtimeOf = (record, calendar) => {
  const marked = markDtrDay({ ...juan, ...record }, calendar);
  return dtrOvertime(dtrDayLogs(marked), marked);
};

test('work after the day\'s eight hours is overtime only within an office order', () => {
  // In at 8:00 on a flexitime day, so the eight hours end at 5:00 PM.
  const stayed = { ...wholeDay, timeIn: '08:00 AM', timeOut: '07:30 PM' };
  assert.deepEqual(overtimeOf(stayed), { overtime: 0, noOrder: 150 });
  // The order ends at 7:00 PM, so the last 30 minutes are not overtime.
  assert.deepEqual(overtimeOf(stayed, { overtimeOrders: [order()] }), { overtime: 120, noOrder: 30 });
  assert.deepEqual(overtimeOf({ ...wholeDay, timeIn: '08:00 AM', timeOut: '05:00 PM' }, { overtimeOrders: [order()] }), { overtime: 0, noOrder: 0 });
  // In at 7:00, so the eight hours end at 4:00 PM, and the work after it is outside them.
  assert.deepEqual(overtimeOf({ ...wholeDay, timeIn: '07:00 AM', timeOut: '05:00 PM' }), { overtime: 0, noOrder: 60 });
  // Another employee's order, or one for other dates, does not count.
  assert.deepEqual(overtimeOf(stayed, { overtimeOrders: [order({ employeeIds: ['E2'] })] }), { overtime: 0, noOrder: 150 });
  assert.deepEqual(overtimeOf(stayed, { overtimeOrders: [order({ startDate: '2026-10-28', endDate: '2026-10-30' })] }), { overtime: 0, noOrder: 150 });
  // Two orders over the same hours count those hours once.
  assert.deepEqual(overtimeOf(stayed, { overtimeOrders: [order(), order({ orderNumber: 'OO 15' })] }), { overtime: 120, noOrder: 30 });
});

test('an order can cover the time before 7:00 AM, but never the office hours or lunch', () => {
  const early = { ...wholeDay, date: monday, timeIn: '06:30 AM', lunchOut: '12:00 PM', lunchIn: '01:00 PM', timeOut: '04:00 PM' };
  const orderOnMonday = changes => order({ startDate: monday, endDate: monday, ...changes });
  assert.deepEqual(overtimeOf(early, { overtimeOrders: [orderOnMonday({ startTime: '06:00', endTime: '08:00' })] }), { overtime: 30, noOrder: 0 });
  // Coming early without an order is simply coming early.
  assert.deepEqual(overtimeOf(early), { overtime: 0, noOrder: 0 });
  assert.equal(overtimeOf(early, { overtimeOrders: [orderOnMonday({ startTime: '07:00', endTime: '16:00' })] }).overtime, 0);
});

test('overtime does not lessen late or undertime, and needs a finished day', () => {
  // Late on a Monday, so staying until 6:30 PM does not make up for it.
  const logs = dtrDayLogs({ ...wholeDay, date: monday, timeIn: '07:30 AM', timeOut: '06:30 PM' });
  assert.equal(dtrUndertimeMinutes(logs, monday), 30);
  assert.deepEqual(overtimeOf({ date: day, timeIn: '08:00 AM', timeOut: '12:00 PM' }, { overtimeOrders: [order()] }), { overtime: 0, noOrder: 0 });
  assert.deepEqual(overtimeOf({ date: day, timeIn: '08:00 AM' }, { overtimeOrders: [order()] }), { overtime: 0, noOrder: 0 });
});

test('Saturdays, Sundays, and holidays are rest days', () => {
  assert.equal(isRestDay({ date: '2026-11-07' }), true); // Saturday
  assert.equal(isRestDay({ date: '2026-11-08' }), true); // Sunday
  assert.equal(isRestDay({ date: '2026-11-09' }), false); // Monday
  assert.equal(isRestDay({}), false);
  const holidays = [{ date: '2026-11-30', name: 'Bonifacio Day' }];
  assert.equal(isRestDay(markDtrDay({ date: '2026-11-30' }, { holidays })), true);
  assert.equal(isRestDay(markDtrDay({ date: '2026-11-27' }, { holidays })), false);
  assert.equal(isRestDate('2026-11-30', holidays), true);
  assert.equal(isRestDate('2026-11-07'), true);
  assert.equal(isRestDate('2026-11-27', holidays), false);
  // The `late` the server saved at Time In is dropped on a rest day only.
  assert.equal(markDtrDay({ date: '2026-11-30', late: true }, { holidays }).late, false);
  assert.equal(markDtrDay({ date: '2026-11-27', late: true }, { holidays }).late, true);
});

test('work from home and travel status earn no overtime, even within an office order', () => {
  const stayed = { ...wholeDay, timeIn: '08:00 AM', timeOut: '07:30 PM' };
  const calendar = { overtimeOrders: [order()] };
  assert.deepEqual(overtimeOf({ ...stayed, dutyType: 'wfh' }, calendar), { overtime: 0, noOrder: 0 });
  assert.deepEqual(overtimeOf({ ...stayed, workAssignment: { assignmentRole: 'wfh' } }, calendar), { overtime: 0, noOrder: 0 });
  // Reporting to the office or to a field assignment does earn it.
  assert.equal(overtimeOf({ ...stayed, dutyType: 'office' }, calendar).overtime, 120);
  assert.equal(overtimeOf({ ...stayed, dutyType: 'field' }, calendar).overtime, 120);

  const travel = { type: 'Travel Order', status: 'Approved', employeeId: 'E1', startDate: day, endDate: day };
  assert.deepEqual(overtimeOf(stayed, { ...calendar, requests: [travel] }), { overtime: 0, noOrder: 0 });
  // Not while it is pending, not on other dates, and not for another employee's travel.
  assert.equal(overtimeOf(stayed, { ...calendar, requests: [{ ...travel, status: 'Pending' }] }).overtime, 120);
  assert.equal(overtimeOf(stayed, { ...calendar, requests: [{ ...travel, startDate: '2026-10-28', endDate: '2026-10-29' }] }).overtime, 120);
  assert.equal(overtimeOf(stayed, { ...calendar, requests: [{ ...travel, employeeId: 'E2' }] }).overtime, 120);
  // A leave on that date is not travel status.
  assert.equal(overtimeOf(stayed, { ...calendar, requests: [{ ...travel, type: 'Leave Request' }] }).overtime, 120);
});

test('all the work of a rest day is overtime within an office order, less its lunch', () => {
  const saturday = { date: '2026-11-07', timeIn: '09:00 AM', lunchOut: '12:00 PM', lunchIn: '01:00 PM', timeOut: '03:00 PM' };
  assert.deepEqual(overtimeOf(saturday), { overtime: 0, noOrder: 300 });
  const ordered = { overtimeOrders: [order({ startDate: '2026-11-07', endDate: '2026-11-07', startTime: '08:00', endTime: '17:00' })] };
  assert.deepEqual(overtimeOf(saturday, ordered), { overtime: 300, noOrder: 0 });
  // Without lunch logs, the noon hour is left out.
  assert.deepEqual(overtimeOf({ date: '2026-11-07', timeIn: '09:00 AM', timeOut: '03:00 PM' }, ordered), { overtime: 300, noOrder: 0 });
});

test('a punch on a rest day is neither late nor undertime', () => {
  const saturday = { date: '2026-11-07', timeIn: '09:00 AM', lunchOut: '11:00 AM', lunchIn: '01:30 PM', timeOut: '03:00 PM', late: true };
  assert.deepEqual(punchStanding(saturday), { timeIn: null, lunchOut: null, lunchIn: null, timeOut: null });
  assert.deepEqual(tardiness(saturday), { am: 0, pm: 0 });
  assert.equal(tardinessText(saturday), '');
  assert.equal(isLate(saturday), false);
  assert.equal(dtrRecordStatus(saturday, '2026-12-01'), 'Complete');
  // HR can still set it to Late.
  assert.equal(isLate({ ...saturday, status: 'Late' }), true);
});

test('a half day counts only the half that was worked', () => {
  const morning = dtrDayLogs({ date: day, timeIn: '08:00 AM', timeOut: '12:00 PM' });
  assert.deepEqual(morning, { amArrival: '08:00 AM', amDeparture: '12:00 PM', pmArrival: '', pmDeparture: '' });
  assert.equal(dtrUndertimeMinutes(morning, day), 0);

  // The afternoon is four hours, to 5:00 PM; on a Monday it ends with Monday's hours, at 4:00 PM.
  const afternoon = dtrDayLogs({ date: day, timeIn: '12:50 PM', timeOut: '05:00 PM' });
  assert.deepEqual(afternoon, { amArrival: '', amDeparture: '', pmArrival: '12:50 PM', pmDeparture: '05:00 PM' });
  assert.equal(dtrUndertimeMinutes(afternoon, day), 0);
  assert.equal(dtrEarlyMinutes(dtrDayLogs({ date: day, timeIn: '01:00 PM', timeOut: '04:00 PM' }), day), 60);
  assert.equal(dtrUndertimeMinutes(dtrDayLogs({ date: monday, timeIn: '01:00 PM', timeOut: '04:00 PM' }), monday), 0);
  assert.equal(missingLunchLog({ date: day, timeIn: '12:50 PM', timeOut: '05:00 PM' }), null);
});

test('a whole day without lunch logs leaves the noon cells empty and goes to HR', () => {
  const record = { ...wholeDay, lunchOut: null, lunchIn: null };
  assert.deepEqual(dtrDayLogs(record), { amArrival: '07:55 AM', amDeparture: '', pmArrival: '', pmDeparture: '05:04 PM' });
  assert.equal(missingLunchLog(record), 'Missing Lunch Out');
  assert.equal(missingLunchLog({ ...wholeDay, lunchIn: null }), 'Missing Lunch In');
  assert.equal(dtrIssue(record, '2026-12-01'), 'Missing Lunch Out');
  assert.equal(dtrRecordStatus(record, '2026-12-01'), 'Incomplete');
  assert.equal(missingDtrLog(record), 'Missing Lunch Out');
  assert.equal(dtrRecordStatus(wholeDay, '2026-12-01'), 'Complete');
});

test('going home at lunch ends a morning-only day; not coming back to Lunch In goes to HR', () => {
  const wentHome = { date: day, timeIn: '08:00 AM', lunchOut: '12:00 PM', timeOut: '12:20 PM' };
  assert.deepEqual(dtrDayLogs(wentHome), { amArrival: '08:00 AM', amDeparture: '12:00 PM', pmArrival: '', pmDeparture: '' });
  assert.equal(missingLunchLog(wentHome), null);

  const noLunchIn = { ...wentHome, timeOut: '05:00 PM' };
  assert.deepEqual(dtrDayLogs(noLunchIn), { amArrival: '08:00 AM', amDeparture: '12:00 PM', pmArrival: '', pmDeparture: '05:00 PM' });
  assert.equal(missingLunchLog(noLunchIn), 'Missing Lunch In');
});

test('records from before lunch logs keep the old DTR and are not flagged', () => {
  const old = { date: '2026-10-20', timeIn: '08:00 AM', timeOut: '05:00 PM' };
  assert.equal(usesLunchLogs(old), false);
  assert.equal(missingLunchLog(old), null);
  assert.equal(usesLunchLogs({ ...old, lunchOut: '12:00 PM' }), true);
});

test('each punch shows how late or early it was against the day\'s office hours', () => {
  assert.deepEqual(punchStanding({ ...wholeDay, date: monday, timeIn: '07:07 AM', lunchOut: '11:45 AM', lunchIn: '01:12 PM', timeOut: '04:00 PM' }), {
    timeIn: { late: 7 }, lunchOut: { early: 15 }, lunchIn: { late: 12 }, timeOut: { early: 0 }
  });
  // On a flexitime day, in at 8:07 is on time, and the eight hours end at 5:07 PM.
  assert.deepEqual(punchStanding({ ...wholeDay, timeIn: '08:07 AM', lunchOut: '12:00 PM', lunchIn: '01:00 PM', timeOut: '05:00 PM' }), {
    timeIn: { late: 0 }, lunchOut: { early: 0 }, lunchIn: { late: 0 }, timeOut: { early: 7 }
  });
  // An afternoon-only day arrives against 1:00 PM; a morning-only day leaves against noon.
  assert.deepEqual(punchStanding({ date: day, timeIn: '01:20 PM' }), { timeIn: { late: 20 }, lunchOut: null, lunchIn: null, timeOut: null });
  assert.deepEqual(punchStanding({ date: day, timeIn: '08:00 AM', timeOut: '11:30 AM' }).timeOut, { early: 30 });
  assert.equal(punchStanding({ date: day, timeIn: '08:00 AM', lunchOut: '12:00 PM', timeOut: '12:20 PM' }).timeOut, null);
});

test('a late day has a late arrival, in the morning or back from lunch', () => {
  assert.equal(isLate(wholeDay), false);
  // After 9:00 AM on a flexitime day, or after 7:00 AM on a Monday.
  assert.equal(isLate({ ...wholeDay, timeIn: '08:59 AM' }), false);
  assert.equal(isLate({ ...wholeDay, timeIn: '09:07 AM' }), true);
  assert.equal(isLate({ ...wholeDay, date: monday, timeIn: '07:07 AM' }), true);
  assert.equal(isLate({ ...wholeDay, lunchIn: '01:15 PM' }), true);
  assert.equal(dtrRecordStatus({ ...wholeDay, lunchIn: '01:15 PM' }, '2026-12-01'), 'Late');
  assert.deepEqual(tardiness({ ...wholeDay, timeIn: '09:07 AM', lunchIn: '01:15 PM' }), { am: 7, pm: 15 });
  assert.equal(tardinessText({ ...wholeDay, timeIn: '09:07 AM', lunchIn: '01:15 PM' }), 'AM 7 min · PM 15 min');
  // An afternoon-only day is late only after 1:00 PM, whatever was saved at Time In.
  assert.equal(isLate({ date: day, timeIn: '12:50 PM', late: true }), false);
  assert.equal(isLate({ date: day, timeIn: '01:20 PM' }), true);
  assert.equal(tardinessText({ date: day, timeIn: '01:20 PM' }), 'PM 20 min');
  // Records from before lunch logs keep the late saved at Time In; HR can set Late too.
  assert.equal(isLate({ date: '2026-10-20', timeIn: '07:30 AM', late: false }), false);
  assert.equal(isLate({ date: '2026-10-20', timeIn: '08:30 AM', late: true }), true);
  assert.equal(isLate({ ...wholeDay, status: 'Late' }), true);
});

test('office hours are written the way the DTR and the app show them', () => {
  assert.equal(officeTimeText(8 * 60), '8:00 AM');
  assert.equal(officeTimeText(12 * 60), '12:00 NN');
  assert.equal(officeTimeText(13 * 60), '1:00 PM');
  assert.equal(officeTimeText(17 * 60), '5:00 PM');
  assert.equal(officeHoursText(), 'Mon 7–4; Tue–Fri flexi 7–9, 8 hrs');
  assert.equal(officeRangeText(7 * 60, 9 * 60), '7:00–9:00 AM');
  assert.equal(officeRangeText(16 * 60, 18 * 60), '4:00–6:00 PM');
  assert.equal(durationText(7), '7 min');
  assert.equal(durationText(65), '1h 05m');
});

test('the lunch break is deducted from the hours worked', () => {
  // 7:55 AM to 5:04 PM, less the 56-minute lunch.
  assert.equal(totalHoursWorked(wholeDay), '8h 13m');
  assert.equal(totalHoursWorked({ ...wholeDay, lunchIn: null }), '9h 09m');
});
