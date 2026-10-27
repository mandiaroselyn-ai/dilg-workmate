import assert from 'node:assert/strict';
import test from 'node:test';
import { dtrDayLogs, dtrUndertimeMinutes, durationText, LUNCH_LOGS_FROM, missingLunchLog, officeHoursText, officeTimeText, punchStanding, tardiness, tardinessText, usesLunchLogs } from './dtrDay.js';
import { dtrIssue, dtrRecordStatus, isLate, missingDtrLog, totalHoursWorked } from './hrAttendance.js';

const day = LUNCH_LOGS_FROM;
const wholeDay = {
  date: day,
  timeIn: '06:55 AM',
  lunchOut: '12:02 PM',
  lunchIn: '12:58 PM',
  timeOut: '04:34 PM',
  selfieUrl: 'data:image/jpeg;base64,selfie',
  fingerprintVerified: true
};

test('a whole day shows its own four logs, with no tardiness or undertime inside office hours', () => {
  const logs = dtrDayLogs(wholeDay);
  assert.deepEqual(logs, { amArrival: '06:55 AM', amDeparture: '12:02 PM', pmArrival: '12:58 PM', pmDeparture: '04:34 PM' });
  assert.equal(dtrUndertimeMinutes(logs), 0);
});

test('arriving late, back late from lunch, and leaving early all count', () => {
  const logs = dtrDayLogs({ ...wholeDay, timeIn: '07:10 AM', lunchOut: '11:50 AM', lunchIn: '01:20 PM', timeOut: '04:15 PM' });
  // 10 late in the morning, 10 early for lunch, 20 late back, 15 early home.
  assert.equal(dtrUndertimeMinutes(logs), 55);
});

test('a half day counts only the half that was worked', () => {
  const morning = dtrDayLogs({ date: day, timeIn: '07:00 AM', timeOut: '12:00 PM' });
  assert.deepEqual(morning, { amArrival: '07:00 AM', amDeparture: '12:00 PM', pmArrival: '', pmDeparture: '' });
  assert.equal(dtrUndertimeMinutes(morning), 0);

  const afternoon = dtrDayLogs({ date: day, timeIn: '12:50 PM', timeOut: '04:30 PM' });
  assert.deepEqual(afternoon, { amArrival: '', amDeparture: '', pmArrival: '12:50 PM', pmDeparture: '04:30 PM' });
  assert.equal(dtrUndertimeMinutes(afternoon), 0);
  assert.equal(missingLunchLog({ date: day, timeIn: '12:50 PM', timeOut: '04:30 PM' }), null);
});

test('a whole day without lunch logs leaves the noon cells empty and goes to HR', () => {
  const record = { ...wholeDay, lunchOut: null, lunchIn: null };
  assert.deepEqual(dtrDayLogs(record), { amArrival: '06:55 AM', amDeparture: '', pmArrival: '', pmDeparture: '04:34 PM' });
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

test('each punch shows how late or early it was against office hours', () => {
  assert.deepEqual(punchStanding({ ...wholeDay, timeIn: '07:07 AM', lunchOut: '11:45 AM', lunchIn: '01:12 PM', timeOut: '04:30 PM' }), {
    timeIn: { late: 7 }, lunchOut: { early: 15 }, lunchIn: { late: 12 }, timeOut: { early: 0 }
  });
  // An afternoon-only day arrives against 1:00 PM; a morning-only day leaves against noon.
  assert.deepEqual(punchStanding({ date: day, timeIn: '01:20 PM' }), { timeIn: { late: 20 }, lunchOut: null, lunchIn: null, timeOut: null });
  assert.deepEqual(punchStanding({ date: day, timeIn: '07:00 AM', timeOut: '11:30 AM' }).timeOut, { early: 30 });
  assert.equal(punchStanding({ date: day, timeIn: '08:00 AM', lunchOut: '12:00 PM', timeOut: '12:20 PM' }).timeOut, null);
});

test('a late day has a late arrival, in the morning or back from lunch', () => {
  assert.equal(isLate(wholeDay), false);
  assert.equal(isLate({ ...wholeDay, timeIn: '07:07 AM' }), true);
  assert.equal(isLate({ ...wholeDay, lunchIn: '01:15 PM' }), true);
  assert.equal(dtrRecordStatus({ ...wholeDay, lunchIn: '01:15 PM' }, '2026-12-01'), 'Late');
  assert.deepEqual(tardiness({ ...wholeDay, timeIn: '07:07 AM', lunchIn: '01:15 PM' }), { am: 7, pm: 15 });
  assert.equal(tardinessText({ ...wholeDay, timeIn: '07:07 AM', lunchIn: '01:15 PM' }), 'AM 7 min · PM 15 min');
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
  assert.equal(officeTimeText(16 * 60 + 30), '4:30 PM');
  assert.equal(officeHoursText(), '7:00–12:00, 1:00–4:30');
  assert.equal(durationText(7), '7 min');
  assert.equal(durationText(65), '1h 05m');
});

test('the lunch break is deducted from the hours worked', () => {
  assert.equal(totalHoursWorked(wholeDay), '8h 43m');
  assert.equal(totalHoursWorked({ ...wholeDay, lunchIn: null }), '9h 39m');
});
