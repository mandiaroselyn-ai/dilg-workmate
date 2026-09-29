import { matchesAttendanceEmployee } from './attendanceIdentity.js';

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

const isLate = record => Boolean(record?.late || /late/i.test(record?.status || ''));

// An employee's attendance on `date`: Present, Late, On Leave, On Travel, or Absent.
export const employeeDayStatus = (employee, { records = [], requests = [], date }) => {
  const record = records.find(item => item.date === date && matchesAttendanceEmployee(item, employee)) || null;
  if (record?.timeIn && record.status !== 'Absent') return { status: isLate(record) ? 'Late' : 'Present', record };
  const approved = requests.filter(request => (
    /approved/i.test(request?.status || '')
    && requestCoversDate(request, date)
    && matchesAttendanceEmployee(request, employee)
  ));
  if (approved.some(request => request.type === 'Leave Request')) return { status: 'On Leave', record };
  if (approved.some(request => request.type === 'Travel Order')) return { status: 'On Travel', record };
  return { status: 'Absent', record };
};

// Why a record needs HR review, or null. A shift that is still open today is not an issue;
// it becomes "Missing Time Out" once its day is over.
export const dtrIssue = (record, today) => {
  if (!record?.timeIn) return record?.status === 'Absent' ? null : 'Missing Time In';
  if (!record.selfieUrl) return 'Missing Selfie Verification';
  if (!record.fingerprintVerified) return 'Missing Biometric Verification';
  if (!record.timeOut) return record.date && record.date < today ? 'Missing Time Out' : null;
  return null;
};

// "08:05 AM" (how Time In and Time Out are saved) as minutes after midnight, or null.
const clockMinutes = value => {
  const match = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(String(value || '').trim());
  if (!match || Number(match[1]) > 12 || Number(match[2]) > 59) return null;
  const hour = (Number(match[1]) % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return hour * 60 + Number(match[2]);
};

// Time between Time In and Time Out, such as "8h 05m", or '' until both are recorded.
// A Time Out earlier than the Time In is past midnight, since a record keeps its Time In
// date. No lunch break is deducted.
export const totalHoursWorked = record => {
  const start = clockMinutes(record?.timeIn);
  const end = clockMinutes(record?.timeOut);
  if (start === null || end === null) return '';
  const minutes = (end - start + 24 * 60) % (24 * 60);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
};

// A record's DTR status: On Duty (open today), Incomplete, Late, or Complete.
export const dtrRecordStatus = (record, today) => {
  if (record?.timeIn && !record.timeOut && record.date === today) return 'On Duty';
  if (!record?.timeIn || !record.timeOut) return 'Incomplete';
  return isLate(record) ? 'Late' : 'Complete';
};
