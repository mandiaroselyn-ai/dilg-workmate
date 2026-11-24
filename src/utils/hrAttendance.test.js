import assert from 'node:assert/strict';
import test from 'node:test';
import {
  absentDays,
  activeEmployees,
  canVerifyInBulk,
  monitoringStatus,
  dayEndText,
  countsInDtr,
  dtrIssue,
  dtrRecordStatus,
  dtrStatusOf,
  dtrTimeOut,
  employeeDayStatus,
  geofenceStateOf,
  incompleteDtrDays,
  liveLocationFor,
  isOfflineReviewPending,
  isOfflineTimeOutPending,
  mergeAttendanceMonth,
  mergeRecentAttendance,
  monthAttendanceSummary,
  recordsForEmployees,
  requestCoversDate,
  totalHoursWorked
} from './hrAttendance.js';

const today = '2026-09-29';
const rimhelyn = { name: 'Rimhelyn', employeeId: 'DILG-2026-145195', email: 'rimhelyn9@gmail.com', accountStatus: 'Active' };
const roselyn = { name: 'Roselyn Mandia', employeeId: 'DILG-2026-540013', email: 'roselynmandia03@gmail.com', accountStatus: 'Active' };

test('only active employee accounts are expected at work', () => {
  assert.deepEqual(activeEmployees([rimhelyn, { ...roselyn, accountStatus: 'Inactive' }, { name: 'New', accountStatus: 'Pending' }]), [rimhelyn]);
});

test('records from deleted or old accounts are not counted', () => {
  const records = [
    { employeeId: 'DILG-2026-145195', employeeName: 'Rimhelyn', date: today },
    { employeeId: 'DILG-2026-7689', employeeName: 'Roselyn Mandia', date: '2026-08-28' },
    { employeeId: 'DILG-2026-7689', employeeName: 'Lara Montiano', date: '2026-08-27' }
  ];
  assert.deepEqual(recordsForEmployees(records, [rimhelyn, roselyn]), [records[0]]);
});

test('today\'s status counts Time Ins, late arrivals, leave, and travel', () => {
  const records = [
    { employeeId: rimhelyn.employeeId, employeeName: 'Rimhelyn', date: today, timeIn: '08:30 AM', late: true }
  ];
  const requests = [
    { type: 'Leave Request', status: 'Approved', employeeId: roselyn.employeeId, employeeName: 'Roselyn Mandia', startDate: '2026-09-28', endDate: '2026-09-30' }
  ];
  assert.equal(employeeDayStatus(rimhelyn, { records, requests, date: today }).status, 'Late');
  assert.equal(employeeDayStatus(roselyn, { records, requests, date: today }).status, 'On Leave');
  assert.equal(employeeDayStatus(roselyn, { records, requests, date: '2026-10-01' }).status, 'Absent');
  assert.equal(employeeDayStatus(roselyn, { records, requests: [{ ...requests[0], type: 'Travel Order' }], date: today }).status, 'On Travel');
  assert.equal(employeeDayStatus(roselyn, { records, requests: [{ ...requests[0], status: 'Pending' }], date: today }).status, 'Absent');
});

test('a town holiday is a rest day only for the employees working in that town', () => {
  const holidays = [{ date: '2026-08-20', name: 'Gasan Founding Anniversary', place: 'Gasan' }];
  const inGasan = { ...rimhelyn, office: 'Office of the MLGOO - Gasan' };
  const inBoac = { ...roselyn, office: 'Office of the MLGOO - Boac' };
  assert.equal(employeeDayStatus(inGasan, { date: '2026-08-20', holidays, today: '2026-08-21' }).status, 'Rest Day');
  assert.equal(employeeDayStatus(inBoac, { date: '2026-08-20', holidays, today: '2026-08-21' }).status, 'Absent');
});

