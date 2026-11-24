import { matchesAttendanceEmployee } from './attendanceIdentity.js';
import { clockMinutes, isRestDate, isRestDay, missingLunchLog, tardiness, usesLunchLogs } from './dtrDay.js';
import { travelOrderCovers } from '../../shared/travelStatus.js';
import { holidaysFor } from '../../shared/phHolidays.js';
import { isFixedHoursDay, OFFICE_HOURS, workdayEnd } from '../../shared/officeHours.js';
import { getManilaDateString } from '../../shared/localDate.js';
import { employeesInServiceSince } from '../../shared/separation.js';

// Attendance rules shared by the HR dashboard and attendance screens. Only employees with
// an active account are expected at work, and only records that belong to a current
// employee account are counted.

export const activeEmployees = (employees = []) => employees.filter(employee => (
  (employee?.accountStatus || 'Active').toString().toLowerCase() === 'active'
));

// Attendance records or requests that belong to one of these employee accounts.
export const recordsForEmployees = (records = [], employees = []) => records.filter(record => (
  employees.some(employee => matchesAttendanceEmployee(record, employee))
));

const dayOf = value => (typeof value === 'string' ? value.slice(0, 10) : '');

// True when an approved leave or travel request includes `date` (YYYY-MM-DD).
export const requestCoversDate = (request, date) => {
  const start = dayOf(request?.startDate);
  const end = dayOf(request?.endDate) || start;
  return Boolean(start) && start <= date && date <= end;
};

const clock24Minutes = value => {
  const [hours, minutes] = String(value).split(':').map(Number);
  return hours * 60 + minutes;
};

// An approved request of `types` on the record's date, filed by its employee or (a Travel Order)
// including them.
const approvedRequestOn = (record, requests, types) => requests.some(request => types.includes(request?.type)
  && /approved/i.test(request.status || '')
  && requestCoversDate(request, record.date)
  && (matchesAttendanceEmployee(request, { employeeId: record.employeeId, email: record.employeeEmail ?? record.email, name: record.employeeName })
    || travelOrderCovers(request, { employeeId: record.employeeId })));

// A day that earns no overtime, whatever an office order says: work from home (CSC MC No. 6,
// s. 2022, item V.B.1.1.4) or travel status (Joint CSC-DBM Circular No. 01-15, Sec. 7.3).
const cannotEarnOvertime = (record, requests) => (record.dutyType || record.workAssignment?.assignmentRole) === 'wfh'
  || approvedRequestOn(record, requests, ['Travel Order']);

// A record with what the office's calendar says about its day, for everything that reads it as
// the DTR does: `holiday` when HR set its date as one, `noOvertime` for a day that earns none,
// `overtimeWindows` for the office orders that name its employee on that date,
// `coveredByRequest` when an approved leave or Travel Order covers the day (so a half day the
// employee missed is not tardiness or undertime, see dtrDayLogs), and no `late` from the server
// on a rest day.
export const markDtrDay = (record, { holidays = [], overtimeOrders = [], requests = [] } = {}) => {
  const noOvertime = cannotEarnOvertime(record, requests);
  const marked = {
    ...record,
    holiday: holidays.some(holiday => holiday.date === record.date),
    noOvertime,
    coveredByRequest: approvedRequestOn(record, requests, ['Leave Request', 'Travel Order']),
    overtimeWindows: noOvertime ? [] : overtimeOrders
      .filter(order => order.startDate <= record.date && record.date <= order.endDate
        && order.employeeIds.some(id => matchesAttendanceEmployee(record, { employeeId: id, email: id })))
      .map(order => ({ orderNumber: order.orderNumber, from: clock24Minutes(order.startTime), to: clock24Minutes(order.endTime) }))
  };
  return isRestDay(marked) ? { ...marked, late: false } : marked;
};

