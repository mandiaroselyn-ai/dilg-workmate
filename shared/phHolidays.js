// The Philippine national holidays WorkMate adds by itself (backend holidayModel), so HR does not
// have to: for a year whose proclamation is listed in PROCLAIMED, its holidays as proclaimed; for
// any other year, the ones the law fixes (HOLIDAYS_BY_LAW). Each is { date, name, kind, source }.
// A special working day (such as the EDSA anniversary, Feb. 25) is a working day, so it is not
// listed. HR adds local holidays (the province's or a town's) and any proclaimed later, such as
// the Eid holidays of a year whose proclamation came after its list here.

import { DILG_OFFICE_GROUPS } from './dilgAssignments.js';
import { MARINDUQUE_MUNICIPALITIES, MARINDUQUE_OFFICES } from './marinduqueLocations.js';

// The Provincial Office's sections and units, all in the Capitol in Boac.
const PROVINCIAL_OFFICES = DILG_OFFICE_GROUPS.find(group => group.label === 'Provincial Office')?.offices || [];
// The towns a local holiday can be for.
export const HOLIDAY_TOWNS = Object.keys(MARINDUQUE_MUNICIPALITIES);

export const REGULAR_HOLIDAY = 'Regular Holiday';
export const SPECIAL_NON_WORKING_DAY = 'Special Non-Working Day';
const R = REGULAR_HOLIDAY;
const S = SPECIAL_NON_WORKING_DAY;

// Each year's holidays as proclaimed: [date, name, kind, the proclamation if not the year's main one].
const PROCLAIMED = {
  2026: {
    source: 'Proclamation No. 1006, s. 2025',
    holidays: [
      ['2026-01-01', "New Year's Day", R],
      ['2026-02-17', 'Chinese New Year', S],
      ['2026-03-20', "Eid'l Fitr", R, 'Proclamation No. 1189, s. 2026'],
      ['2026-04-02', 'Maundy Thursday', R],
      ['2026-04-03', 'Good Friday', R],
      ['2026-04-04', 'Black Saturday', S],
      ['2026-04-09', 'Araw ng Kagitingan', R],
      ['2026-05-01', 'Labor Day', R],
      ['2026-05-27', "Eid'l Adha", R, 'Proclamation No. 1264, s. 2026'],
      ['2026-06-12', 'Independence Day', R],
      ['2026-08-21', 'Ninoy Aquino Day', S],
      ['2026-08-31', 'National Heroes Day', R],
      ['2026-11-01', "All Saints' Day", S],
      ['2026-11-02', "All Souls' Day", S],
      ['2026-11-30', 'Bonifacio Day', R],
      ['2026-12-08', 'Feast of the Immaculate Conception of Mary', S],
      ['2026-12-24', 'Christmas Eve', S],
      ['2026-12-25', 'Christmas Day', R],
      ['2026-12-30', 'Rizal Day', R],
      ['2026-12-31', 'Last Day of the Year', S]
    ]
  },
  // The Eid holidays of 2027 are proclaimed later, once their dates are known.
  2027: {
    source: 'Proclamation No. 1427, s. 2026',
    holidays: [
      ['2027-01-01', "New Year's Day", R],
      ['2027-02-06', 'Chinese New Year', S],
      ['2027-03-25', 'Maundy Thursday', R],
      ['2027-03-26', 'Good Friday', R],
      ['2027-03-27', 'Black Saturday', S],
      ['2027-04-09', 'Araw ng Kagitingan', R],
      ['2027-05-01', 'Labor Day', R],
      ['2027-06-12', 'Independence Day', R],
      ['2027-08-21', 'Ninoy Aquino Day', S],
      ['2027-08-30', 'National Heroes Day', R],
      ['2027-11-01', "All Saints' Day", S],
      ['2027-11-02', "All Souls' Day", S],
      ['2027-11-30', 'Bonifacio Day', R],
      ['2027-12-08', 'Feast of the Immaculate Conception of Mary', S],
      ['2027-12-24', 'Christmas Eve', S],
      ['2027-12-25', 'Christmas Day', R],
      ['2027-12-30', 'Rizal Day', R],
      ['2027-12-31', 'Last Day of the Year', S]
    ]
  }
};

const iso = date => date.toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

// Easter Sunday of `year` (Gregorian calendar), for Holy Week.
const easterSunday = year => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
};

// The last Monday of August of `year`: National Heroes Day.
const lastMondayOfAugust = year => {
  const date = new Date(Date.UTC(year, 7, 31));
  return addDays(date, -((date.getUTCDay() + 6) % 7));
};