test('an employee HR set to ON LEAVE is on leave from today on, not absent', () => {
  const onLeave = { ...roselyn, employmentStatus: 'ON LEAVE' };
  assert.equal(employeeDayStatus(onLeave, { records: [], requests: [], date: today, today }).status, 'On Leave');
  assert.equal(employeeDayStatus(onLeave, { records: [], requests: [], date: '2026-09-30', today }).status, 'On Leave');
  // Earlier days go by the leave filed for them: the status does not say since when.
  assert.equal(employeeDayStatus(onLeave, { records: [], requests: [], date: '2026-09-28', today }).status, 'Absent');
  // A Time In still counts, and an active employee with no Time In is absent.
  const timedIn = { employeeId: roselyn.employeeId, employeeName: 'Roselyn Mandia', date: today, timeIn: '07:55 AM' };
  assert.equal(employeeDayStatus(onLeave, { records: [timedIn], requests: [], date: today, today }).status, 'Present');
  assert.equal(employeeDayStatus({ ...roselyn, employmentStatus: 'ACTIVE' }, { records: [], requests: [], date: today, today }).status, 'Absent');
  // The month counts today as leave, and the days before by their records.
  const month = monthAttendanceSummary(onLeave, { records: [], requests: [], today });
  assert.equal(month.leave, 1);
  assert.equal(month.absent, 20);
});

test('a day is Present in the month only when its logs are complete; one still lacking a log is Incomplete', () => {
  // Tuesday Sep 29, 2026. Sep 1 to 28 have no records (absent), except these.
  const own = extra => ({ employeeId: roselyn.employeeId, employeeName: 'Roselyn Mandia', ...extra });
  const records = [
    own({ date: '2026-09-21', timeIn: '07:00 AM', lunchOut: '12:00 PM', lunchIn: '01:00 PM', timeOut: '04:00 PM' }), // complete
    own({ date: '2026-09-22', timeIn: '07:00 AM' }), // no Time Out
    own({ date: '2026-09-23', timeIn: '09:30 AM', late: true }), // late, no Time Out
    own({ date: today, timeIn: '08:00 AM' }) // open today: still on duty
  ];
  const month = monthAttendanceSummary(roselyn, { records, requests: [], today });
  assert.equal(month.present, 2);
  assert.equal(month.incomplete, 2);
  assert.equal(month.late, 0);
  // They came in on those days, so the rate counts them as attended.
  assert.equal(month.absent, 17);
  assert.equal(month.rate, Math.round((4 / 21) * 100));
});

test('a record\'s status says the log it lacks, and Late when it is late too', () => {
  const day = '2026-09-28';
  assert.deepEqual(dtrStatusOf({ date: day, timeIn: '09:30 AM', late: true }, today), { status: 'Incomplete', label: 'Missing Time Out', lateToo: true });
  assert.deepEqual(dtrStatusOf({ date: day, timeIn: '07:00 AM' }, today), { status: 'Incomplete', label: 'Missing Time Out', lateToo: false });
  assert.deepEqual(dtrStatusOf({ date: today, timeIn: '09:30 AM', late: true }, today), { status: 'On Duty', label: 'On Duty', lateToo: true });
  assert.deepEqual(dtrStatusOf({ date: day, timeIn: '09:30 AM', lunchOut: '12:00 PM', lunchIn: '01:00 PM', timeOut: '06:30 PM', late: true }, today), { status: 'Late', label: 'Late', lateToo: false });
  assert.deepEqual(dtrStatusOf({ date: day, timeIn: '07:00 AM', lunchOut: '12:00 PM', lunchIn: '01:00 PM', timeOut: '04:00 PM' }, today), { status: 'Complete', label: 'Complete', lateToo: false });
});

