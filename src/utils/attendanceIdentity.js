export const normalizeAttendanceValue = value => value?.toString().trim().toLowerCase() || '';

export const matchesAttendanceEmployee = (record = {}, employee = {}) => {
  const recordId = normalizeAttendanceValue(record.employeeId);
  const employeeId = normalizeAttendanceValue(employee.employeeId);
  const recordEmail = normalizeAttendanceValue(record.employeeEmail ?? record.email);
  const employeeEmail = normalizeAttendanceValue(employee.email);
  const recordName = normalizeAttendanceValue(record.employeeName);
  const employeeName = normalizeAttendanceValue(employee.name);

  if (recordId && employeeId) {
    if (recordId !== employeeId) return false;
    return !recordName || !employeeName || recordName === employeeName;
  }
  if (recordEmail && employeeEmail) {
    if (recordEmail !== employeeEmail) return false;
    return !recordName || !employeeName || recordName === employeeName;
  }
  return Boolean(recordName && employeeName && recordName === employeeName);
};
