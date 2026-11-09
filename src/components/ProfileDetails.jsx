import React, { useEffect, useState } from 'react';
import { EMPLOYMENT_FIELDS, GOVERNMENT_ID_FIELDS, PERSONAL_FIELDS, SELF_EMPLOYMENT_FIELDS } from '../../shared/profileFields';
import { DILG_OFFICE_GROUPS, DILG_OFFICES, POSITION_TITLES, POSITION_TITLE_GROUPS } from '../../shared/dilgAssignments';
import AddressPicker from './AddressPicker';

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

// Marks a required field's label. The input's `required` tells screen readers.
export const RequiredMark = () => <span aria-hidden="true" className="text-rose-600"> *</span>;

// The office choices for a <select>, grouped as DILG Marinduque groups its offices. An office
// saved before the list stays selectable.
export const OfficeOptions = ({ value }) => (
  <>
    {DILG_OFFICE_GROUPS.map(group => (
      <optgroup key={group.label} label={group.label}>
        {group.offices.map(office => <option key={office} value={office}>{office}</option>)}
      </optgroup>
    ))}
    {value && !DILG_OFFICES.includes(value) && <option value={value}>{value}</option>}
  </>
);

const OTHER_TITLE = 'Other';

// The position title as a dropdown of every title on DILG Marinduque's staff list, written as
// the list writes them, so all of them show when editing too. Other opens a box to type a title
// that is not listed; a title saved before the list opens in that box. Sends the title through
// `onChange` like an input named `name`. `children` (such as an icon) go beside the dropdown.
export const PositionTitleSelect = ({ name = 'role', value = '', onChange, required = false, className, otherClassName = className, children }) => {
  const [typing, setTyping] = useState(() => Boolean(value) && !POSITION_TITLES.includes(value));
  // Another person's title, or the form cleared, decides again whether it is typed.
  useEffect(() => {
    if (POSITION_TITLES.includes(value)) setTyping(false);
    else if (value) setTyping(true);
  }, [value]);
  const send = title => onChange({ target: { name, value: title } });
  return (
    <>
      <span className="relative block">
        {children}
        <select
          value={typing ? OTHER_TITLE : value}
          onChange={event => {
            const isOther = event.target.value === OTHER_TITLE;
            setTyping(isOther);
            send(isOther ? '' : event.target.value);
          }}
          required={required}
          className={className}
        >
          <option value="">Select position title</option>
          {POSITION_TITLE_GROUPS.map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.titles.map(title => <option key={title} value={title}>{title}</option>)}
            </optgroup>
          ))}
          <option value={OTHER_TITLE}>Other (type the title)</option>
        </select>
      </span>
      {typing && <input name={name} value={value} onChange={event => send(event.target.value)} required={required} maxLength={120} placeholder="As on the appointment" className={otherClassName} />}
    </>
  );
};

// Choices offered while typing, such as designations; any other text can still be typed.
export const Suggestions = ({ id, options }) => (
  <datalist id={id}>
    {options.map(option => <option key={option} value={option} />)}
  </datalist>
);