test('HR\'s geofence counts use today\'s live GPS, or the Time In GPS without it', () => {
  const live = [
    { employeeId: rimhelyn.employeeId, date: '2026-09-28', gpsStatus: 'Out of Range' }, // yesterday's shift, never timed out
    { employeeId: roselyn.employeeId, date: today, gpsStatus: 'Out of Range' }
  ];
  assert.equal(liveLocationFor(live, rimhelyn, today), null);
  assert.equal(liveLocationFor(live, roselyn, today), live[1]);
  const inRange = { date: today, timeIn: '08:00 AM', gpsStatus: 'In Range' };
  assert.equal(geofenceStateOf(null, null), 'Not Timed In');
  assert.equal(geofenceStateOf({ ...inRange, timeOut: '04:00 PM' }, null), 'Timed Out');
  assert.equal(geofenceStateOf(inRange, null), 'Inside Assigned Area');
  // Timed in inside the area, and the phone is now outside it.
  assert.equal(geofenceStateOf(inRange, live[1]), 'Outside Geofence');
  assert.equal(geofenceStateOf(inRange, { ...live[1], onLunch: true }), 'On Lunch');
  assert.equal(geofenceStateOf({ ...inRange, gpsStatus: 'Out of Range' }, { ...live[1], gpsStatus: 'In Range' }), 'Inside Assigned Area');
});

test('a leave without an end date covers its start date only', () => {
  assert.equal(requestCoversDate({ startDate: today }, today), true);
  assert.equal(requestCoversDate({ startDate: today }, '2026-09-30'), false);
  assert.equal(requestCoversDate({}, today), false);
});

test('an open shift today is on duty, not a missing Time Out', () => {
  const open = { timeIn: '08:00 AM', timeOut: null, selfieUrl: 'data:', fingerprintVerified: true };
  assert.equal(dtrIssue({ ...open, date: today }, today), null);
  assert.equal(dtrRecordStatus({ ...open, date: today }, today), 'On Duty');
  assert.equal(dtrIssue({ ...open, date: '2026-09-28' }, today), 'Missing Time Out');
  assert.equal(dtrRecordStatus({ ...open, date: '2026-09-28' }, today), 'Incomplete');
});

test('flags records missing verification', () => {
  const complete = { date: '2026-09-28', timeIn: '08:00 AM', timeOut: '05:00 PM', selfieUrl: 'data:', fingerprintVerified: true };
  assert.equal(dtrIssue(complete, today), null);
  assert.equal(dtrRecordStatus(complete, today), 'Complete');
  assert.equal(dtrIssue({ ...complete, selfieUrl: '' }, today), 'Missing Selfie Verification');
  // HR's lists carry hasSelfie instead of the selfie itself.
  assert.equal(dtrIssue({ ...complete, selfieUrl: undefined, hasSelfie: true }, today), null);
  assert.equal(dtrIssue({ ...complete, selfieUrl: undefined, hasSelfie: false }, today), 'Missing Selfie Verification');
  assert.equal(dtrIssue({ ...complete, fingerprintVerified: false }, today), 'Missing Biometric Verification');
  assert.equal(dtrIssue({ date: today, status: 'Absent' }, today), null);
  assert.equal(dtrRecordStatus({ ...complete, late: true }, today), 'Late');
});

test('Verify all shown takes only clean records not yet verified', () => {
  const clean = { id: 'D1', date: '2026-09-28', timeIn: '08:00 AM', timeOut: '05:00 PM', hasSelfie: true, fingerprintVerified: true, fingerprintMethod: 'phone-app', faceVerified: true };
  assert.equal(canVerifyInBulk(clean, today), true);
  // Already verified, not saved, or today's shift still open.
  assert.equal(canVerifyInBulk({ ...clean, verificationAudit: { verifiedBy: 'HR', verifiedAt: '2026-09-29T01:00:00Z' } }, today), false);
  assert.equal(canVerifyInBulk({ ...clean, id: '' }, today), false);
  assert.equal(canVerifyInBulk({ ...clean, date: today, timeOut: null }, today), false);
  // A DTR issue, a selfie not matched, a browser fingerprint, or a record set Absent.
  assert.equal(canVerifyInBulk({ ...clean, hasSelfie: false }, today), false);
  assert.equal(canVerifyInBulk({ ...clean, fingerprintVerified: false }, today), false);
  assert.equal(canVerifyInBulk({ ...clean, faceVerified: false }, today), false);
  assert.equal(canVerifyInBulk({ ...clean, fingerprintMethod: 'browser' }, today), false);
  assert.equal(canVerifyInBulk({ ...clean, timeOutFingerprintMethod: 'browser' }, today), false);
  assert.equal(canVerifyInBulk({ ...clean, status: 'Absent' }, today), false);
  assert.equal(canVerifyInBulk({ ...clean, date: '2026-11-24', lunchOut: null, lunchIn: null }, '2026-11-25'), false);
  // An offline Time In: waiting for HR or rejected is left out; one HR approved is taken.
  const offline = { recordedAt: '2026-09-28T00:00:00Z', reviewReasons: ['The selfie did not match.'] };
  assert.equal(canVerifyInBulk({ ...clean, faceVerified: false, offlineTimeIn: { ...offline, decision: '' } }, today), false);
  assert.equal(canVerifyInBulk({ ...clean, faceVerified: false, offlineTimeIn: { ...offline, decision: 'rejected' } }, today), false);
  assert.equal(canVerifyInBulk({ ...clean, faceVerified: false, offlineTimeIn: { ...offline, decision: 'approved' } }, today), true);
});

