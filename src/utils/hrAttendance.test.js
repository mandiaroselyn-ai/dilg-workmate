import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeEmployees,
  dtrIssue,
  dtrRecordStatus,
  employeeDayStatus,
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
  assert.equal(dtrIssue({ ...complete, fingerprintVerified: false }, today), 'Missing Biometric Verification');
  assert.equal(dtrIssue({ date: today, status: 'Absent' }, today), null);
  assert.equal(dtrRecordStatus({ ...complete, late: true }, today), 'Late');
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