// The holidays the law fixes, for a year with no proclamation listed: the regular holidays of
// Executive Order No. 292, Book I, Sec. 26, as amended by Republic Act No. 9492, and the special
// days of the same law, RA 9256 (Ninoy Aquino Day), and RA 10966 (the Immaculate Conception). The
// Eid holidays (RA 9177 and RA 9849) and Chinese New Year follow the lunar calendars, and days
// such as Black Saturday are added only by each year's proclamation, so HR adds those.
export const holidaysByLaw = year => {
  const easter = easterSunday(year);
  return [
    [`${year}-01-01`, "New Year's Day", R],
    [iso(addDays(easter, -3)), 'Maundy Thursday', R],
    [iso(addDays(easter, -2)), 'Good Friday', R],
    [`${year}-04-09`, 'Araw ng Kagitingan', R],
    [`${year}-05-01`, 'Labor Day', R],
    [`${year}-06-12`, 'Independence Day', R],
    [`${year}-08-21`, 'Ninoy Aquino Day', S],
    [iso(lastMondayOfAugust(year)), 'National Heroes Day', R],
    [`${year}-11-01`, "All Saints' Day", S],
    [`${year}-11-30`, 'Bonifacio Day', R],
    [`${year}-12-08`, 'Feast of the Immaculate Conception of Mary', S],
    [`${year}-12-25`, 'Christmas Day', R],
    [`${year}-12-30`, 'Rizal Day', R],
    [`${year}-12-31`, 'Last Day of the Year', S]
  ]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, name, kind]) => ({ date, name, kind, source: 'Fixed by law (EO 292 as amended by RA 9492)' }));
};

// Marinduque's own holidays (every office in WorkMate is in Marinduque). `place` is '' for the whole
// province, or the town whose offices alone have the day off. The province's every year by law:
// Battle of Paye Day (RA 9749) and Battle of Pulang Lupa Day (RA 6702). The others are proclaimed
// each year, so each year's are listed as proclaimed (the 2026 proclamations index lists these two
// for Marinduque).
const MARINDUQUE_BY_LAW = [
  ['07-31', 'Battle of Paye Day', 'Republic Act No. 9749'],
  ['09-13', 'Battle of Pulang Lupa Day', 'Republic Act No. 6702']
];
const MARINDUQUE_PROCLAIMED = {
  2026: [
    ['2026-02-21', 'Araw ng Marinduque', '', 'Proclamation No. 1130, s. 2026'],
    ['2026-08-20', 'Gasan Founding Anniversary', 'Gasan', 'Proclamation No. 1381, s. 2026']
  ]
};

const placeKind = place => `${SPECIAL_NON_WORKING_DAY} in ${place || 'Marinduque'}`;

export const marinduqueHolidays = year => [
  ...MARINDUQUE_BY_LAW.map(([day, name, source]) => ({ date: `${year}-${day}`, name, kind: placeKind(''), place: '', source })),
  ...(MARINDUQUE_PROCLAIMED[year] || []).map(([date, name, place, source]) => ({ date, name, kind: placeKind(place), place, source }))
];

// The holidays of `year` WorkMate adds by itself, the national ones and Marinduque's, earliest first.
export const builtInHolidays = year => {
  const proclaimed = PROCLAIMED[year];
  const national = proclaimed
    ? proclaimed.holidays.map(([date, name, kind, source]) => ({ date, name, kind, source: source || proclaimed.source }))
    : holidaysByLaw(year);
  return [...national.map(holiday => ({ ...holiday, place: '' })), ...marinduqueHolidays(year)]
    .sort((a, b) => a.date.localeCompare(b.date));
};

// The town a person (or an attendance record) works in: their assigned station's, the MLGOO
// office's ("Office of the MLGOO - Gasan"), or Boac for the Provincial Office's sections, which
// are in the Capitol in Boac. '' when it cannot be told.
export const workTownOf = person => {
  const station = MARINDUQUE_OFFICES.find(office => office.name === person?.assignedStation);
  if (station) return station.municipality;
  const office = String(person?.office || person?.employeeOffice || '');
  const mlgoo = /Office of the MLGOO - (.+)$/.exec(office);
  if (mlgoo) return mlgoo[1].trim();
  return PROVINCIAL_OFFICES.includes(office) ? 'Boac' : '';
};

// The holidays that are a day off for `person`: the province-wide and national ones, and their
// own town's.
export const holidaysFor = (holidays = [], person) => {
  if (!holidays.some(holiday => holiday?.place)) return holidays;
  const town = workTownOf(person);
  return holidays.filter(holiday => !holiday?.place || holiday.place === town);
};