test('an offline Time In that failed a check counts in the DTR only once HR approves it', () => {
  const complete = { employeeId: rimhelyn.employeeId, employeeName: 'Rimhelyn', date: '2026-09-28', timeIn: '08:00 AM', timeOut: '05:00 PM', selfieUrl: 'data:', fingerprintVerified: true };
  const passed = { ...complete, offlineTimeIn: { recordedAt: '2026-09-28T00:00:00Z', reviewReasons: [], decision: '' } };
  const pending = { ...complete, offlineTimeIn: { recordedAt: '2026-09-28T00:00:00Z', reviewReasons: ['The selfie did not match.'], decision: '' } };
  const approved = { ...pending, offlineTimeIn: { ...pending.offlineTimeIn, decision: 'approved' } };
  const rejected = { ...pending, offlineTimeIn: { ...pending.offlineTimeIn, decision: 'rejected' } };

  assert.deepEqual([complete, passed, pending, approved, rejected].map(countsInDtr), [true, true, false, true, false]);
  assert.deepEqual([passed, pending, approved, rejected].map(isOfflineReviewPending), [false, true, false, false]);
  assert.equal(dtrIssue(pending, today), 'Offline Time In for Review');
  assert.equal(dtrIssue(approved, today), null);
  // Approved although the phone's fingerprint key was not registered.
  assert.equal(dtrIssue({ ...approved, fingerprintVerified: false }, today), null);
  assert.equal(dtrIssue({ ...approved, timeOut: null }, today), 'Missing Time Out');
  assert.equal(dtrIssue(rejected, today), null);
  assert.equal(employeeDayStatus(rimhelyn, { records: [rejected], date: '2026-09-28' }).status, 'Absent');
  assert.equal(employeeDayStatus(rimhelyn, { records: [pending], date: '2026-09-28' }).status, 'Present');
});

test('an offline Time Out with a doubtful phone clock counts once HR approves or corrects it', () => {
  const record = { date: '2026-09-28', timeIn: '08:00 AM', timeOut: '05:00 PM', selfieUrl: 'data:', fingerprintVerified: true };
  const pending = { ...record, offlineTimeOut: { recordedAt: '2026-09-28T09:00:00Z', reviewReasons: ['The phone clock was 40 minutes behind.'], decision: '' } };
  const approved = { ...pending, offlineTimeOut: { ...pending.offlineTimeOut, decision: 'approved' } };
  const corrected = { ...pending, timeOut: '04:30 PM', offlineTimeOut: { ...pending.offlineTimeOut, decision: 'corrected' } };
  const passed = { ...record, offlineTimeOut: { recordedAt: '2026-09-28T09:00:00Z', reviewReasons: [], decision: '' } };

  assert.deepEqual([record, pending, approved, corrected, passed].map(dtrTimeOut), ['05:00 PM', null, '05:00 PM', '04:30 PM', '05:00 PM']);
  assert.deepEqual([pending, approved, corrected].map(isOfflineTimeOutPending), [true, false, false]);
  assert.equal(dtrIssue(pending, today), 'Offline Time Out for Review');
  assert.equal(dtrIssue(approved, today), null);
  assert.equal(dtrIssue(corrected, today), null);
  // The Time In still counts while its Time Out waits.
  assert.equal(countsInDtr(pending), true);
});

