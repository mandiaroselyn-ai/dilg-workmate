import { dtrEntry } from './dtrMonth.js';
import { matchesAttendanceEmployee, normalizeAttendanceValue } from './attendanceIdentity.js';
import { employeesInServiceSince } from '../../shared/separation.js';

// The CSC's rules on habitual tardiness, undertime, and absenteeism, which HR watches for: each
// counts something a month (`meets`, with `watchAt` as the count that is getting close), and the
// pattern is habitual when `months` such months fall in one semester or come in a row in a year.
// - Habitual tardiness: late 10 times a month, whatever the minutes, for at least 2 months in a
//   semester or 2 months in a row (CSC MC No. 04, s. 1991). A missed morning is tardiness too
//   (CSC MC No. 17, s. 2010).
// - Habitual undertime: undertime 10 times a month on the same terms (CSC MC No. 16, s. 2010). A
//   missed afternoon is undertime too (CSC MC No. 17, s. 2010).
// - Habitual absenteeism: absences without an approved leave of more than the 2.5 days of leave
//   earned a month, for at least 3 months in a semester or 3 months in a row (CSC MC No. 04, s. 1991).
export const HABITUAL_RULES = [
  {
    id: 'tardiness',
    label: 'Habitual tardiness',
    unit: 'times late',
    rule: 'Late 10 times a month, whatever the minutes, for 2 months in a semester or 2 months in a row.',
    source: 'CSC MC No. 04, s. 1991',
    meets: count => count >= 10,
    watchAt: 7,
    months: 2
  },
  {
    id: 'undertime',
    label: 'Habitual undertime',
    unit: 'times undertime',
    rule: 'Undertime 10 times a month, whatever the minutes, for 2 months in a semester or 2 months in a row.',
    source: 'CSC MC No. 16, s. 2010',
    meets: count => count >= 10,
    watchAt: 7,
    months: 2
  },
  {
    id: 'absences',
    label: 'Habitual absenteeism',
    unit: 'days absent',
    rule: 'Absent without an approved leave for more than 2.5 days a month, for 3 months in a semester or 3 months in a row.',
    source: 'CSC MC No. 04, s. 1991',
    meets: count => count > 2.5,
    watchAt: 2,
    months: 3
  }
];

const monthOf = date => String(date || '').slice(0, 7);
const monthNumber = month => Number(month.slice(5, 7));
const semesterOf = month => (monthNumber(month) <= 6 ? 1 : 2);

// Whether `months` (YYYY-MM, all of one year, each meeting a rule's count) are habitual: `need`
// of them in one semester (January to June, or July to December), or `need` months in a row.
export const isHabitualPattern = (months, need) => {
  const sorted = [...new Set(months)].sort();
  if ([1, 2].some(semester => sorted.filter(month => semesterOf(month) === semester).length >= need)) return true;
  let run = 0;
  let previous = null;
  for (const month of sorted) {
    run = previous !== null && monthNumber(month) === previous + 1 ? run + 1 : 1;
    previous = monthNumber(month);
    if (run >= need) return true;
  }
  return false;
};

// The same account: by its database ID, else its Employee ID and name, as old accounts can share
// the default Employee ID (DILG-2026-7689), else its email.
const isSameEmployee = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a._id && b._id) return String(a._id) === String(b._id);
  if (a.employeeId && b.employeeId) {
    const [nameA, nameB] = [normalizeAttendanceValue(a.name), normalizeAttendanceValue(b.name)];
    return a.employeeId === b.employeeId && (!nameA || !nameB || nameA === nameB);
  }
  return Boolean(a.email) && a.email === b.email;
};

// The employees HR should look at in `year` (YYYY) under each rule, as
// [{ employee, rule, months: [{ month, count, meets }], status, monthsMet, thisMonth }]: 'Habitual'
// when the months that met the rule's count make the pattern, and 'Watch' for one with such a
// month, or close to it this month (`today`'s). `records` are the attendance as the DTR reads it
// (see markDtrDay), and `absences` the days of absentDays. Each late arrival (in the morning, or
// back after 1:00 PM) and each early departure (before noon, or before the day's end) is one time
// (see dtrTimesLateAndEarly). Habitual first, then by name.
export const habitualAttendance = ({ employees = [], records = [], absences = [], year, today = '' }) => {
  const thisMonth = monthOf(today);
  const inYear = date => String(date || '').startsWith(`${year}-`);
  const rows = [];
  // Everyone in the service in `year`, those who left during it too.
  for (const employee of employeesInServiceSince(employees, `${year}-01-01`)) {
    const counts = { tardiness: {}, undertime: {}, absences: {} };
    const add = (rule, date, count) => {
      if (count) counts[rule][monthOf(date)] = (counts[rule][monthOf(date)] || 0) + count;
    };
    for (const record of records) {
      if (!inYear(record?.date) || !matchesAttendanceEmployee(record, employee)) continue;
      const entry = dtrEntry(record);
      if (!entry) continue;
      add('tardiness', record.date, entry.lateTimes);
      add('undertime', record.date, entry.earlyTimes);
    }
    for (const absence of absences) {
      if (inYear(absence?.date) && isSameEmployee(absence.employee, employee)) add('absences', absence.date, 1);
    }
    for (const rule of HABITUAL_RULES) {
      const months = Object.entries(counts[rule.id])
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, count]) => ({ month, count, meets: rule.meets(count) }));
      const met = months.filter(item => item.meets).map(item => item.month);
      const habitual = isHabitualPattern(met, rule.months);
      const now = counts[rule.id][thisMonth] || 0;
      if (habitual || met.length || now >= rule.watchAt) {
        rows.push({ employee, rule, months, status: habitual ? 'Habitual' : 'Watch', monthsMet: met.length, thisMonth: inYear(today) ? now : 0 });
      }
    }
  }
  return rows.sort((a, b) => (a.status === b.status ? 0 : a.status === 'Habitual' ? -1 : 1)
    || String(a.employee.name || '').localeCompare(String(b.employee.name || '')));
};