// `values` are the whole form's, for a read-only field worked out from others (`derive`), such as
// the monthly salary from the salary grade and step.
export const ProfileFieldInput = ({ item, value, onChange, values }) => (item.homeAddress && !item.readOnly ? (
  <div className={`min-w-0 text-[11px] font-bold text-slate-600 ${item.wide ? 'sm:col-span-2' : ''}`}>
    {item.label}
    <div className="grid gap-2 sm:grid-cols-3">
      <AddressPicker name={item.key} value={value || ''} onChange={onChange} labelClass="block min-w-0 text-[10px] font-semibold text-slate-500" fieldClass={inputClass} />
    </div>
  </div>
) : (
  <label className={`block min-w-0 text-[11px] font-bold text-slate-600 ${item.wide ? 'sm:col-span-2' : ''}`}>
    {item.label}{item.required && !item.readOnly && <RequiredMark />}
    {item.readOnly ? (
      <input
        name={item.key}
        readOnly
        placeholder={item.placeholder}
        value={(item.derive && values ? item.derive(values) : value) || ''}
        className={`${inputClass} cursor-not-allowed bg-slate-100 text-slate-600`}
      />
    ) : item.positionTitle ? (
      <PositionTitleSelect name={item.key} value={value || ''} onChange={onChange} required={item.required} className={inputClass} />
    ) : item.offices ? (
      <select name={item.key} value={value || ''} onChange={onChange} required={item.required} className={inputClass}>
        <option value="">Select office</option>
        <OfficeOptions value={value} />
      </select>
    ) : item.options ? (
      <select name={item.key} value={value || ''} onChange={onChange} required={item.required} className={inputClass}>
        <option value="">Select</option>
        {/* A value saved before the choices were set stays selectable. */}
        {[...item.options, ...(value && !item.options.includes(value) ? [value] : [])].map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    ) : (
      <>
        <input
          name={item.key}
          type={item.type || 'text'}
          required={item.required}
          maxLength={item.max || 250}
          placeholder={item.placeholder}
          value={value || ''}
          onChange={onChange}
          list={item.suggestions ? `${item.key}-suggestions` : undefined}
          className={inputClass}
        />
        {item.suggestions && <Suggestions id={`${item.key}-suggestions`} options={item.suggestions} />}
      </>
    )}
  </label>
));

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

// The employment details an employee keeps on their own profile (`employmentEditable` 'employee'):
// their position, office, and work as on their Personal Data Sheet. HR keeps the region, employee
// ID, employment status, date hired, and status of appointment.
const EMPLOYEE_EDITABLE_KEYS = ['role', 'office', ...SELF_EMPLOYMENT_FIELDS.map(item => item.key)];

// The profile's details in four sections. `form` holds what is being edited and
// `onChange` updates it by input name. While `editing`, the person's own details are
// inputs; employment details are inputs when `employmentEditable` is true (all of them, on an
// HR/Admin's own profile) or 'employee' (EMPLOYEE_EDITABLE_KEYS), otherwise HR keeps them.
// Fields marked readOnly are always shown as text.
// `attendanceAssignment` adds the station, LGU, and approved WFH location, which only
// employees who time in have.
export default function ProfileDetails({ person = {}, form = {}, onChange, editing = false, employmentEditable = false, attendanceAssignment = false }) {
  // A worked-out field (`derive`, such as the monthly salary) follows the form while it is edited.
  const current = item => (editing && item.derive ? item.derive({ ...person, ...form }) || person[item.key] : form[item.key] ?? person[item.key]);
  const show = (item, value = current(item)) => (editing && !item.readOnly
    ? <ProfileFieldInput key={item.key} item={item} value={value} onChange={onChange} />
    : <Row key={item.key} label={item.label} value={item.type === 'date' ? formatProfileDate(value) : value} wide={item.wide} />);

  const personal = [
    { key: 'name', label: 'Full Name', required: true, max: 160, wide: true },
    ...PERSONAL_FIELDS.filter(item => !EMERGENCY_KEYS.includes(item.key)),
    { key: 'phoneNumber', label: 'Mobile Number', type: 'tel', required: true, placeholder: '09XX XXX XXXX' },
    // The login email is changed only by HR.
    { key: 'email', label: 'Government Email', readOnly: true }
  ];
  const employment = [
    { key: 'role', label: 'Position Title', required: true, max: 120, positionTitle: true },
    { key: 'office', label: 'Office Assignment', required: true, max: 160, offices: true },
    { key: 'region', label: 'Regional Assignment' },
    { key: 'employeeId', label: 'Employee ID', readOnly: true },
    { key: 'employmentStatus', label: 'Employment Status', readOnly: true },
    { key: 'dateHired', label: 'Date Hired', type: 'date' },
    ...EMPLOYMENT_FIELDS
  ].map(item => (employmentEditable === true || (employmentEditable === 'employee' && EMPLOYEE_EDITABLE_KEYS.includes(item.key))
    ? item
    : { ...item, readOnly: true }));
  const employmentNote = !editing ? ''
    : employmentEditable === 'employee' ? 'HR keeps your date hired, employment status, and status of appointment. Ask HR to correct those.'
    : employmentEditable ? '' : 'Managed by the HR Administrator. Ask HR to correct anything here.';

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

      <Section title="Employment Information" note={employmentNote}>
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
