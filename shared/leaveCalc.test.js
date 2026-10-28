import assert from 'node:assert/strict';
import test from 'node:test';
import { countLeaveDays, fixedHolidays, leaveCharge, leaveCreditField, monthlyEarnedCredits, monthServiceDays, monthWithoutPayDays } from './leaveCalc.js';

test('a leave counts Monday to Friday, without holidays', () => {
  // Mon Nov 2 to Fri Nov 6, 2026.
  assert.equal(countLeaveDays('2026-11-02', '2026-11-06'), 5);
  // Fri to Mon skips the weekend.
  assert.equal(countLeaveDays('2026-11-06', '2026-11-09'), 2);
  assert.equal(countLeaveDays('2026-11-07', '2026-11-08'), 0);
  // Bonifacio Day (Mon Nov 30) is not a leave day.
  assert.equal(countLeaveDays('2026-11-30', '2026-12-01', [{ date: '2026-11-30', name: 'Bonifacio Day' }]), 1);
  assert.equal(countLeaveDays('2026-11-30', '2026-12-01', ['2026-11-30']), 1);
  assert.equal(countLeaveDays('2026-11-05', '2026-11-04'), 0);
  assert.equal(countLeaveDays('', ''), 0);
});

test('a month of service earns 1.25 days, less for days without pay, as the CSC table has it', () => {
  assert.equal(monthlyEarnedCredits(0), 1.25);
  assert.equal(monthlyEarnedCredits(0.5), 1.229);
  assert.equal(monthlyEarnedCredits(1), 1.208);
  assert.equal(monthlyEarnedCredits(2), 1.167);
  assert.equal(monthlyEarnedCredits(15), 0.625);
  assert.equal(monthlyEarnedCredits(30), 0);
  assert.equal(monthlyEarnedCredits(31), 0);
});

test('a month only partly in service earns 1.25/30 day for each day of service, as CSC Table II has it', () => {
  assert.equal(monthlyEarnedCredits(0, 1), 0.042);
  assert.equal(monthlyEarnedCredits(0, 15), 0.625);
  assert.equal(monthlyEarnedCredits(0, 16), 0.667);
  assert.equal(monthlyEarnedCredits(0, 22), 0.917);
  assert.equal(monthlyEarnedCredits(0, 24), 1);
  assert.equal(monthlyEarnedCredits(0, 30), 1.25);
  assert.equal(monthlyEarnedCredits(0, 0), 0);
  // Days without pay come out of the days of service.
  assert.equal(monthlyEarnedCredits(1, 16), 0.625);
  assert.equal(monthlyEarnedCredits(20, 16), 0);
});

test('the days of service in a month count from the day hired to the end of the month, at most 30', () => {
  // Hired before the month, on its first day, or on a date not known: a full month.
  assert.equal(monthServiceDays('2026-10', '2020-01-06'), 30);
  assert.equal(monthServiceDays('2026-10', '2026-10-01'), 30);
  assert.equal(monthServiceDays('2026-10', ''), 30);
  assert.equal(monthServiceDays('2026-10', 'January 6, 2020'), 30);
  // Hired during the month: October 16 to 31 is 16 days, June 16 to 30 is 15.
  assert.equal(monthServiceDays('2026-10', '2026-10-16'), 16);
  assert.equal(monthServiceDays('2026-06', '2026-06-16'), 15);
  assert.equal(monthServiceDays('2026-02', '2026-02-15'), 14);
  assert.equal(monthServiceDays('2026-10', '2026-10-31'), 1);
  assert.equal(monthServiceDays('2026-10', '2026-10-02'), 30);
  // Hired after the month: no service that month.
  assert.equal(monthServiceDays('2026-10', '2026-11-03'), 0);
});

test('a month\'s days without pay come from uncovered approved leave and tardiness charged without pay', () => {
  const requests = [
    { type: 'Leave Request', status: 'Approved', startDate: '2026-10-05', creditCharge: { withoutPayDays: 1.5 } },
    { type: 'Leave Request', status: 'Approved', startDate: '2026-11-02', creditCharge: { withoutPayDays: 2 } },
    { type: 'Leave Request', status: 'Pending', startDate: '2026-10-12', creditCharge: null }
  ];
  const tardinessDeductions = [{ month: '2026-10', withoutPayDays: 0.081 }];
  assert.equal(monthWithoutPayDays('2026-10', { requests, tardinessDeductions }), 1.581);
  assert.equal(monthWithoutPayDays('2026-11', { requests, tardinessDeductions }), 2);
  assert.equal(monthWithoutPayDays('2026-09', { requests, tardinessDeductions }), 0);
});

test('sick leave comes out of sick leave, then vacation leave, then is without pay', () => {
  assert.deepEqual(leaveCharge({ field: 'sickLeaveCredits', days: 3, vacation: 10, sick: 5 }),
    { sickLeaveDays: 3, vacationLeaveDays: 0, withoutPayDays: 0, vacationLeaveCredits: 10, sickLeaveCredits: 2 });
  assert.deepEqual(leaveCharge({ field: 'sickLeaveCredits', days: 4, vacation: 1.5, sick: 2 }),
    { sickLeaveDays: 2, vacationLeaveDays: 1.5, withoutPayDays: 0.5, vacationLeaveCredits: 0, sickLeaveCredits: 0 });
});

test('vacation leave comes out of vacation leave only, and the rest is without pay', () => {
  assert.deepEqual(leaveCharge({ field: 'vacationLeaveCredits', days: 3, vacation: 2.25, sick: 15 }),
    { sickLeaveDays: 0, vacationLeaveDays: 2.25, withoutPayDays: 0.75, vacationLeaveCredits: 0, sickLeaveCredits: 15 });
  assert.equal(leaveCreditField('Mandatory / Forced Leave'), 'vacationLeaveCredits');
  assert.equal(leaveCreditField('Sick Leave'), 'sickLeaveCredits');
  assert.equal(leaveCreditField('Maternity Leave'), null);
});

test('the fixed-date holidays of a year include National Heroes Day on the last Monday of August', () => {
  const holidays = fixedHolidays(2026);
  assert.ok(holidays.some(holiday => holiday.date === '2026-08-31' && holiday.name === 'National Heroes Day'));
  assert.equal(fixedHolidays(2027).find(holiday => holiday.name === 'National Heroes Day').date, '2027-08-30');
  assert.ok(holidays.some(holiday => holiday.date === '2026-12-25'));
});
