import { isRealDate } from './localDate.js';

// An employee's Service Record, as government HR offices keep it: one line for each appointment
// or change (promotion, reappointment, salary adjustment, transfer, separation), with the
// inclusive dates of service, the designation, status of appointment, and annual salary, the
// office and station, the branch (national or local), leave without pay, and the date and cause of
// a separation. HR enters the lines from the appointments and other papers on file.
export const SERVICE_RECORD_FIELDS = [
  { key: 'from', label: 'From', type: 'date', required: true },
  { key: 'to', label: 'To (blank: Present)', type: 'date' },
  { key: 'designation', label: 'Designation', required: true, max: 120 },
  { key: 'status', label: 'Status', max: 60 },
  { key: 'salary', label: 'Annual Salary', type: 'number' },
  { key: 'office', label: 'Office / Division', max: 160 },
  { key: 'station', label: 'Station / Place of Assignment', max: 160 },
  { key: 'branch', label: 'Branch', options: ['National', 'Local'] },
  { key: 'leaveWithoutPay', label: 'Leave Without Pay', max: 120 },
  { key: 'separationDate', label: 'Separation Date', type: 'date' },
  { key: 'separationCause', label: 'Separation Cause', max: 120 }
];
export const MAX_SERVICE_RECORD_LINES = 100;

const text = value => (typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim());

// Checks the lines HR saves: { value: lines, oldest first } or { error }.
export const normalizeServiceRecord = lines => {
  if (!Array.isArray(lines)) return { error: 'Send the Service Record as a list of lines.' };
  if (lines.length > MAX_SERVICE_RECORD_LINES) return { error: `A Service Record can have at most ${MAX_SERVICE_RECORD_LINES} lines.` };
  const value = [];
  for (const [index, line] of lines.entries()) {
    const entry = {};
    for (const field of SERVICE_RECORD_FIELDS) {
      const raw = text(line?.[field.key]);
      if (field.max && raw.length > field.max) return { error: `Line ${index + 1}: ${field.label} is too long.` };
      entry[field.key] = raw;
    }
    if (!isRealDate(entry.from)) return { error: `Line ${index + 1}: enter the From date.` };
    if (entry.to && !isRealDate(entry.to)) return { error: `Line ${index + 1}: the To date is not a real date (leave it blank for Present).` };
    if (entry.to && entry.to < entry.from) return { error: `Line ${index + 1}: the To date is before the From date.` };
    if (!entry.designation) return { error: `Line ${index + 1}: enter the designation.` };
    if (entry.salary) {
      const salary = Number(entry.salary.replace(/,/g, ''));
      if (!Number.isFinite(salary) || salary < 0 || salary > 100000000) return { error: `Line ${index + 1}: the annual salary must be a number.` };
      entry.salary = String(Math.round(salary * 100) / 100);
    }
    if (entry.branch && !['National', 'Local'].includes(entry.branch)) return { error: `Line ${index + 1}: the branch is National or Local.` };
    if (entry.separationDate && !isRealDate(entry.separationDate)) return { error: `Line ${index + 1}: the separation date is not a real date.` };
    value.push(entry);
  }
  return { value: value.sort((a, b) => a.from.localeCompare(b.from)) };
};

const dateText = value => (isRealDate(value)
  ? new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC' })
  : '');
const pesos = value => (value === '' || value == null ? '' : Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

// A line as the printed record shows it.
export const serviceRecordRow = line => ({
  from: dateText(line.from),
  to: line.to ? dateText(line.to) : 'Present',
  designation: line.designation,
  status: line.status,
  salary: pesos(line.salary),
  office: line.office,
  station: line.station,
  branch: line.branch,
  leaveWithoutPay: line.leaveWithoutPay,
  separation: [dateText(line.separationDate), line.separationCause].filter(Boolean).join(' · ')
});

// The printable Service Record of `person` (name, Employee ID, date of birth, position, and the lines),
// certified by `certifiedBy` (the HR officer's name and position).
export const serviceRecordHtml = (person = {}, lines = [], { certifiedBy = {}, printedAt = '' } = {}) => {
  const name = [person.lastName, [person.firstName, person.middleName].filter(Boolean).join(' ')].filter(Boolean).join(', ') || person.name || '';
  const rows = lines.map(serviceRecordRow);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Service Record · ${escapeHtml(person.name || '')}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 24px; font-size: 11px; }
  h1 { font-size: 14px; text-align: center; margin: 0; } h2 { font-size: 18px; text-align: center; margin: 6px 0 14px; letter-spacing: 2px; }
  .who td { border: none; padding: 2px 6px; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; }
  .lines th, .lines td { border: 1px solid #334155; padding: 4px 5px; text-align: center; vertical-align: middle; font-size: 10px; }
  .lines th { background: #e2e8f0; }
  .note { margin-top: 14px; font-size: 11px; text-align: justify; }
  .sign { margin-top: 36px; text-align: right; font-size: 12px; }
  .sign b { display: block; text-transform: uppercase; }
  @page { size: landscape; margin: 12mm; }
</style></head><body>
<h1>Republic of the Philippines<br>Department of the Interior and Local Government</h1>
<h2>SERVICE RECORD</h2>
<table class="who"><tbody>
<tr><td><b>Name:</b> ${escapeHtml(name)}</td><td><b>Employee ID:</b> ${escapeHtml(person.employeeId || '')}</td></tr>
<tr><td><b>Date of Birth:</b> ${escapeHtml(dateText(person.dateOfBirth) || '')}</td><td><b>Position:</b> ${escapeHtml(person.role || '')}</td></tr>
</tbody></table>
<p class="note">This is to certify that the employee named above actually rendered service in this Office as shown by the service record below, each line of which is supported by appointment and other papers actually issued by this Office and approved by the authorities concerned.</p>
<table class="lines"><thead>
<tr><th colspan="2">SERVICE<br>(Inclusive Dates)</th><th colspan="3">RECORD OF APPOINTMENT</th><th rowspan="2">OFFICE / DIVISION</th><th rowspan="2">STATION / PLACE OF ASSIGNMENT</th><th rowspan="2">BRANCH</th><th rowspan="2">LEAVE W/O PAY</th><th rowspan="2">SEPARATION<br>(Date / Cause)</th></tr>
<tr><th>From</th><th>To</th><th>Designation</th><th>Status</th><th>Salary (Annual)</th></tr>
</thead><tbody>
${rows.length ? rows.map(row => `<tr>${['from', 'to', 'designation', 'status', 'salary', 'office', 'station', 'branch', 'leaveWithoutPay', 'separation'].map(key => `<td>${escapeHtml(row[key])}</td>`).join('')}</tr>`).join('\n') : '<tr><td colspan="10">No service record lines yet.</td></tr>'}
</tbody></table>
${printedAt ? `<p class="note">Printed ${escapeHtml(printedAt)}.</p>` : ''}
<div class="sign">Certified correct:<br><br><br><b>${escapeHtml(certifiedBy.name || '')}</b>${escapeHtml(certifiedBy.position || 'Human Resource Management Officer')}</div>
</body></html>`;
};
