import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  FileText,
  Filter,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  X
} from 'lucide-react';

const emptyForm = {
  firstName: '',
  middleName: '',
  lastName: '',
  dateOfBirth: '',
  gender: '',
  phoneNumber: '',
  email: '',
  address: '',
  employeeId: '',
  role: '',
  office: '',
  employmentStatus: 'ACTIVE',
  accountStatus: 'Pending',
  dateHired: '',
  assignedStation: '',
  assignedLGU: '',
  accessLevel: 'employee'
};

const employeeName = (employee = {}) =>
  employee.name ||
  [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(' ') ||
  'Registered employee';

const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const normalizeEmployee = (employee = {}) => {
  const name = employeeName(employee);
  const parts = name.split(' ');

  return {
    id: employee.id || employee._id || employee.employeeId || `emp-${Date.now()}`,
    firstName: employee.firstName || parts[0] || '',
    middleName: employee.middleName || '',
    lastName: employee.lastName || parts.slice(1).join(' ') || '',
    name,
    employeeId: employee.employeeId || employee.id || '',
    role: employee.role || 'Employee',
    office: employee.office || 'Administrative Office',
    email: employee.email || '',
    phoneNumber: employee.phoneNumber || employee.phone || '',
    address: employee.address || '',
    dateOfBirth: employee.dateOfBirth || '',
    gender: employee.gender || '',
    employmentStatus: employee.employmentStatus || employee.status || 'ACTIVE',
    accountStatus: employee.accountStatus || 'Pending',
    dateHired: employee.dateHired || '',
    assignedStation: employee.assignedStation || '',
    assignedLGU: employee.assignedLGU || '',
    profilePicture: employee.profilePicture || '',
    accessLevel: employee.accessLevel || 'employee'
  };
};

const statusStyle = (status = '') => {
  if (/active/i.test(status)) return 'bg-emerald-50 text-emerald-700';
  if (/pending/i.test(status)) return 'bg-amber-50 text-amber-700';
  if (/inactive|disabled|suspended/i.test(status)) return 'bg-slate-100 text-slate-600';
  return 'bg-slate-100 text-slate-600';
};

export default function HRAdminEmployeesView({ employees = [], onEmployeesChange, onAdminNotification, onEnrollEmployeeFace }) {
  const [screen, setScreen] = useState('list');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [editingId, setEditingId] = useState(null);
  const [toast, setToast] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const totalCount = employees.length;
  const activeCount = employees.filter((emp) => /active|present/i.test(emp.employmentStatus || emp.status || '')).length;
  const pendingCount = employees.filter((emp) => /pending/i.test(emp.accountStatus || '')).length;

  const filteredEmployees = useMemo(() => {
    const q = query.toLowerCase();
    return employees.filter((employee) => {
      const name = employeeName(employee).toLowerCase();
      const status = (employee.employmentStatus || employee.status || 'ACTIVE').toLowerCase();
      const matchesStatus = statusFilter === 'All' || status === statusFilter.toLowerCase();
      const matchesText = !q || `${name} ${employee.email || ''} ${employee.role || ''} ${employee.employeeId || ''}`.toLowerCase().includes(q);
      return matchesStatus && matchesText;
    });
  }, [employees, query, statusFilter]);

  const selectedEmployee = employees.find((employee) => {
    const key = employee.id || employee._id || employee.employeeId || employee.email;
    return key === selectedId;
  });

  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2500);
  };

  const handleFaceEnrollment = async () => {
    if (!selectedEmployee || !onEnrollEmployeeFace) return;
    try {
      await onEnrollEmployeeFace(selectedEmployee);
      notify('Employee face enrolled successfully.');
    } catch (error) {
      notify(error.message || 'Face enrollment failed.');
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setScreen('editor');
  };

  const openEdit = (employee) => {
    const record = normalizeEmployee(employee);
    setEditingId(record.id);
    setForm({
      ...emptyForm,
      ...record,
      firstName: record.firstName,
      middleName: record.middleName,
      lastName: record.lastName,
      employeeId: record.employeeId || '',
      role: record.role,
      office: record.office,
      employmentStatus: record.employmentStatus,
      accountStatus: record.accountStatus
    });
    setScreen('editor');
  };

  const openView = (employee) => {
    const id = employee.id || employee._id || employee.employeeId || employee.email;
    setSelectedId(id);
    setScreen('profile');
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleSaveEmployee = (event) => {
    event.preventDefault();

    const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(' ');
    const normalized = {
      ...normalizeEmployee({
        ...form,
        name: fullName,
        employeeId: form.employeeId || `DILG-${Date.now().toString().slice(-6)}`,
        role: form.role || 'Employee',
        office: form.office || 'Administrative Office',
        employmentStatus: form.employmentStatus || 'ACTIVE',
        accountStatus: form.accountStatus || 'Pending',
        email: (form.email || '').trim().toLowerCase(),
        phoneNumber: form.phoneNumber || ''
      }),
      name: fullName,
      email: (form.email || '').trim().toLowerCase(),
      employeeId: form.employeeId || `DILG-${Date.now().toString().slice(-6)}`,
      role: form.role || 'Employee',
      office: form.office || 'Administrative Office',
      employmentStatus: form.employmentStatus || 'ACTIVE',
      accountStatus: form.accountStatus || 'Pending',
      accessLevel: form.accessLevel || 'employee'
    };

    if (editingId) {
      onEmployeesChange?.((previous) =>
        previous.map((employee) => {
          const currentId = employee.id || employee._id || employee.employeeId || employee.email;
          return currentId === editingId ? { ...employee, ...normalized } : employee;
        })
      );
      onAdminNotification?.({
        title: 'Employee Account Updated',
        message: `${fullName || 'Employee'} profile and assigned role were updated by HR/Admin.`,
        time: 'Just now',
        type: 'employee_management'
      });
      notify('Employee account updated successfully.');
    } else {
      const newEmployee = {
        ...normalized,
        id: normalized.id || `emp-${Date.now()}`,
        status: normalized.employmentStatus,
        role: normalized.role,
        office: normalized.office,
        accountStatus: normalized.accountStatus
      };
      onEmployeesChange?.((previous) => [newEmployee, ...previous]);
      onAdminNotification?.({
        title: 'New Employee Account Created',
        message: `${fullName || 'A new employee'} was added to the HR/Admin employee roster.`,
        time: 'Just now',
        type: 'employee_management'
      });
      notify('Employee account created successfully.');
    }

    setScreen('list');
    setSelectedId(null);
  };

  const handleAccountStatus = (accountStatus) => {
    if (!selectedEmployee) return;
    const key = selectedEmployee.id || selectedEmployee._id || selectedEmployee.employeeId || selectedEmployee.email;
    onEmployeesChange?.((previous) =>
      previous.map((employee) => {
        const currentKey = employee.id || employee._id || employee.employeeId || employee.email;
        return currentKey === key
          ? {
              ...employee,
              accountStatus,
              employmentStatus: accountStatus === 'Active' ? 'ACTIVE' : employee.employmentStatus || 'ACTIVE'
            }
          : employee;
      })
    );
    onAdminNotification?.({
      title: 'Employee Account Status Changed',
      message: `${employeeName(selectedEmployee)} account status was updated to ${accountStatus} by HR/Admin.`,
      time: 'Just now',
      type: 'employee_management'
    });
    notify(`Account status updated to ${accountStatus}.`);
    setScreen('profile');
  };

  if (screen === 'editor') {
    return (
      <div className="w-full min-w-0 space-y-4 pb-24 sm:pb-0">
        <button type="button" onClick={() => setScreen('list')} className="inline-flex items-center gap-1 text-xs font-black text-blue-700">
          <ArrowLeft className="h-4 w-4" /> Employee Management
        </button>

        <form onSubmit={handleSaveEmployee} className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-xl font-black text-slate-900">{editingId ? 'Update Employee Account' : 'Create Employee Account'}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">Create and manage the employee profile, assigned role, and account access.</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="text-[11px] font-black text-slate-600">First Name
                <input name="firstName" value={form.firstName} onChange={handleChange} required className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500" />
              </label>
              <label className="text-[11px] font-black text-slate-600">Middle Name
                <input name="middleName" value={form.middleName} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500" />
              </label>
              <label className="text-[11px] font-black text-slate-600">Last Name
                <input name="lastName" value={form.lastName} onChange={handleChange} required className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500" />
              </label>
              <label className="text-[11px] font-black text-slate-600">Employee ID
                <input name="employeeId" value={form.employeeId} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500" />
              </label>

              <label className="text-[11px] font-black text-slate-600">Date of Birth
                <input name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500" />
              </label>
              <label className="text-[11px] font-black text-slate-600">Gender
                <select name="gender" value={form.gender} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500">
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label className="text-[11px] font-black text-slate-600">Phone Number
                <input name="phoneNumber" value={form.phoneNumber} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500" />
              </label>
              <label className="text-[11px] font-black text-slate-600">Email
                <input name="email" type="email" value={form.email} onChange={handleChange} required className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500" />
              </label>

              <label className="text-[11px] font-black text-slate-600 sm:col-span-2 xl:col-span-2">Address
                <input name="address" value={form.address} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500" />
              </label>

              <label className="text-[11px] font-black text-slate-600">Role / Designation
                <select name="role" value={form.role} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500">
                  <option value="">Select role</option>
                  <option value="Employee">Employee</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="HR Admin">HR Admin</option>
                  <option value="Administrative Officer">Administrative Officer</option>
                  <option value="Field Officer">Field Officer</option>
                </select>
              </label>

              <label className="text-[11px] font-black text-slate-600">Access Level
                <select name="accessLevel" value={form.accessLevel} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500">
                  <option value="employee">Employee</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="hr_admin">HR Admin</option>
                </select>
              </label>

              <label className="text-[11px] font-black text-slate-600">Office / Department
                <input name="office" value={form.office} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500" />
              </label>

              <label className="text-[11px] font-black text-slate-600">Employment Status
                <select name="employmentStatus" value={form.employmentStatus} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500">
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="ON LEAVE">ON LEAVE</option>
                </select>
              </label>

              <label className="text-[11px] font-black text-slate-600">Account Status
                <select name="accountStatus" value={form.accountStatus} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500">
                  <option value="Active">Active</option>
                  <option value="Pending">Pending</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </label>

              <label className="text-[11px] font-black text-slate-600">Date Hired
                <input name="dateHired" type="date" value={form.dateHired} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500" />
              </label>

              <label className="text-[11px] font-black text-slate-600">Assigned Station
                <input name="assignedStation" value={form.assignedStation} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500" />
              </label>

              <label className="text-[11px] font-black text-slate-600">Assigned LGU
                <input name="assignedLGU" value={form.assignedLGU} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500" />
              </label>
            </div>
          </section>

          <div className="flex flex-wrap gap-3">
            <button type="submit" className="rounded-xl bg-blue-700 px-4 py-3 text-xs font-black text-white">{editingId ? 'Save Changes' : 'Create Account'}</button>
            <button type="button" onClick={() => setScreen('list')} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700">Cancel</button>
          </div>
        </form>
      </div>
    );
  }

  if (screen === 'profile' && selectedEmployee) {
    return (
      <div className="w-full min-w-0 space-y-4 pb-24 sm:pb-0">
        <button type="button" onClick={() => setScreen('list')} className="inline-flex items-center gap-1 text-xs font-black text-blue-700">
          <ArrowLeft className="h-4 w-4" /> Employee Management
        </button>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-lg font-black text-blue-700">
              {selectedEmployee.profilePicture ? (
                <img src={selectedEmployee.profilePicture} alt={employeeName(selectedEmployee)} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                initials(employeeName(selectedEmployee)) || 'NA'
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-xl font-black text-slate-900">{employeeName(selectedEmployee)}</h2>
              <p className="mt-1 text-xs font-bold text-slate-500">{selectedEmployee.role || 'Employee'}</p>
              <p className="mt-1 text-[11px] font-black text-blue-700">{selectedEmployee.employeeId || selectedEmployee.id}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${statusStyle(selectedEmployee.employmentStatus || selectedEmployee.status || 'ACTIVE')}`}>
              {selectedEmployee.employmentStatus || selectedEmployee.status || 'ACTIVE'}
            </span>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700">
              {selectedEmployee.accountStatus || 'Pending'} account
            </span>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => openEdit(selectedEmployee)} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-xs font-black text-white">
              <Pencil className="h-4 w-4" /> Edit
            </button>
            <button type="button" onClick={() => handleAccountStatus('Active')} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700">Activate</button>
            <button type="button" onClick={() => handleAccountStatus('Inactive')} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700">Deactivate</button>
            <button type="button" onClick={handleFaceEnrollment} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-black text-blue-700">Enroll Face</button>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Employee Information</p>
            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3"><UserRound className="mt-0.5 h-4 w-4 text-blue-600" /><div><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Full Name</p><p className="mt-1 text-xs font-bold text-slate-800">{employeeName(selectedEmployee)}</p></div></div>
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3"><Mail className="mt-0.5 h-4 w-4 text-blue-600" /><div><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Email</p><p className="mt-1 text-xs font-bold text-slate-800">{selectedEmployee.email || '-'}</p></div></div>
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3"><Phone className="mt-0.5 h-4 w-4 text-blue-600" /><div><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Phone</p><p className="mt-1 text-xs font-bold text-slate-800">{selectedEmployee.phoneNumber || '-'}</p></div></div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Assignment Details</p>
            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3"><Building2 className="mt-0.5 h-4 w-4 text-blue-600" /><div><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Office</p><p className="mt-1 text-xs font-bold text-slate-800">{selectedEmployee.office || '-'}</p></div></div>
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3"><ShieldCheck className="mt-0.5 h-4 w-4 text-blue-600" /><div><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Role</p><p className="mt-1 text-xs font-bold text-slate-800">{selectedEmployee.role || '-'}</p></div></div>
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3"><MapPin className="mt-0.5 h-4 w-4 text-blue-600" /><div><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Assigned LGU / Station</p><p className="mt-1 text-xs font-bold text-slate-800">{selectedEmployee.assignedLGU || selectedEmployee.assignedStation || '-'}</p></div></div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-4 pb-24 sm:pb-0">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-900 sm:text-2xl">User Management</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">Create, update, and manage user accounts and assigned roles.</p>
          </div>
          <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-3 py-2 text-xs font-black text-white">
            <Plus className="h-4 w-4" /> Add User
          </button>
        </div>

        {toast && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
            {toast}
          </div>
        )}
      </header>

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee or email..." className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm shadow-sm outline-none focus:border-blue-500" />
        </div>
        <button
          type="button"
          onClick={() => setStatusFilter((current) => current === 'All' ? 'ACTIVE' : current === 'ACTIVE' ? 'INACTIVE' : 'All')}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm"
          title="Filter employees"
        >
          <Filter className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[10px] font-black uppercase text-slate-500">Total Users</p>
          <strong className="mt-1 block text-2xl text-slate-900">{totalCount}</strong>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
          <p className="text-[10px] font-black uppercase text-emerald-700">Active</p>
          <strong className="mt-1 block text-2xl text-emerald-700">{activeCount}</strong>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
          <p className="text-[10px] font-black uppercase text-amber-700">Pending</p>
          <strong className="mt-1 block text-2xl text-amber-700">{pendingCount}</strong>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[10px] font-black uppercase text-slate-500">Supervisors</p>
          <strong className="mt-1 block text-2xl text-slate-900">{employees.filter((emp) => /supervisor/i.test(emp.role || '')).length}</strong>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-3 font-black uppercase tracking-wide">Name</th>
                <th className="px-3 py-3 font-black uppercase tracking-wide">Role</th>
                <th className="px-3 py-3 font-black uppercase tracking-wide">Office</th>
                <th className="px-3 py-3 font-black uppercase tracking-wide">Status</th>
                <th className="px-3 py-3 font-black uppercase tracking-wide">Assigned Station</th>
                <th className="px-3 py-3 font-black uppercase tracking-wide text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-3 py-8 text-center text-sm font-semibold text-slate-500">No users found.</td>
                </tr>
              ) : (
                filteredEmployees.map((employee) => {
                  const key = employee.id || employee._id || employee.employeeId || employee.email;
                  return (
                    <tr key={key} className="border-t border-slate-100">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-[10px] font-black text-blue-700">
                            {employee.profilePicture ? (
                              <img src={employee.profilePicture} alt={employeeName(employee)} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              initials(employeeName(employee))
                            )}
                          </div>
                          <div>
                            <p className="font-black text-slate-800">{employeeName(employee)}</p>
                            <p className="text-[10px] text-slate-500">{employee.email || 'No email'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{employee.role || 'Employee'}</td>
                      <td className="px-3 py-3 text-slate-700">{employee.office || 'Administrative Office'}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-1 text-[10px] font-black ${statusStyle(employee.employmentStatus || employee.status || 'ACTIVE')}`}>
                          {employee.employmentStatus || employee.status || 'ACTIVE'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{employee.assignedStation || '—'}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => openView(employee)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-black text-slate-700">View</button>
                          <button type="button" onClick={() => openEdit(employee)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-black text-slate-700">Edit</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
