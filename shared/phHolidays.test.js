import assert from 'node:assert/strict';
import test from 'node:test';
import { builtInHolidays, holidaysByLaw, holidaysFor, REGULAR_HOLIDAY, SPECIAL_NON_WORKING_DAY, workTownOf } from './phHolidays.js';

test('Marinduque has its own holidays, by law every year and as proclaimed', () => {
  const days = Object.fromEntries(builtInHolidays(2026).map(holiday => [holiday.date, holiday]));
  assert.deepEqual(days['2026-07-31'], { date: '2026-07-31', name: 'Battle of Paye Day', kind: 'Special Non-Working Day in Marinduque', place: '', source: 'Republic Act No. 9749' });
  assert.equal(days['2026-09-13'].source, 'Republic Act No. 6702');
  assert.equal(days['2026-02-21'].source, 'Proclamation No. 1130, s. 2026');
  assert.deepEqual([days['2026-08-20'].place, days['2026-08-20'].kind], ['Gasan', 'Special Non-Working Day in Gasan']);
  assert.equal(days['2026-01-01'].place, '');
  // A later year has the two set by law.
  const later = builtInHolidays(2030).filter(holiday => holiday.kind.endsWith('in Marinduque')).map(holiday => holiday.date);
  assert.deepEqual(later, ['2030-07-31', '2030-09-13']);
});

test('a town\'s holiday is a day off only for the offices in that town', () => {
  assert.equal(workTownOf({ assignedStation: 'DILG Municipal Office - Gasan' }), 'Gasan');
  assert.equal(workTownOf({ office: 'Office of the MLGOO - Santa Cruz' }), 'Santa Cruz');
  assert.equal(workTownOf({ office: 'Finance and Administrative Section (FAS)' }), 'Boac');
  assert.equal(workTownOf({ assignedStation: 'DILG Provincial Office', office: 'Office of the MLGOO - Gasan' }), 'Boac');
  assert.equal(workTownOf({ employeeOffice: 'Office of the MLGOO - Mogpog' }), 'Mogpog');
  assert.equal(workTownOf({ office: 'Somewhere' }), '');
  const holidays = [
    { date: '2026-08-20', name: 'Gasan Founding Anniversary', place: 'Gasan' },
    { date: '2026-08-21', name: 'Ninoy Aquino Day', place: '' }
  ];
  assert.deepEqual(holidaysFor(holidays, { office: 'Office of the MLGOO - Gasan' }).map(holiday => holiday.date), ['2026-08-20', '2026-08-21']);
  assert.deepEqual(holidaysFor(holidays, { office: 'Office of the MLGOO - Boac' }).map(holiday => holiday.date), ['2026-08-21']);
  assert.deepEqual(holidaysFor(holidays, null).map(holiday => holiday.date), ['2026-08-21']);
});

const byDate = list => Object.fromEntries(list.map(holiday => [holiday.date, holiday]));

test('2026 has the holidays of Proclamation No. 1006 and the two Eid proclamations', () => {
  const list = builtInHolidays(2026);
  const days = byDate(list);
  assert.equal(list.filter(holiday => holiday.kind === REGULAR_HOLIDAY).length, 12);
  assert.equal(list.filter(holiday => holiday.kind === SPECIAL_NON_WORKING_DAY).length, 8);
  assert.equal(days['2026-04-03'].name, 'Good Friday');
  assert.equal(days['2026-08-31'].name, 'National Heroes Day');
  assert.equal(days['2026-03-20'].source, 'Proclamation No. 1189, s. 2026');
  assert.equal(days['2026-05-27'].source, 'Proclamation No. 1264, s. 2026');
  assert.equal(days['2026-11-02'].kind, SPECIAL_NON_WORKING_DAY);
  assert.equal(days['2026-01-01'].source, 'Proclamation No. 1006, s. 2025');
  // The EDSA anniversary is a special working day.
  assert.equal(days['2026-02-25'], undefined);
});

test('2027 has the holidays of Proclamation No. 1427', () => {
  const list = builtInHolidays(2027);
  assert.equal(list.filter(holiday => holiday.kind === REGULAR_HOLIDAY).length, 10);
  assert.equal(list.filter(holiday => holiday.kind === SPECIAL_NON_WORKING_DAY).length, 8);
  const days = byDate(list);
  assert.equal(days['2027-03-25'].name, 'Maundy Thursday');
  assert.equal(days['2027-02-06'].name, 'Chinese New Year');
  assert.equal(days['2027-08-30'].name, 'National Heroes Day');
});

test('another year has the holidays the law fixes, with Holy Week from Easter', () => {
  // Easter 2028 is April 16.
  const days = byDate(builtInHolidays(2028));
  assert.equal(days['2028-04-13'].name, 'Maundy Thursday');
  assert.equal(days['2028-04-14'].name, 'Good Friday');
  // The last Monday of August 2028.
  assert.equal(days['2028-08-28'].name, 'National Heroes Day');
  // 14 fixed by national law, and Marinduque's two.
  assert.equal(Object.keys(days).length, 16);
  // The law's dates agree with the proclaimed ones.
  const proclaimed = byDate(builtInHolidays(2027));
  for (const holiday of holidaysByLaw(2027)) assert.equal(proclaimed[holiday.date]?.name, holiday.name, holiday.date);
});
