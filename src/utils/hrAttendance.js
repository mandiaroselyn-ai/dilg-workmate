import { matchesAttendanceEmployee } from './attendanceIdentity.js';
import { clockMinutes, isRestDate, isRestDay, missingLunchLog, tardiness, usesLunchLogs } from './dtrDay.js';

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

// A day that earns no overtime, whatever an office order says: work from home (CSC MC No. 6,
// s. 2022, item V.B.1.1.4) or travel status (Joint CSC-DBM Circular No. 01-15, Sec. 7.3).
const cannotEarnOvertime = (record, requests) => (record.dutyType || record.workAssignment?.assignmentRole) === 'wfh'
  || requests.some(request => request?.type === 'Travel Order' && /approved/i.test(request.status || '')
    && requestCoversDate(request, record.date)
    && matchesAttendanceEmployee(request, { employeeId: record.employeeId, email: record.employeeEmail ?? record.email, name: record.employeeName }));

// A record with what the office's calendar says about its day, for everything that reads it as
// the DTR does: `holiday` when HR set its date as one, `noOvertime` for a day that earns none,
// `overtimeWindows` for the office orders that name its employee on that date, and no `late`
// from the server on a rest day.
export const markDtrDay = (record, { holidays = [], overtimeOrders = [], requests = [] } = {}) => {
  const noOvertime = cannotEarnOvertime(record, requests);
  const marked = {
    ...record,
    holiday: holidays.some(holiday => holiday.date === record.date),
    noOvertime,
    overtimeWindows: noOvertime ? [] : overtimeOrders
      .filter(order => order.startDate <= record.date && record.date <= order.endDate
        && order.employeeIds.some(id => matchesAttendanceEmployee(record, { employeeId: id, email: id })))
      .map(order => ({ orderNumber: order.orderNumber, from: clock24Minutes(order.startTime), to: clock24Minutes(order.endTime) }))
  };
  return isRestDay(marked) ? { ...marked, late: false } : marked;
};

// A late day: an arrival after the start of its half of the day (a Time In after 8:00 AM, or
// after 1:00 PM for an afternoon-only day) or back from lunch after 1:00 PM, or a record HR set
// to Late. Records with lunch logs are read from their own times, as their DTR is; earlier ones
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

// An employee's attendance on `date`: Present, Late, On Leave, On Travel, Rest Day (a Saturday,
// Sunday, or one of HR's holidays with none of those), or Absent.
export const employeeDayStatus = (employee, { records = [], requests = [], date, holidays = [] }) => {
  const record = records.find(item => item.date === date && matchesAttendanceEmployee(item, employee) && !isRejectedOffline(item)) || null;
  if (record?.timeIn && record.status !== 'Absent') return { status: isLate(record) ? 'Late' : 'Present', record };
  const approved = requests.filter(request => (
    /approved/i.test(request?.status || '')
    && requestCoversDate(request, date)
    && matchesAttendanceEmployee(request, employee)
  ));
  if (approved.some(request => request.type === 'Leave Request')) return { status: 'On Leave', record };
  if (approved.some(request => request.type === 'Travel Order')) return { status: 'On Travel', record };
  return { status: isRestDate(date, holidays) ? 'Rest Day' : 'Absent', record };
};

// An employee's attendance this month up to `today` (YYYY-MM-DD), one count per day:
// Present (office), WFH, Field Work, Late, On Leave/Travel (approved), or Absent. Each
// Monday to Friday counts, except HR's holidays; a rest day counts only when the employee
// timed in. Today counts once the employee has timed in or is on leave, not while the day has
// not started. The rate is the days attended out of the days the employee was expected at work.
export const monthAttendanceSummary = (employee, { records = [], requests = [], today, holidays = [] }) => {
  const lastDay = Number(today.slice(8, 10));
  const counts = { present: 0, wfh: 0, field: 0, late: 0, leave: 0, absent: 0 };
  for (let day = 1; day <= lastDay; day += 1) {
    const date = `${today.slice(0, 8)}${String(day).padStart(2, '0')}`;
    const { status, record } = employeeDayStatus(employee, { records, requests, date, holidays });
    if (status === 'Rest Day') continue;
    if (status === 'Absent') {
      if (date !== today) counts.absent += 1;
    } else if (status === 'On Leave' || status === 'On Travel') {
      if (!isRestDate(date, holidays)) counts.leave += 1;
    } else if (status === 'Late') {
      counts.late += 1;
    } else {
      const dutyType = record?.dutyType || record?.workAssignment?.assignmentRole;
      counts[dutyType === 'wfh' ? 'wfh' : dutyType === 'field' ? 'field' : 'present'] += 1;
    }
  }
  const attended = counts.present + counts.wfh + counts.field + counts.late;
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