// A late day: a Time In after 7:00 AM on Monday or 9:00 AM on the flexitime days (which a Time
// In from noon on always is, since a missed morning is tardiness, CSC MC No. 17, s. 2010, unless
// an approved leave or Travel Order covers it: then after 1:00 PM), back from lunch after
// 1:00 PM, or a record HR set to Late. Records with lunch logs are read from their own times, as their DTR is; earlier ones
// use the `late` the server saved at Time In. Nobody is late on a rest day.
export const isLate = record => {
  if (/late/i.test(record?.status || '')) return true;
  if (isRestDay(record)) return false;
  if (!usesLunchLogs(record)) return Boolean(record?.late);
  const { am, pm } = tardiness(record);
  return am + pm > 0;
};

// A Time In or Time Out made in the phone app without internet that failed a check when it
// was sent waits for HR: it counts in the DTR only once HR decides it (a Time Out can also
// be corrected by HR).
const awaitsDecision = entry => Boolean(entry?.reviewReasons?.length && !entry.decision);
const isAccepted = entry => !entry?.reviewReasons?.length || ['approved', 'corrected'].includes(entry.decision);
export const isOfflineReviewPending = record => awaitsDecision(record?.offlineTimeIn);
export const isOfflineTimeOutPending = record => awaitsDecision(record?.offlineTimeOut);
export const countsInDtr = record => isAccepted(record?.offlineTimeIn);
// The Time Out the DTR shows: none while an offline Time Out waits for HR.
export const dtrTimeOut = record => (isAccepted(record?.offlineTimeOut) ? record?.timeOut || null : null);
const isRejectedOffline = record => record?.offlineTimeIn?.decision === 'rejected';

// True when HR set the employee's Employment Status to ON LEAVE.
export const hasOnLeaveStatus = employee => (employee?.employmentStatus || '').toString().trim().toUpperCase() === 'ON LEAVE';

// Shown on HR's monitoring instead of Absent while today is not over. No Time In yet is Not Yet
// In before the latest on-time arrival (7:00 AM on a Monday, 9:00 AM on the flexitime days, see
// shared/officeHours.js), then No Time In until the day's office hours end (4:00 PM on a Monday,
// 6:00 PM on the other days, see isDayOver): a Time In later that day is tardiness, not an absence
// (CSC MC No. 17, s. 2010), so the day is Absent only once it is over, as HR Records counts it.
export const NOT_YET_IN = 'Not Yet In';
export const NO_TIME_IN = 'No Time In';
export const isBeforeLatestArrival = (date, minutes) => minutes < (isFixedHoursDay(date) ? OFFICE_HOURS.amStart : OFFICE_HOURS.flexLatestStart);
// An employee's status on `date` for HR's monitoring at `minutes` after midnight today (see
// NO_TIME_IN). `record` is the day's attendance record: one HR set to Absent stays Absent.
export const monitoringStatus = (status, date, today, minutes, record = null) => {
  if (status !== 'Absent' || date !== today || /absent/i.test(record?.status || '')) return status;
  if (isBeforeLatestArrival(date, minutes)) return NOT_YET_IN;
  return isDayOver(date, minutes) ? 'Absent' : NO_TIME_IN;
};
// When today's No Time In becomes Absent, such as "6:00 PM".
export const dayEndText = date => {
  const end = workdayEnd(isFixedHoursDay(date) ? OFFICE_HOURS.amStart : OFFICE_HOURS.flexLatestStart);
  return `${Math.floor(end / 60) % 12 || 12}:${String(end % 60).padStart(2, '0')} ${end < 12 * 60 ? 'AM' : 'PM'}`;
};

// An employee's attendance on `date`: Present, Late, On Leave, On Travel, Rest Day (a Saturday,
// Sunday, or a holiday of the employee's with none of those; a town's holiday is only its offices'), or Absent. On Leave is an approved leave
// covering `date`, or, from `today` on, an Employment Status of ON LEAVE: that status says how
// the employee is now, not since when, so earlier days go by the leave filed for them.
export const employeeDayStatus = (employee, { records = [], requests = [], date, holidays = [], today = '' }) => {
  const record = records.find(item => item.date === date && matchesAttendanceEmployee(item, employee) && !isRejectedOffline(item)) || null;
  if (record?.timeIn && record.status !== 'Absent') return { status: isLate(record) ? 'Late' : 'Present', record };
  // Their own leave or travel, or a Travel Order that includes them.
  const approved = requests.filter(request => (
    /approved/i.test(request?.status || '')
    && requestCoversDate(request, date)
    && (matchesAttendanceEmployee(request, employee) || travelOrderCovers(request, employee))
  ));
  if (approved.some(request => request.type === 'Leave Request')) return { status: 'On Leave', record };
  if (approved.some(request => request.type === 'Travel Order')) return { status: 'On Travel', record };
  if (today && date >= today && hasOnLeaveStatus(employee)) return { status: 'On Leave', record };
  return { status: isRestDate(date, holidaysFor(holidays, employee)) ? 'Rest Day' : 'Absent', record };
};

