import { employeesInServiceOn } from '../../shared/separation.js';
import { isRestDate } from './dtrDay.js';
import { employeeDayStatus, monitoringStatus, recordsForEmployees } from './hrAttendance.js';

// The HR dashboard's attendance of the last few working days, as it counts today's.

const dayBefore = date => {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
};

// The last `count` working days up to `today` (YYYY-MM-DD), oldest first: Monday to Friday,
// without the office-wide holidays. A town's holiday is a rest day only for that town's offices,
// so the day still counts for the others.
export const recentWorkdays = (today, holidays = [], count = 5) => {
  const officeHolidays = holidays.filter(holiday => !holiday?.place);
  const days = [];
  let date = today;
  for (let looked = 0; days.length < count && looked < 60; looked += 1) {
    if (!isRestDate(date, officeHolidays)) days.unshift(date);
    date = dayBefore(date);
  }
  return days;
};

// Each of those days, the employees in service then by how the day went: on time, late, absent,
// on leave or official travel (`away`), and, today, not in yet (`notIn`: no Time In before the
// day's office hours end). An employee hired after a day, or on a rest day of their own (their
// town's holiday), is not counted that day. `minutes` is the time now in Manila.
export const weeklyAttendance = ({ employees = [], records = [], requests = [], holidays = [], today, minutes }) => {
  const ownRecords = recordsForEmployees(records, employees);
  const ownRequests = recordsForEmployees(requests, employees);
  return recentWorkdays(today, holidays).map(date => {
    const day = { date, onTime: 0, late: 0, absent: 0, away: 0, notIn: 0, total: 0 };
    for (const employee of employeesInServiceOn(employees, date)) {
      const hired = String(employee.dateHired || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(hired) && hired > date) continue;
      const found = employeeDayStatus(employee, { records: ownRecords, requests: ownRequests, date, holidays, today });
      const status = monitoringStatus(found.status, date, today, minutes, found.record);
      if (status === 'Rest Day') continue;
      day.total += 1;
      if (status === 'Present') day.onTime += 1;
      else if (status === 'Late') day.late += 1;
      else if (status === 'Absent') day.absent += 1;
      else if (status === 'On Leave' || status === 'On Travel') day.away += 1;
      else day.notIn += 1;
    }
    return day;
  });
};