test('the month so far counts each day once, by where the employee worked', () => {
  // October 2026: the 1st is a Thursday; today is Thursday the 8th, before Time In.
  const day = (date, extra = {}) => ({ employeeId: rimhelyn.employeeId, employeeName: 'Rimhelyn', date, timeIn: '08:00 AM', timeOut: '05:00 PM', status: 'Present', ...extra });
  const records = [
    day('2026-10-01', { dutyType: 'office' }),
    day('2026-10-02', { dutyType: 'field' }),
    day('2026-10-03', { dutyType: 'field' }), // Saturday, worked
    day('2026-10-05', { dutyType: 'wfh' }),
    day('2026-10-06', { dutyType: 'field', late: true, timeIn: '08:30 AM' })
  ];
  const requests = [{ type: 'Travel Order', status: 'Approved', employeeId: rimhelyn.employeeId, employeeName: 'Rimhelyn', startDate: '2026-10-07' }];
  assert.deepEqual(monthAttendanceSummary(rimhelyn, { records, requests, today: '2026-10-08' }), {
    present: 1, wfh: 1, field: 2, late: 1, incomplete: 0, leave: 1, absent: 0, rate: 100
  });

  // Without the travel order, the 7th is absent; today is still not counted.
  assert.deepEqual(monthAttendanceSummary(rimhelyn, { records, requests: [], today: '2026-10-08' }), {
    present: 1, wfh: 1, field: 2, late: 1, incomplete: 0, leave: 0, absent: 1, rate: 83
  });

  // No records at all: every past workday is absent, and the first morning has no rate yet.
  assert.equal(monthAttendanceSummary(rimhelyn, { records: [], today: '2026-10-08' }).absent, 5);
  assert.equal(monthAttendanceSummary(rimhelyn, { records: [], today: '2026-10-01' }).rate, null);
});

test('a day with no work to report is a rest day, not an absence', () => {
  const holidays = [{ date: '2026-12-25', name: 'Christmas Day' }];
  const onDate = date => employeeDayStatus(rimhelyn, { records: [], requests: [], date, holidays }).status;
  assert.equal(onDate('2026-12-25'), 'Rest Day'); // Friday, a holiday
  assert.equal(onDate('2026-12-26'), 'Rest Day'); // Saturday
  assert.equal(onDate('2026-12-27'), 'Rest Day'); // Sunday
  assert.equal(onDate('2026-12-24'), 'Absent'); // Thursday
  // Without its holiday in the list, a weekday is a working day.
  assert.equal(employeeDayStatus(rimhelyn, { records: [], requests: [], date: '2026-12-25' }).status, 'Absent');

  // Working on the holiday, or being on approved leave or travel, still shows.
  const worked = { employeeId: rimhelyn.employeeId, employeeName: 'Rimhelyn', date: '2026-12-25', timeIn: '08:00 AM', timeOut: '05:00 PM' };
  assert.equal(employeeDayStatus(rimhelyn, { records: [worked], requests: [], date: '2026-12-25', holidays }).status, 'Present');
  const travel = { type: 'Travel Order', status: 'Approved', employeeId: rimhelyn.employeeId, employeeName: 'Rimhelyn', startDate: '2026-12-26' };
  assert.equal(employeeDayStatus(rimhelyn, { records: [], requests: [travel], date: '2026-12-26', holidays }).status, 'On Travel');
});

test('the month so far leaves holidays out of the absences and the rate', () => {
  const holidays = [{ date: '2026-12-25', name: 'Christmas Day' }];
  const summary = (requests = []) => monthAttendanceSummary(rimhelyn, { records: [], requests, today: '2026-12-28', holidays });
  // December 1 to 25 has 19 weekdays and Christmas is one of them; today is the 28th.
  assert.equal(summary().absent, 18);
  assert.equal(monthAttendanceSummary(rimhelyn, { records: [], today: '2026-12-28' }).absent, 19);
  // A leave across the holiday does not count the holiday as a leave day.
  const leave = { type: 'Leave Request', status: 'Approved', employeeId: rimhelyn.employeeId, employeeName: 'Rimhelyn', startDate: '2026-12-24', endDate: '2026-12-25' };
  assert.equal(summary([leave]).leave, 1);
});