// An employee's attendance this month up to `today` (YYYY-MM-DD), one count per day:
// Present (office), WFH, Field Work, Late, Incomplete, On Leave/Travel (approved), or Absent.
// Incomplete is a day the employee came in but whose DTR still lacks a log (Time Out, Lunch Out,
// or Lunch In; not while today's shift is open), so only a complete day is Present. Each
// Monday to Friday counts, except HR's holidays; a rest day counts only when the employee
// timed in. Today counts once the employee has timed in or is on leave, not while the day has
// not started. The rate is the days attended (incomplete ones too, as the employee came in) out
// of the days the employee was expected at work.
export const monthAttendanceSummary = (employee, { records = [], requests = [], today, holidays = [] }) => {
  const lastDay = Number(today.slice(8, 10));
  const counts = { present: 0, wfh: 0, field: 0, late: 0, incomplete: 0, leave: 0, absent: 0 };
  for (let day = 1; day <= lastDay; day += 1) {
    const date = `${today.slice(0, 8)}${String(day).padStart(2, '0')}`;
    const { status, record } = employeeDayStatus(employee, { records, requests, date, holidays, today });
    if (status === 'Rest Day') continue;
    if (status === 'Absent') {
      if (date !== today) counts.absent += 1;
    } else if (status === 'On Leave' || status === 'On Travel') {
      if (!isRestDate(date, holidaysFor(holidays, employee))) counts.leave += 1;
    } else if (record && !(date === today && !record.timeOut) && missingDtrLog(record)) {
      counts.incomplete += 1;
    } else if (status === 'Late') {
      counts.late += 1;
    } else {
      const dutyType = record?.dutyType || record?.workAssignment?.assignmentRole;
      counts[dutyType === 'wfh' ? 'wfh' : dutyType === 'field' ? 'field' : 'present'] += 1;
    }
  }
  const attended = counts.present + counts.wfh + counts.field + counts.late + counts.incomplete;
  const expected = attended + counts.absent;
  return { ...counts, rate: expected ? Math.round((attended / expected) * 100) : null };
};

// Whether a record has a Time In selfie. HR's lists leave the selfie out and say so with
// hasSelfie; an employee's own records carry the selfie itself.
export const hasSelfie = record => Boolean(record?.hasSelfie || record?.selfieUrl);

// Why a record needs HR review, or null. A shift that is still open today is not an issue;
// it becomes "Missing Time Out" once its day is over. A finished whole day without its
// Lunch Out or Lunch In needs HR to enter it (see missingLunchLog).
export const dtrIssue = (record, today) => {
  if (!record?.timeIn) return record?.status === 'Absent' ? null : 'Missing Time In';
  if (isOfflineReviewPending(record)) return 'Offline Time In for Review';
  // HR already decided this one.
  if (isRejectedOffline(record)) return null;
  if (isOfflineTimeOutPending(record)) return 'Offline Time Out for Review';
  // HR approved this Time In after checking its selfie and fingerprint.
  const approvedOffline = record.offlineTimeIn?.decision === 'approved';
  if (!approvedOffline && !hasSelfie(record)) return 'Missing Selfie Verification';
  if (!approvedOffline && !record.fingerprintVerified) return 'Missing Biometric Verification';
  if (!record.timeOut) return record.date && record.date < today ? 'Missing Time Out' : null;
  return missingLunchLog(record);
};

