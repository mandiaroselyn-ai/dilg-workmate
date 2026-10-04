import React from 'react';
import { EMPLOYMENT_FIELDS, GOVERNMENT_ID_FIELDS, PERSONAL_FIELDS } from '../../shared/profileFields';

const EMERGENCY_KEYS = ['emergencyContactName', 'emergencyContactRelationship', 'emergencyContactNumber'];
const field = key => PERSONAL_FIELDS.find(item => item.key === key);

// "1990-03-05" as "March 5, 1990"; anything else as it was typed.
export const formatProfileDate = value => {
  const day = typeof value === 'string' ? value.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : value || '';
};

// The employment status HR set (ACTIVE, ON LEAVE, or INACTIVE) for the profile header.
export const employmentBadge = person => {
  const status = (person?.employmentStatus || 'ACTIVE').toString().trim().toUpperCase();
  if (status === 'ACTIVE') return { label: 'ACTIVE EMPLOYEE', className: 'bg-emerald-500' };
  if (status === 'ON LEAVE') return { label: 'ON LEAVE', className: 'bg-amber-500' };
  return { label: status, className: 'bg-slate-500' };
};

const wfhLocation = location => [location?.street, location?.barangay, location?.municipality].filter(Boolean).join(', ');

const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-800 outline-none focus:border-[#1551b5] focus:bg-white';

export const ProfileFieldInput = ({ item, value, onChange }) => (
  <label className={`block min-w-0 text-[11px] font-bold text-slate-600 ${item.wide ? 'sm:col-span-2' : ''}`}>
    {item.label}
    {item.options ? (
      <select name={item.key} value={value || ''} onChange={onChange} className={inputClass}>
        <option value="">Select</option>
        {/* A value saved before the choices were set stays selectable. */}
        {[...item.options, ...(value && !item.options.includes(value) ? [value] : [])].map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    ) : (
      <input
        name={item.key}
        type={item.type || 'text'}
        required={item.required}
        maxLength={item.max || 250}
        placeholder={item.placeholder}
        value={value || ''}
        onChange={onChange}
        className={inputClass}
      />
    )}
  </label>
);

const Row = ({ label, value, wide }) => (
  <div className={`min-w-0 border-b border-slate-100 pb-3 ${wide ? 'sm:col-span-2' : ''}`}>
    <dt className="text-[11px] font-semibold text-slate-500">{label}</dt>
    <dd className="mt-0.5 break-words text-xs font-bold text-slate-800">{value || '-'}</dd>
  </div>
);

const Section = ({ title, note, children }) => (
  <section className="min-w-0">
    <h4 className="text-[11px] font-black uppercase tracking-[0.18em] text-[#1551b5]">{title}</h4>
    {note && <p className="mt-1 text-[11px] text-slate-500">{note}</p>}
    <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</div>
  </section>
);

// The profile's details in four sections. `form` holds what is being edited and
// `onChange` updates it by input name. While `editing`, the person's own details are
// inputs; employment details are inputs only when `employmentEditable` (an HR/Admin's own
// profile), otherwise HR keeps them. Fields marked readOnly are always shown as text.
// `attendanceAssignment` adds the station, LGU, and approved WFH location, which only
// employees who time in have.
export default function ProfileDetails({ person = {}, form = {}, onChange, editing = false, employmentEditable = false, attendanceAssignment = false }) {
  const show = (item, value = form[item.key] ?? person[item.key]) => (editing && !item.readOnly
    ? <ProfileFieldInput key={item.key} item={item} value={value} onChange={onChange} />
    : <Row key={item.key} label={item.label} value={item.type === 'date' ? formatProfileDate(value) : value} wide={item.wide} />);

  const personal = [
    { key: 'name', label: 'Full Name', required: true, max: 160, wide: true },
    ...PERSONAL_FIELDS.filter(item => !EMERGENCY_KEYS.includes(item.key)),
    { key: 'phoneNumber', label: 'Contact Number', type: 'tel' },
    // The login email is changed only by HR.
    { key: 'email', label: 'Government Email', readOnly: true }
  ];
  const employment = [
    { key: 'role', label: 'Position Title', required: true, max: 120 },
    { key: 'office', label: 'Office Assignment', required: true, max: 160 },
    { key: 'region', label: 'Regional Assignment' },
    { key: 'employeeId', label: 'Employee ID', readOnly: true },
    { key: 'employmentStatus', label: 'Employment Status', readOnly: true },
    { key: 'dateHired', label: 'Date Hired', type: 'date' },
    ...EMPLOYMENT_FIELDS
  ].map(item => (employmentEditable ? item : { ...item, readOnly: true }));

  return (
    <div className="space-y-6">
      <Section title="Personal Information">
        {personal.map(item => show(item))}
      </Section>

      <Section title="Emergency Contact">
        {EMERGENCY_KEYS.map(key => show(field(key)))}
      </Section>

      <Section title="Government ID Numbers" note={editing ? 'Only you and the HR Administrator can see these.' : ''}>
        {GOVERNMENT_ID_FIELDS.map(item => show(item))}
      </Section>

      <Section title="Employment Information" note={editing && !employmentEditable ? 'Managed by the HR Administrator. Ask HR to correct anything here.' : ''}>
        {employment.map(item => show(item, item.key === 'employmentStatus' ? person.employmentStatus || 'ACTIVE' : undefined))}
        {attendanceAssignment && (
          <>
            <Row label="Assigned Station" value={person.assignedStation} />
            <Row label="Assigned LGU" value={person.assignedLGU} />
            <Row label="Approved Work-From-Home Location" value={wfhLocation(person.approvedWfhLocation)} wide />
          </>
        )}
      </Section>
    </div>
  );
}