test('total hours run from Time In to Time Out', () => {
  assert.equal(totalHoursWorked({ timeIn: '08:00 AM', timeOut: '05:00 PM' }), '9h 00m');
  assert.equal(totalHoursWorked({ timeIn: '07:52 AM', timeOut: '12:07 PM' }), '4h 15m');
  assert.equal(totalHoursWorked({ timeIn: '12:30 PM', timeOut: '01:05 PM' }), '0h 35m');
  assert.equal(totalHoursWorked({ timeIn: '11:39 PM', timeOut: '11:44 PM' }), '0h 05m');
  assert.equal(totalHoursWorked({ timeIn: '11:45 PM', timeOut: '11:45 PM' }), '0h 00m');
});

test('a Time Out after midnight counts into the next day', () => {
  assert.equal(totalHoursWorked({ timeIn: '10:30 PM', timeOut: '06:30 AM' }), '8h 00m');
  assert.equal(totalHoursWorked({ timeIn: '11:46 PM', timeOut: '12:01 AM' }), '0h 15m');
});

test('total hours stay empty until both times are recorded', () => {
  assert.equal(totalHoursWorked({ timeIn: '11:46 PM', timeOut: null }), '');
  assert.equal(totalHoursWorked({ timeIn: '', timeOut: '05:00 PM' }), '');
  assert.equal(totalHoursWorked({ timeIn: '8 in the morning', timeOut: '05:00 PM' }), '');
  assert.equal(totalHoursWorked({ timeIn: '13:00 PM', timeOut: '05:00 PM' }), '');
  assert.equal(totalHoursWorked(null), '');
});

test('reloading recent attendance keeps the earlier months HR loaded', () => {
  const july = { id: 'jul', date: '2026-07-10', createdAt: '2026-07-10T00:00:00Z', timeOut: '05:00 PM' };
  const juneNotLoaded = { id: 'jun', date: '2026-06-10', createdAt: '2026-06-10T00:00:00Z', timeOut: null };
  const oldVersion = { id: 'sep', date: '2026-09-02', createdAt: '2026-09-02T00:00:00Z', timeOut: null };
  const newVersion = { ...oldVersion, timeOut: '05:00 PM' };
  const merged = mergeRecentAttendance([oldVersion, july, juneNotLoaded], [newVersion], new Set(['2026-07']), '2026-09-01');
  assert.deepEqual(merged.map(record => record.id), ['sep', 'jul']);
  assert.equal(merged[0].timeOut, '05:00 PM');
});

test('loading an earlier month replaces its records and keeps newest first', () => {
  const recent = [{ id: 'oct', date: '2026-10-01', createdAt: '2026-10-01T00:00:00Z' }];
  const july = [{ id: 'jul', date: '2026-07-10', createdAt: '2026-07-10T00:00:00Z' }];
  const merged = mergeAttendanceMonth(mergeAttendanceMonth(recent, july), [{ ...july[0], status: 'Absent' }]);
  assert.deepEqual(merged.map(record => record.id), ['oct', 'jul']);
  assert.equal(merged[1].status, 'Absent');
});

test('an employee a Travel Order includes is On Travel on its days, not absent', async () => {
  const { employeeDayStatus } = await import('./hrAttendance.js');
  const maria = { employeeId: 'E7', email: 'maria@dilg.gov.ph', name: 'Maria Santos' };
  const order = { type: 'Travel Order', status: 'Approved', startDate: '2026-11-10', endDate: '2026-11-12', employeeId: 'E1', employeeName: 'Juan Dela Cruz', companions: [{ employeeId: 'E7', name: 'Maria Santos' }] };
  assert.equal(employeeDayStatus(maria, { requests: [order], date: '2026-11-11' }).status, 'On Travel');
  assert.equal(employeeDayStatus(maria, { requests: [{ ...order, status: 'Pending' }], date: '2026-11-11' }).status, 'Absent');
  assert.equal(employeeDayStatus({ employeeId: 'E8', name: 'Pedro Cruz' }, { requests: [order], date: '2026-11-11' }).status, 'Absent');
});