// Time between Time In and Time Out, such as "8h 05m", or '' until both are recorded.
// A Time Out earlier than the Time In is past midnight, since a record keeps its Time In
// date. The time between Lunch Out and Lunch In is deducted when both are recorded.
export const totalHoursWorked = record => {
  const start = clockMinutes(record?.timeIn);
  const end = clockMinutes(record?.timeOut);
  if (start === null || end === null) return '';
  const lunchOut = clockMinutes(record.lunchOut);
  const lunchIn = clockMinutes(record.lunchIn);
  const lunch = lunchOut !== null && lunchIn !== null ? Math.max(0, lunchIn - lunchOut) : 0;
  const minutes = Math.max(0, ((end - start + 24 * 60) % (24 * 60)) - lunch);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
};

// A record's DTR status: On Duty (open today), Incomplete (a missing Time In, Time Out,
// Lunch Out, or Lunch In), Late, or Complete.
export const dtrRecordStatus = (record, today) => {
  if (record?.timeIn && !record.timeOut && record.date === today) return 'On Duty';
  if (!record?.timeIn || !record.timeOut || missingLunchLog(record)) return 'Incomplete';
  return isLate(record) ? 'Late' : 'Complete';
};

// What an Incomplete record lacks, for its label: 'Missing Time In', 'Missing Time Out',
// 'Missing Lunch Out', or 'Missing Lunch In'.
export const missingDtrLog = record => (!record?.timeIn ? 'Missing Time In'
  : !record.timeOut ? 'Missing Time Out'
    : missingLunchLog(record) || '');

// An employee's days from `from` (YYYY-MM-DD) to `today` whose DTR still lacks a log (Missing Time
// Out, Missing Lunch Out, or Missing Lunch In; see missingDtrLog), newest first, as
// [{ date, record, missing }], for the reminder to have HR correct them before the DTR is signed.
// Today counts only once its shift is timed out. A record left out of the DTR (an offline Time In
// HR rejected) or set Absent by HR does not count. A day HR corrected drops off.
export const incompleteDtrDays = ({ records = [], today, from = '' }) => records
  .filter(record => record?.timeIn && record.date && record.date >= from && record.date <= today
    && !(record.date === today && !record.timeOut)
    && !isRejectedOffline(record) && !/absent/i.test(record.status || ''))
  .map(record => ({ date: record.date, record, missing: missingDtrLog(record) }))
  .filter(item => item.missing)
  .sort((a, b) => b.date.localeCompare(a.date));

// How a record reads in the DTR lists and reports: its `status` (see dtrRecordStatus), the
// `label` to show (the log an Incomplete record lacks, such as Missing Time Out), and `lateToo`
// when an open or incomplete record is late as well, which its status alone does not say.
export const dtrStatusOf = (record, today) => {
  const status = dtrRecordStatus(record, today);
  return {
    status,
    label: status === 'Incomplete' ? missingDtrLog(record) : status,
    lateToo: (status === 'Incomplete' || status === 'On Duty') && isLate(record)
  };
};

// The live GPS of an employee's open shift from today (`today`, YYYY-MM-DD), from HR's live
// locations, or null. A shift from an earlier day that was never timed out is still open, but
// the employee has not timed in today.
export const liveLocationFor = (liveLocations = [], employee, today) => (
  liveLocations.find(item => item.date === today && matchesAttendanceEmployee(item, employee)) || null
);

// Where an employee is today, for HR's geofence counts: 'Not Timed In', 'Timed Out', 'On Lunch'
// (a Lunch Out without a Lunch In), 'Inside Assigned Area', or 'Outside Geofence', from today's
// attendance record and the live GPS of their open shift (see liveLocationFor), which is the
// Time In GPS until the phone sends another.
export const geofenceStateOf = (attendanceRecord, liveRecord) => {
  const record = liveRecord || attendanceRecord;
  if (!record) return 'Not Timed In';
  if (!liveRecord && attendanceRecord?.timeOut) return 'Timed Out';
  if (liveRecord?.onLunch) return 'On Lunch';
  return /in range/i.test(record.gpsStatus || '') ? 'Inside Assigned Area' : 'Outside Geofence';
};

