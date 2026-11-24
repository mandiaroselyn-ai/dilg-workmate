import assert from 'node:assert/strict';
import test from 'node:test';
import { habitualAttendance, isHabitualPattern } from './habitualAttendance.js';
import { dtrDayLogs, dtrTimesLateAndEarly } from './dtrDay.js';

test('a late morning, a late return from lunch, and each early departure are one time each', () => {
  const day = '2026-11-24'; // Tuesday
  assert.deepEqual(dtrTimesLateAndEarly(dtrDayLogs({ date: day, timeIn: '09:10 AM', lunchOut: '11:50 AM', lunchIn: '01:05 PM', timeOut: '05:00 PM' }), day), { lateTimes: 2, earlyTimes: 2 });
  assert.deepEqual(dtrTimesLateAndEarly(dtrDayLogs({ date: day, timeIn: '08:00 AM', lunchOut: '12:00 PM', lunchIn: '01:00 PM', timeOut: '05:00 PM' }), day), { lateTimes: 0, earlyTimes: 0 });
  // A missed morning is a time late, and a missed afternoon a time undertime.
  assert.deepEqual(dtrTimesLateAndEarly(dtrDayLogs({ date: day, timeIn: '01:00 PM', timeOut: '06:00 PM' }), day), { lateTimes: 1, earlyTimes: 0 });
  assert.deepEqual(dtrTimesLateAndEarly(dtrDayLogs({ date: day, timeIn: '08:00 AM', timeOut: '12:00 PM' }), day), { lateTimes: 0, earlyTimes: 1 });
});

test('the months that met a rule are habitual in one semester or in a row', () => {
  assert.equal(isHabitualPattern(['2026-02', '2026-05'], 2), true);
  // June and July are in different semesters, but in a row.
  assert.equal(isHabitualPattern(['2026-06', '2026-07'], 2), true);
  assert.equal(isHabitualPattern(['2026-05', '2026-08'], 2), false);
  assert.equal(isHabitualPattern(['2026-03'], 2), false);
  // Absenteeism needs three.
  assert.equal(isHabitualPattern(['2026-01', '2026-03', '2026-06'], 3), true);
  assert.equal(isHabitualPattern(['2026-05', '2026-06', '2026-07'], 3), true);
  assert.equal(isHabitualPattern(['2026-05', '2026-06', '2026-08'], 3), false);
});

// Ten late mornings in each of October and November 2026, on weekdays.
const ana = { employeeId: 'E1', name: 'Ana Reyes', accountStatus: 'Active' };
const ben = { employeeId: 'E2', name: 'Ben Cruz', accountStatus: 'Active' };
const weekdays = month => Array.from({ length: 30 }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`)
  .filter(date => ![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()));
const lateDays = (employee, month, count) => weekdays(month).slice(0, count).map(date => ({
  employeeId: employee.employeeId, employeeName: employee.name, date, timeIn: '09:15 AM', lunchOut: '12:00 PM', lunchIn: '01:00 PM', timeOut: '06:00 PM'
}));

test('late 10 times a month for two months in a semester is habitual tardiness', () => {
  const records = [...lateDays(ana, '2026-10', 10), ...lateDays(ana, '2026-11', 10), ...lateDays(ben, '2026-10', 10)];
  const rows = habitualAttendance({ employees: [ana, ben], records, year: '2026', today: '2026-11-24' });
  const tardy = rows.filter(row => row.rule.id === 'tardiness');
  assert.deepEqual(tardy.map(row => `${row.employee.employeeId} ${row.status}`), ['E1 Habitual', 'E2 Watch']);
  assert.deepEqual(tardy[0].months.map(item => `${item.month} ${item.count} ${item.meets}`), ['2026-10 10 true', '2026-11 10 true']);
  assert.equal(tardy[1].monthsMet, 1);
  // Another year, or nobody near a rule, shows nothing.
  assert.deepEqual(habitualAttendance({ employees: [ana, ben], records, year: '2025', today: '2026-11-24' }), []);
});

test('close to the count this month is worth watching; a past month below it is not', () => {
  const near = habitualAttendance({ employees: [ana], records: lateDays(ana, '2026-11', 7), year: '2026', today: '2026-11-24' });
  assert.deepEqual(near.map(row => `${row.rule.id} ${row.status} ${row.thisMonth}`), ['tardiness Watch 7']);
  assert.deepEqual(habitualAttendance({ employees: [ana], records: lateDays(ana, '2026-10', 7), year: '2026', today: '2026-11-24' }), []);
});

test('more than 2.5 days absent a month for three months in a row is habitual absenteeism', () => {
  const absent = (month, days) => weekdays(month).slice(0, days).map(date => ({ date, employee: ana }));
  const absences = [...absent('2026-08', 3), ...absent('2026-09', 3), ...absent('2026-10', 3), ...absent('2026-11', 2)];
  const rows = habitualAttendance({ employees: [ana], absences, year: '2026', today: '2026-11-24' });
  assert.deepEqual(rows.map(row => `${row.rule.id} ${row.status} ${row.monthsMet}`), ['absences Habitual 3']);
  // Two days a month never meets it.
  assert.deepEqual(habitualAttendance({ employees: [ana], absences: absent('2026-09', 2), year: '2026', today: '2026-11-24' }), []);
});

test('the absences of one old account are not counted for another sharing its Employee ID', () => {
  const lara = { _id: 'a1', employeeId: 'DILG-2026-7689', name: 'Lara Montiano', accountStatus: 'Active' };
  const rose = { _id: 'a2', employeeId: 'DILG-2026-7689', name: 'Roselyn Mandia', accountStatus: 'Active' };
  const absent = (person, month, days) => weekdays(month).slice(0, days).map(date => ({ date, employee: person }));
  const absences = ['2026-08', '2026-09', '2026-10'].flatMap(month => absent(lara, month, 3));
  const rows = habitualAttendance({ employees: [lara, rose], absences, year: '2026', today: '2026-11-24' });
  assert.deepEqual(rows.map(row => `${row.employee.name} ${row.rule.id} ${row.status}`), ['Lara Montiano absences Habitual']);
  // A copy of the account (as after a save) is still the same account.
  assert.equal(habitualAttendance({ employees: [{ ...lara }], absences, year: '2026', today: '2026-11-24' }).length, 1);
  // Without database IDs, the Employee ID and the name tell them apart.
  const [laraNoId, roseNoId] = [{ ...lara, _id: undefined }, { ...rose, _id: undefined }];
  const byName = ['2026-08', '2026-09', '2026-10'].flatMap(month => absent(laraNoId, month, 3));
  assert.deepEqual(habitualAttendance({ employees: [{ ...laraNoId }, roseNoId], absences: byName, year: '2026', today: '2026-11-24' }).map(row => row.employee.name), ['Lara Montiano']);
});