test('today, HR sees Not Yet In, then No Time In, and Absent only once the day is over', () => {
  // Monday 2026-11-23: 7:00 AM to 4:00 PM. Tuesday 2026-11-24 (flexitime): 9:00 AM, ends 6:00 PM.
  assert.equal(monitoringStatus('Absent', '2026-11-23', '2026-11-23', 6 * 60 + 50), 'Not Yet In');
  assert.equal(monitoringStatus('Absent', '2026-11-23', '2026-11-23', 7 * 60 + 5), 'No Time In');
  assert.equal(monitoringStatus('Absent', '2026-11-23', '2026-11-23', 15 * 60 + 59), 'No Time In');
  assert.equal(monitoringStatus('Absent', '2026-11-23', '2026-11-23', 16 * 60), 'Absent');
  assert.equal(monitoringStatus('Absent', '2026-11-24', '2026-11-24', 8 * 60 + 30), 'Not Yet In');
  assert.equal(monitoringStatus('Absent', '2026-11-24', '2026-11-24', 9 * 60), 'No Time In');
  assert.equal(monitoringStatus('Absent', '2026-11-24', '2026-11-24', 17 * 60 + 59), 'No Time In');
  assert.equal(monitoringStatus('Absent', '2026-11-24', '2026-11-24', 18 * 60), 'Absent');
  // A record HR set to Absent stays Absent.
  assert.equal(monitoringStatus('Absent', '2026-11-24', '2026-11-24', 10 * 60, { status: 'Absent', timeIn: '08:00 AM' }), 'Absent');
  // An earlier day, or another status, is as it was.
  assert.equal(monitoringStatus('Absent', '2026-11-20', '2026-11-24', 8 * 60), 'Absent');
  assert.equal(monitoringStatus('Late', '2026-11-24', '2026-11-24', 8 * 60), 'Late');
});

test('the day ends at 4:00 PM on a Monday and 6:00 PM on the flexitime days', () => {
  assert.equal(dayEndText('2026-11-23'), '4:00 PM');
  assert.equal(dayEndText('2026-11-24'), '6:00 PM');
});

test('absent days start when the office began using WorkMate, and skip leave, travel, and rest days', () => {
  const ana = { employeeId: 'E1', name: 'Ana Reyes', accountStatus: 'Active' };
  const ben = { employeeId: 'E2', name: 'Ben Cruz', accountStatus: 'Active', dateHired: '2026-11-18' };
  const records = [
    { employeeId: 'E1', date: '2026-11-16', timeIn: '07:55 AM', timeOut: '05:00 PM' }, // Monday: first day used
    { employeeId: 'E1', date: '2026-11-18', timeIn: '08:00 AM', timeOut: '05:00 PM' }
  ];
  const requests = [{ type: 'Leave Request', status: 'Approved', employeeId: 'E1', startDate: '2026-11-19', endDate: '2026-11-19' }];
  // Friday Nov 20 at 6:00 PM, when the day is over.
  const days = absentDays({ employees: [ana, ben], records, requests, from: '2026-11-01', today: '2026-11-20', minutes: 18 * 60 });
  const listed = days.map(day => `${day.employee.employeeId} ${day.date}`).sort();
  // Ana: Nov 17 and 20 (Nov 19 is leave). Ben: from his hiring, Nov 18 to 20. Nothing before Nov 16.
  assert.deepEqual(listed, ['E1 2026-11-17', 'E1 2026-11-20', 'E2 2026-11-18', 'E2 2026-11-19', 'E2 2026-11-20']);
  // Before its office hours are over, today is not counted yet: someone not in yet may be late.
  const early = absentDays({ employees: [ana, ben], records, requests, from: '2026-11-01', today: '2026-11-20', minutes: 17 * 60 + 59 });
  assert.equal(early.some(day => day.date === '2026-11-20'), false);
  // Monday's hours end at 4:00 PM.
  const mondayEnd = absentDays({ employees: [ana], records, requests, from: '2026-11-01', today: '2026-11-23', minutes: 16 * 60 });
  assert.equal(mondayEnd.some(day => day.date === '2026-11-23'), true);
  // A half day is not an absence.
  const half = [...records, { employeeId: 'E1', date: '2026-11-17', timeIn: '12:40 PM', timeOut: '05:00 PM' }];
  assert.equal(absentDays({ employees: [ana], records: half, requests, from: '2026-11-01', today: '2026-11-20', minutes: 18 * 60 }).some(day => day.date === '2026-11-17'), false);
  // Weekends are not absences.
  const monday = absentDays({ employees: [ana], records, requests, from: '2026-11-01', today: '2026-11-23', minutes: 10 * 60 });
  assert.equal(monday.some(day => ['2026-11-21', '2026-11-22'].includes(day.date)), false);
  assert.deepEqual(absentDays({ employees: [ana], records: [], today: '2026-11-20', minutes: 600 }), []);
  // Up to `to`, for one month that has ended.
  const upTo = absentDays({ employees: [ana, ben], records, requests, from: '2026-11-01', to: '2026-11-18', today: '2026-11-24', minutes: 10 * 60 });
  assert.deepEqual(upTo.map(day => `${day.employee.employeeId} ${day.date}`).sort(), ['E1 2026-11-17', 'E2 2026-11-18']);
});