// HR's attendance holds the records from `windowStart` (the first day of the previous
// month) on, plus the earlier months HR loaded (`loadedMonths`, a Set of "YYYY-MM").
const newestFirst = (a, b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || ''));

// After the recent records are reloaded (`recent`): those, plus the loaded earlier
// months' records that the reload does not include.
export const mergeRecentAttendance = (previous = [], recent = [], loadedMonths = new Set(), windowStart = '') => {
  const ids = new Set(recent.map(record => record.id));
  const earlier = previous.filter(record => (
    !ids.has(record.id)
    && (record.date || '') < windowStart
    && loadedMonths.has((record.date || '').slice(0, 7))
  ));
  return [...recent, ...earlier].sort(newestFirst);
};

// After an earlier month is loaded (`monthRecords`): its records replace any already there.
export const mergeAttendanceMonth = (previous = [], monthRecords = []) => {
  const ids = new Set(monthRecords.map(record => record.id));
  return [...previous.filter(record => !ids.has(record.id)), ...monthRecords].sort(newestFirst);
};

// The next calendar day of `date` (YYYY-MM-DD).
const nextDay = date => {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
};
const previousDay = date => {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
};

// True once `date`'s office hours are over at `minutes` after midnight: 4:00 PM on a Monday, and
// 6:00 PM, when the latest flexitime day ends, on the other days.
export const isDayOver = (date, minutes) => minutes >= workdayEnd(isFixedHoursDay(date) ? OFFICE_HOURS.amStart : OFFICE_HOURS.flexLatestStart);

// The first day an employee is expected at work in WorkMate: their hiring date, or the day
// their account was made ('' when neither is known).
const firstWorkDayOf = employee => {
  const hired = String(employee?.dateHired || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(hired)) return hired;
  const created = employee?.createdAt ? new Date(employee.createdAt) : null;
  return created && !Number.isNaN(created.getTime()) ? getManilaDateString(created) : '';
};

// Every day an active employee was Absent (a working day with no Time In and no approved leave
// or Travel Order, see employeeDayStatus), as [{ date, employee }]. Days are counted from the
// latest of `from` (the first loaded day), the first day anyone's attendance was recorded in
// WorkMate (so the days before the office used it are not absences), and the employee's own
// first day; up to yesterday, or today once its office hours are over (`minutes` after midnight,
// see isDayOver), or up to `to` (YYYY-MM-DD) when that is earlier. A half day the employee missed
// is not an absence: the DTR counts it as tardiness or undertime (CSC MC No. 17, s. 2010, see
// dtrDayLogs).
export const absentDays = ({ employees = [], records = [], requests = [], holidays = [], from = '', to = '', today, minutes }) => {
  const ownRecords = recordsForEmployees(records, employees);
  const firstRecorded = ownRecords.reduce((first, record) => (record.date && (!first || record.date < first) ? record.date : first), '');
  if (!firstRecorded || !today) return [];
  const start = [from, firstRecorded].filter(Boolean).sort().pop();
  const last = [isDayOver(today, minutes) ? today : previousDay(today), to].filter(Boolean).sort()[0];
  const ownRequests = recordsForEmployees(requests, employees);
  const days = [];
  // Every employee in the service in that time, each up to their separation date when they left.
  for (const employee of employeesInServiceSince(employees, start)) {
    const first = [start, firstWorkDayOf(employee)].filter(Boolean).sort().pop();
    const separated = /^\d{4}-\d{2}-\d{2}$/.test(employee.separationDate || '') ? employee.separationDate : '';
    const end = separated && separated < last ? separated : last;
    for (let date = first; date <= end; date = nextDay(date)) {
      if (employeeDayStatus(employee, { records: ownRecords, requests: ownRequests, date, holidays, today }).status === 'Absent') {
        days.push({ date, employee });
      }
    }
  }
  return days.sort((a, b) => b.date.localeCompare(a.date) || String(a.employee.name || '').localeCompare(String(b.employee.name || '')));
};
