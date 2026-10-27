// Profile details beyond the account basics (name, email, position, office, region,
// contact number, and employee ID). The server reads saves with these lists, and the
// profile pages and HR's forms show them, so a field added here is saved and shown
// everywhere.

import { SALARY_GRADE_OPTIONS, SALARY_STEP_OPTIONS, salaryFields } from './salarySchedule.js';

export const GENDER_OPTIONS = ['Male', 'Female', 'Other'];
export const CIVIL_STATUS_OPTIONS = ['Single', 'Married', 'Widowed', 'Separated', 'Others'];

// The person keeps these up to date on their own profile; HR can fill them in too.
// The name parts go on official forms such as CSC Form No. 6. The full name stays as
// typed, because attendance records are matched by it.
export const PERSONAL_FIELDS = [
  { key: 'firstName', label: 'First Name', max: 80 },
  { key: 'middleName', label: 'Middle Name', max: 80 },
  { key: 'lastName', label: 'Last Name', max: 80 },
  { key: 'suffix', label: 'Suffix', placeholder: 'Jr., Sr., III', max: 20 },
  { key: 'dateOfBirth', label: 'Date of Birth', type: 'date' },
  { key: 'gender', label: 'Gender', options: GENDER_OPTIONS },
  { key: 'civilStatus', label: 'Civil Status', options: CIVIL_STATUS_OPTIONS },
  { key: 'address', label: 'Home Address', wide: true },
  { key: 'emergencyContactName', label: 'Emergency Contact Person' },
  { key: 'emergencyContactRelationship', label: 'Relationship to Contact' },
  { key: 'emergencyContactNumber', label: 'Emergency Contact Number', type: 'tel' }
];

// Also the person's own to keep up to date. Only the person and HR see them: they are
// left out of the employee details that supervisors get with each request.
export const GOVERNMENT_ID_FIELDS = [
  { key: 'gsisNumber', label: 'GSIS ID No.', max: 40 },
  { key: 'pagibigNumber', label: 'Pag-IBIG ID No.', max: 40 },
  { key: 'philhealthNumber', label: 'PhilHealth No.', max: 40 },
  { key: 'tinNumber', label: 'TIN', max: 40 }
];

// Kept by HR, like the position, office, region, and employee ID. The salary goes on
// CSC Form No. 6. HR chooses the salary grade and step; the monthly salary is never typed:
// it comes from the government salary schedule (shared/salarySchedule.js), so it is read-only
// here and `derive` shows it from the chosen grade and step.
export const EMPLOYMENT_FIELDS = [
  { key: 'division', label: 'Division / Unit' },
  { key: 'plantillaItemNumber', label: 'Plantilla Item No.', max: 80 },
  { key: 'salaryGrade', label: 'Salary Grade', options: SALARY_GRADE_OPTIONS, max: 40 },
  { key: 'salaryStep', label: 'Step', options: SALARY_STEP_OPTIONS, max: 20 },
  {
    key: 'salary',
    label: 'Monthly Salary',
    readOnly: true,
    placeholder: 'Set by the salary grade and step',
    derive: values => salaryFields(values?.salaryGrade, values?.salaryStep).salary || ''
  },
  { key: 'immediateSupervisor', label: 'Immediate Supervisor', max: 160 }
];

const DEFAULT_LIMIT = 250;

// Reads the listed fields that `body` sends, trimmed. Fields it leaves out are left out
// of the result, so a save changes only what was sent. Returns { value } or { error }.
export const readProfileFields = (body = {}, fields) => {
  const value = {};
  for (const field of fields) {
    // A read-only field, such as the monthly salary, is never taken from what was sent.
    if (field.readOnly) continue;
    const raw = body?.[field.key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== 'string') return { error: `${field.label} must be text.` };
    const text = raw.trim();
    if (text.length > (field.max || DEFAULT_LIMIT)) return { error: `${field.label} is too long.` };
    value[field.key] = text;
  }
  // A salary grade or step sent sets the monthly salary from the salary schedule.
  if ('salaryGrade' in value || 'salaryStep' in value) {
    const salary = salaryFields(value.salaryGrade, value.salaryStep);
    if (salary.error) return { error: salary.error };
    Object.assign(value, salary);
  }
  return { value };
};

// The keys of the listed fields, each set to the person's current value or ''.
export const profileFieldValues = (person = {}, fields) =>
  Object.fromEntries(fields.map(field => [field.key, person?.[field.key] || '']));