test('a separated employee is absent only up to the day of separation', () => {
  // Ana left on Wednesday, November 18; her account is now Inactive.
  const ana = { employeeId: 'E1', name: 'Ana Reyes', accountStatus: 'Inactive', separationDate: '2026-11-18', separationReason: 'Resignation' };
  const records = [{ employeeId: 'E1', date: '2026-11-16', timeIn: '07:55 AM', timeOut: '04:00 PM' }];
  const days = absentDays({ employees: [ana], records, requests: [], from: '2026-11-01', today: '2026-11-24', minutes: 18 * 60 });
  assert.deepEqual(days.map(day => day.date), ['2026-11-18', '2026-11-17']);
  // An Inactive account with no separation date is not counted, as before.
  const inactive = { ...ana, separationDate: '', separationReason: '' };
  assert.deepEqual(absentDays({ employees: [inactive], records, requests: [], from: '2026-11-01', today: '2026-11-24', minutes: 18 * 60 }), []);
});

test('the reminder lists the days still missing a log, for HR to correct', () => {
  const day = (date, extra = {}) => ({ id: date, date, timeIn: '07:00 AM', ...extra });
  const records = [
    day('2026-11-24', { timeIn: '07:05 AM' }), // today, still on duty: not yet
    day('2026-11-23', { timeIn: '07:20 AM' }), // no Time Out
    day('2026-11-20', { lunchOut: '12:00 PM', lunchIn: '01:00 PM', timeOut: '04:00 PM' }), // complete
    day('2026-11-18', { timeIn: '06:42 PM' }), // no Time Out (afternoon only: no lunch logs)
    day('2026-11-17', { lunchOut: '12:00 PM', timeOut: '04:00 PM' }), // no Lunch In
    day('2026-11-16', { offlineTimeIn: { reviewReasons: ['x'], decision: 'rejected' } }), // left out of the DTR
    day('2026-11-13', { status: 'Absent' }), // set Absent by HR
    day('2026-09-30') // before last month
  ];
  const days = incompleteDtrDays({ records, today: '2026-11-24', from: '2026-10-01' });
  assert.deepEqual(days.map(item => `${item.date} ${item.missing}`), [
    '2026-11-23 Missing Time Out',
    '2026-11-18 Missing Time Out',
    '2026-11-17 Missing Lunch In'
  ]);
  // Today counts once it is timed out without its lunch logs.
  const timedOut = [day('2026-11-24', { timeOut: '04:00 PM' })];
  assert.deepEqual(incompleteDtrDays({ records: timedOut, today: '2026-11-24', from: '2026-10-01' }).map(item => item.missing), ['Missing Lunch Out']);
});
