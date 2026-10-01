import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  FileText,
  Filter,
  Fingerprint,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  X
} from 'lucide-react';
import { apiFetch, parseApiResponse } from '../utils/api';
import { registeredFingerprints } from '../utils/fingerprintMessages';
import { MARINDUQUE_MUNICIPALITIES } from '../../shared/marinduqueLocations';
import HRResetPasswordCard from './HRResetPasswordCard';

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
  approvedWfhMunicipality: '',
  approvedWfhBarangay: '',
  approvedWfhStreet: '',
  approvedWfhLandmark: '',
  password: ''
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

const employeeKey = (employee = {}) =>
  String(employee._id || employee.employeeId || employee.email || employee.id || '').trim().toLowerCase();

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
    approvedWfhMunicipality: employee.approvedWfhLocation?.municipality || '',
    approvedWfhBarangay: employee.approvedWfhLocation?.barangay || '',
    approvedWfhStreet: employee.approvedWfhLocation?.street || '',
    approvedWfhLandmark: employee.approvedWfhLocation?.landmark || '',
    profilePicture: employee.profilePicture || '',
    accessLevel: 'employee'
  };
};

// Account status decides whether the employee can log in (Active, Pending, Rejected,
// Inactive, Suspended); employment status (ACTIVE, INACTIVE, ON LEAVE) is shown separately.
const accountStatusOf = (employee = {}) => (employee.accountStatus || 'Pending').toString().trim().toLowerCase();

// Shown in the employee list only when employment is something other than the usual ACTIVE.
const employmentNote = (employee = {}) => {
  const employment = String(employee.employmentStatus || employee.status || '').trim();
  return employment && employment.toUpperCase() !== 'ACTIVE' ? ` · Employment: ${employment}` : '';
};

// True when the employee has a Philippine mobile number the approval SMS can go to
// (09XXXXXXXXX or +639XXXXXXXXX), matching the server's check.
const mobileNumberOf = (employee = {}) => /^(09|\+?639)\d{9}$/.test(String(employee.phoneNumber || '').replace(/[\s()-]/g, ''));
// Matches the server: Google sign-ups are told about approval by email, at the address
// Google verified; everyone else by SMS.
const signedUpWithGoogle = (employee = {}) => employee.signUpMethod === 'google' || (!employee.signUpMethod && Boolean(employee.googleId));
const STATUS_FILTERS = ['All', 'Active', 'Pending', 'Rejected', 'Inactive'];

// What HR is told about the SMS or email that lets an approved employee know they can log in.
const approvalNoticeNote = (notice, name) => {
  if (!notice) return '';
  const service = notice.channel === 'email' ? 'email' : 'SMS';
  return {
    sent: `${name} was sent ${notice.channel === 'email' ? 'an email' : 'an SMS'} and can now log in.`,
    'no-phone': `${name} has no mobile number on file, so let them know they can now log in.`,
    'no-email': `${name} has no email address on file, so let them know they can now log in.`,
    'not-configured': `${service === 'email' ? 'Email' : 'SMS'} is not set up, so let ${name} know they can now log in.`,
    failed: `The ${service} could not be sent, so let ${name} know they can now log in.`
  }[notice.result] || '';
};

const statusStyle = (status = '') => {
  if (/rejected/i.test(status)) return 'bg-rose-50 text-rose-700';
  // Check inactive first: 'Inactive' also contains 'active'.
  if (/inactive|disabled|suspended/i.test(status)) return 'bg-slate-100 text-slate-600';
  if (/active/i.test(status)) return 'bg-emerald-50 text-emerald-700';
  if (/pending/i.test(status)) return 'bg-amber-50 text-amber-700';
  return 'bg-slate-100 text-slate-600';
};

export default function HRAdminEmployeesView({ employees = [], onEmployeesChange, onAdminNotification }) {
  const [screen, setScreen] = useState('list');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showBiometricPending, setShowBiometricPending] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [toast, setToast] = useState('');
  const [toastIsError, setToastIsError] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [savedEnrollmentImage, setSavedEnrollmentImage] = useState('');
  const [dilgIdPhoto, setDilgIdPhoto] = useState('');
  const [dilgIdBackPhoto, setDilgIdBackPhoto] = useState('');
  const [isDemoEnrollment, setIsDemoEnrollment] = useState(false);
  const [enrollmentImagesLoading, setEnrollmentImagesLoading] = useState(false);
  const [enrollmentImagesError, setEnrollmentImagesError] = useState('');
  const [enrollmentImagesReloadKey, setEnrollmentImagesReloadKey] = useState(0);
  const [biometricReviewNote, setBiometricReviewNote] = useState('');
  const [biometricReviewLoading, setBiometricReviewLoading] = useState(false);
  const [employeesRefreshing, setEmployeesRefreshing] = useState(false);
  const [employeeSaving, setEmployeeSaving] = useState(false);
  const [accountStatusUpdating, setAccountStatusUpdating] = useState(false);
  const [creditForm, setCreditForm] = useState(null); // { vacationLeaveCredits, sickLeaveCredits, reason } while editing
  const [creditSaving, setCreditSaving] = useState(false);
  const [promotion, setPromotion] = useState(null); // { accessLevel, password } while confirming
  const [promotionSaving, setPromotionSaving] = useState(false);

  const employeeAccounts = useMemo(
    () => employees.filter(employee => !employee.accessLevel || employee.accessLevel === 'employee'),
    [employees]
  );
  const totalCount = employeeAccounts.length;
  const activeCount = employeeAccounts.filter((emp) => accountStatusOf(emp) === 'active').length;
  const pendingCount = employeeAccounts.filter((emp) => accountStatusOf(emp) === 'pending').length;
  const pendingBiometricCount = employeeAccounts.filter(emp => emp.biometricEnrollmentStatus === 'pending').length;

  const filteredEmployees = useMemo(() => {
    const q = query.toLowerCase();
    return employeeAccounts.filter((employee) => {
      const name = employeeName(employee).toLowerCase();
      const status = accountStatusOf(employee);
      const matchesStatus = statusFilter === 'All'
        || (statusFilter === 'Inactive' ? /inactive|suspended/.test(status) : status === statusFilter.toLowerCase());
      const matchesText = !q || `${name} ${employee.email || ''} ${employee.role || ''} ${employee.employeeId || ''}`.toLowerCase().includes(q);
      const matchesBiometricReview = !showBiometricPending || employee.biometricEnrollmentStatus === 'pending';
      return matchesStatus && matchesText && matchesBiometricReview;
    });
  }, [employeeAccounts, query, statusFilter, showBiometricPending]);
  // The Assigned Station column is shown only when some employee has one recorded.
  const showStationColumn = employeeAccounts.some(employee => employee.assignedStation || employee.assignedLGU);

  const selectedEmployee = employeeAccounts.find((employee) => {
    return employeeKey(employee) === selectedId;
  });
  const requiresBackId = (selectedEmployee?.biometricEnrollmentVersion || 1) >= 2;

  useEffect(() => {
    let active = true;
    setDilgIdPhoto('');
    setDilgIdBackPhoto('');
    setSavedEnrollmentImage('');
    setIsDemoEnrollment(false);
    setBiometricReviewNote('');
    setEnrollmentImagesError('');
    const employeeId = selectedEmployee?.employeeId;
    const userId = selectedEmployee?._id;
    const shouldLoadImages = selectedEmployee?.biometricEnrollmentStatus === 'pending'
      || selectedEmployee?.hasDilgIdPhoto
      || selectedEmployee?.hasDilgIdBackPhoto
      || selectedEmployee?.hasFaceEnrollmentImage;
    if (!shouldLoadImages) {
      setEnrollmentImagesLoading(false);
      return undefined;
    }
    if (!employeeId || !userId) {
      setEnrollmentImagesError('Unable to load enrollment images: the MongoDB employee record ID or employee ID is missing.');
      setEnrollmentImagesLoading(false);
      return undefined;
    }
    setEnrollmentImagesLoading(true);
    apiFetch(`/api/face-enrollment?userId=${encodeURIComponent(userId)}`, { cache: 'no-store' })
      .then(async response => {
        const result = await parseApiResponse(response, 'HR enrollment image request');
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load restricted HR enrollment images.');
        if (String(result.employeeId || '').trim().toLowerCase() !== String(employeeId).trim().toLowerCase()) {
          throw new Error('The enrollment record returned for HR does not match the selected employee ID. Do not approve; contact the system administrator.');
        }
        if (active) {
          setDilgIdPhoto(result.dilgIdImage || '');
          setDilgIdBackPhoto(result.dilgIdBackImage || '');
          setSavedEnrollmentImage(result.enrollmentImage || '');
          setIsDemoEnrollment(Boolean(result.enrollment?.biometricEnrollmentIsDemo));
          setBiometricReviewNote(result.enrollment?.biometricEnrollmentReviewNote || '');
          setEnrollmentImagesError('');
        }
      })
      .catch(error => {
        if (active) {
          setEnrollmentImagesError(error.message === 'No enrollment images are on file.'
            ? 'This employee has a pending review record, but the server has no ID or selfie images saved for it. Do not approve; ask the employee to resubmit all required images.'
            : error.message || 'Unable to load restricted HR enrollment images.');
        }
      })
      .finally(() => {
        if (active) setEnrollmentImagesLoading(false);
      });
    return () => { active = false; };
  }, [selectedId, selectedEmployee?._id, selectedEmployee?.employeeId, selectedEmployee?.hasDilgIdPhoto, selectedEmployee?.hasDilgIdBackPhoto, selectedEmployee?.hasFaceEnrollmentImage, selectedEmployee?.biometricEnrollmentStatus, enrollmentImagesReloadKey]);

  const notify = (message, isError = false) => {
    setToast(message);
    setToastIsError(isError);
    window.setTimeout(() => setToast(''), 6000);
  };

  const refreshEmployees = async () => {
    setEmployeesRefreshing(true);
    try {
      const response = await apiFetch('/api/employees');
      const data = await response.json();
      if (!response.ok || !Array.isArray(data?.users)) {
        throw new Error(data?.error || 'Unable to refresh employee records.');
      }
      onEmployeesChange?.(data.users);
      notify('Employee records refreshed.');
    } catch (error) {
      notify(error.message || 'Unable to refresh employee records.', true);
    } finally {
      setEmployeesRefreshing(false);
    }
  };

  useEffect(() => {
    refreshEmployees();
  }, []);

  const handleBiometricReview = async decision => {
    if (!selectedEmployee?.employeeId) return;
    if (decision === 'reject' && !biometricReviewNote.trim()) {
      notify('Add a rejection reason so the employee knows what to resubmit.', true);
      return;
    }
    setBiometricReviewLoading(true);
    try {
      const response = await apiFetch(`/api/face-enrollment?action=review&employeeId=${encodeURIComponent(selectedEmployee.employeeId)}&userId=${encodeURIComponent(selectedEmployee._id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: biometricReviewNote.trim() })
      });
      const data = await parseApiResponse(response, 'HR biometric review');
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save HR review.');
      onEmployeesChange?.(previous => previous.map(employee =>
        employeeKey(employee) === employeeKey(selectedEmployee)
          ? { ...employee, ...data.enrollment }
          : employee
      ));
      const reviewMessage = data.notificationWarning || (decision === 'approve'
        ? 'HR review approved. Attendance selfies will now be compared with the approved enrollment selfie. Liveness is not checked.'
        : 'Enrollment rejected. The employee was notified to correct and resubmit.');
      notify(reviewMessage, Boolean(data.notificationWarning));
    } catch (error) {
      notify(error.message || 'Unable to save HR review.', true);
    } finally {
      setBiometricReviewLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setScreen('editor');
  };

  const openEdit = (employee) => {
    const record = normalizeEmployee(employee);
    setEditingId(employeeKey(employee));
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
    setSelectedId(employeeKey(employee));
    // Adjustment and promotion forms belong to one employee, so start closed on each profile.
    setCreditForm(null);
    setPromotion(null);
    setScreen('profile');
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    if (name === 'approvedWfhMunicipality') {
      setForm(previous => ({ ...previous, [name]: value, approvedWfhBarangay: '' }));
      return;
    }
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleSaveEmployee = async event => {
    event.preventDefault();
    setEmployeeSaving(true);

    const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(' ');
    const employeeId = form.employeeId.trim() || `DILG-${Date.now().toString().slice(-6)}`;
    const normalized = {
      ...normalizeEmployee({
        ...form,
        name: fullName,
        employeeId,
        role: form.role || 'Employee',
        office: form.office || 'Administrative Office',
        employmentStatus: form.employmentStatus || 'ACTIVE',
        accountStatus: form.accountStatus || 'Pending',
        email: (form.email || '').trim().toLowerCase(),
        phoneNumber: form.phoneNumber || ''
      }),
      name: fullName,
      email: (form.email || '').trim().toLowerCase(),
      employeeId,
      role: form.role || 'Employee',
      office: form.office || 'Administrative Office',
      employmentStatus: form.employmentStatus || 'ACTIVE',
      accountStatus: form.accountStatus || 'Pending',
      accessLevel: 'employee',
      approvedWfhLocation: {
        municipality: form.approvedWfhMunicipality,
        barangay: form.approvedWfhBarangay,
        street: form.approvedWfhStreet,
        landmark: form.approvedWfhLandmark
      }
    };

    try {
      const existingEmployee = editingId
        ? employeeAccounts.find(employee => employeeKey(employee) === editingId)
        : null;
      if (editingId && !existingEmployee) {
        throw new Error('Employee record is no longer available. Refresh the employee list and try again.');
      }

      const endpoint = editingId
        ? `/api/employees/${encodeURIComponent(existingEmployee.employeeId || existingEmployee.email)}`
        : '/api/employees';
      const response = await apiFetch(endpoint, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? normalized : { ...normalized, password: form.password })
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.employee) {
        throw new Error(data.error || 'Unable to save employee record.');
      }

      const savedEmployee = data.employee;
      if (editingId) {
        onEmployeesChange?.(previous => previous.map(employee =>
          employeeKey(employee) === editingId ? { ...employee, ...savedEmployee } : employee
        ));
      } else {
        onEmployeesChange?.(previous => [savedEmployee, ...previous]);
      }

      const notification = {
        title: editingId ? 'Employee Account Updated' : 'New Employee Account Created',
        message: editingId
          ? `${fullName} employee record was updated by HR/Admin.`
          : `${fullName} employee account was created by HR/Admin.`,
        time: 'Just now',
        type: 'employee_management'
      };
      let notificationFailed = false;
      try {
        await onAdminNotification?.(notification);
      } catch (notificationError) {
        console.error('Employee account saved, but the HR notification failed:', notificationError);
        notificationFailed = true;
        notify('Employee record saved, but its notification could not be delivered.', true);
      }
      if (!notificationFailed) {
        const noticeNote = approvalNoticeNote(data.approvalNotice, fullName);
        notify(editingId ? `Employee account updated.${noticeNote ? ` ${noticeNote}` : ''}` : 'Employee account created.');
      }
      setScreen('list');
      setSelectedId(null);
      setForm(emptyForm);
    } catch (error) {
      notify(error.message || 'Unable to save employee record.', true);
    } finally {
      setEmployeeSaving(false);
    }
  };

  const updateAccountStatus = async (targetEmployee, accountStatus, { openProfile = true } = {}) => {
    if (!targetEmployee) return;
    const key = employeeKey(targetEmployee);
    const wasPending = accountStatusOf(targetEmployee) === 'pending';
    setAccountStatusUpdating(true);
    try {
      const identifier = targetEmployee.employeeId || targetEmployee.email;
      const response = await apiFetch(`/api/employees/${encodeURIComponent(identifier)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountStatus })
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.user) {
        throw new Error(data.error || 'Unable to update employee account status.');
      }
      onEmployeesChange?.(previous => previous.map(employee =>
        employeeKey(employee) === key
          ? {
              ...employee,
              ...data.user,
              id: employee.employeeId || employee.id
            }
          : employee
      ));
      let notificationFailed = false;
      try {
        await onAdminNotification?.({
          title: 'Employee Account Status Changed',
          message: `${employeeName(targetEmployee)} account status was updated to ${accountStatus} by HR/Admin.`,
          time: 'Just now',
          type: 'employee_management'
        });
      } catch (notificationError) {
        console.error('Employee status saved, but the HR notification failed:', notificationError);
        notificationFailed = true;
        notify('Employee status saved, but its notification could not be delivered.', true);
      }
      if (!notificationFailed) {
        const name = employeeName(targetEmployee);
        // Whether the employee was told by SMS or email that they can now log in.
        const noticeNote = approvalNoticeNote(data.approvalNotice, name);
        notify(wasPending && accountStatus === 'Active'
          ? `Account approved. ${noticeNote || `${name} can now log in.`}`
          : wasPending && accountStatus === 'Rejected'
            ? `Account rejected. ${name} cannot log in and will see "Rejected" when they check their account status.`
            : `Account status updated to ${accountStatus}.${noticeNote ? ` ${noticeNote}` : ''}`);
      }
      if (openProfile) setScreen('profile');
    } catch (error) {
      notify(error.message || 'Unable to update employee account status.', true);
    } finally {
      setAccountStatusUpdating(false);
    }
  };

  const handleAccountStatus = accountStatus => updateAccountStatus(selectedEmployee, accountStatus);

  // Deletes an account that is not Active. Attendance and request records are kept.
  const handleDeleteEmployee = async () => {
    if (!selectedEmployee) return;
    const name = employeeName(selectedEmployee);
    const confirmed = window.confirm(
      `Delete ${name}'s account permanently?

They will no longer be able to log in, and their ID photos and enrollment selfie will be removed. Their attendance and leave/travel records are kept.

This cannot be undone.`
    );
    if (!confirmed) return;
    const key = employeeKey(selectedEmployee);
    setAccountStatusUpdating(true);
    try {
      const identifier = selectedEmployee.employeeId || selectedEmployee.email;
      const response = await apiFetch(`/api/employees/${encodeURIComponent(identifier)}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to delete the employee account.');
      }
      onEmployeesChange?.(previous => previous.filter(employee => employeeKey(employee) !== key));
      setSelectedId(null);
      setScreen('list');
      notify(`${name}'s account was deleted. Their attendance and request records were kept.`);
    } catch (error) {
      notify(error.message || 'Unable to delete the employee account.', true);
    } finally {
      setAccountStatusUpdating(false);
    }
  };

  // Promotes the selected employee to Supervisor or HR/Admin. HR/Admin needs HR's password.
  const promoteEmployee = async event => {
    event.preventDefault();
    if (!selectedEmployee || !promotion) return;
    const key = employeeKey(selectedEmployee);
    const label = promotion.accessLevel === 'hr_admin' ? 'HR/Admin' : 'Supervisor';
    setPromotionSaving(true);
    try {
      const identifier = selectedEmployee.employeeId || selectedEmployee.email;
      const response = await apiFetch(`/api/staff/${encodeURIComponent(identifier)}/access`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessLevel: promotion.accessLevel, adminPassword: promotion.password })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to change access.');
      onEmployeesChange?.(previous => previous.filter(employee => employeeKey(employee) !== key));
      setPromotion(null);
      setSelectedId(null);
      setScreen('list');
      notify(`${employeeName(selectedEmployee)} is now ${label}. Find them under Supervisors & HR/Admin.`);
    } catch (error) {
      notify(error.message || 'Unable to change access.', true);
    } finally {
      setPromotionSaving(false);
    }
  };

  const creditsOf = employee => ({
    vacationLeaveCredits: Number(employee?.vacationLeaveCredits ?? 15),
    sickLeaveCredits: Number(employee?.sickLeaveCredits ?? 15)
  });

  const startCreditAdjustment = () => {
    const credits = creditsOf(selectedEmployee);
    setCreditForm({ vacationLeaveCredits: String(credits.vacationLeaveCredits), sickLeaveCredits: String(credits.sickLeaveCredits), reason: '' });
  };

  // Saves HR's adjustment of the selected employee's leave balances.
  const saveLeaveCredits = async event => {
    event.preventDefault();
    if (!selectedEmployee || !creditForm) return;
    const key = employeeKey(selectedEmployee);
    setCreditSaving(true);
    try {
      const identifier = selectedEmployee.employeeId || selectedEmployee.email;
      const response = await apiFetch(`/api/employees/${encodeURIComponent(identifier)}/leave-credits`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creditForm)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.employee) throw new Error(data.error || 'Unable to update leave credits.');
      onEmployeesChange?.(previous => previous.map(employee => employeeKey(employee) === key ? { ...employee, ...data.employee } : employee));
      setCreditForm(null);
      notify('Leave credits updated. The employee was notified.');
    } catch (error) {
      notify(error.message || 'Unable to update leave credits.', true);
    } finally {
      setCreditSaving(false);
    }
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
            <p className="mt-1 text-xs font-semibold text-slate-500">Employee account details are saved to the shared database and used across HR and employee views.</p>

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
              {!editingId && (
                <label className="text-[11px] font-black text-slate-600">Initial Employee Password
                  <input name="password" type="password" value={form.password} onChange={handleChange} minLength={10} maxLength={256} autoComplete="new-password" required className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500" />
                  <span className="mt-1 block text-xs font-medium text-slate-500">At least 10 characters. Share it securely with the employee.</span>
                </label>
              )}

              <label className="text-[11px] font-black text-slate-600 sm:col-span-2 xl:col-span-2">Address
                <input name="address" value={form.address} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500" />
              </label>

              <label className="text-[11px] font-black text-slate-600">Employee Job Designation
                <input name="role" value={form.role} onChange={handleChange} placeholder="e.g. Administrative Officer" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500" />
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
                  <option value="Rejected">Rejected</option>
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

              <div className="sm:col-span-2 xl:col-span-4">
                <p className="text-[11px] font-black text-slate-700">Approved Work-From-Home Location</p>
                <p className="mt-1 text-xs font-medium text-slate-500">Saving a valid municipality and barangay approves this WFH geofence for the employee.</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="text-[11px] font-black text-slate-600">Municipality
                    <select name="approvedWfhMunicipality" value={form.approvedWfhMunicipality} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500">
                      <option value="">Not approved</option>
                      {Object.keys(MARINDUQUE_MUNICIPALITIES).map(municipality => <option key={municipality} value={municipality}>{municipality}</option>)}
                    </select>
                  </label>
                  <label className="text-[11px] font-black text-slate-600">Barangay
                    <select name="approvedWfhBarangay" value={form.approvedWfhBarangay} onChange={handleChange} disabled={!form.approvedWfhMunicipality} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500 disabled:opacity-60">
                      <option value="">Select barangay</option>
                      {(MARINDUQUE_MUNICIPALITIES[form.approvedWfhMunicipality] || []).map(barangay => <option key={barangay} value={barangay}>{barangay}</option>)}
                    </select>
                  </label>
                  <label className="text-[11px] font-black text-slate-600">Street / House
                    <input name="approvedWfhStreet" value={form.approvedWfhStreet} onChange={handleChange} maxLength={120} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500" />
                  </label>
                  <label className="text-[11px] font-black text-slate-600">Landmark
                    <input name="approvedWfhLandmark" value={form.approvedWfhLandmark} onChange={handleChange} maxLength={120} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold outline-none focus:border-blue-500" />
                  </label>
                </div>
              </div>
            </div>
          </section>

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={employeeSaving} className="rounded-xl bg-blue-700 px-4 py-3 text-xs font-black text-white disabled:cursor-wait disabled:opacity-60">{employeeSaving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Employee Account'}</button>
            <button type="button" onClick={() => setScreen('list')} disabled={employeeSaving} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700 disabled:opacity-50">Cancel</button>
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
            <span className={`rounded-full px-2.5 py-1 text-xs font-black ${statusStyle(selectedEmployee.employmentStatus || selectedEmployee.status || 'ACTIVE')}`}>
              {selectedEmployee.employmentStatus || selectedEmployee.status || 'ACTIVE'}
            </span>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">
              {selectedEmployee.accountStatus || 'Pending'} account
            </span>
          </div>
          {isDemoEnrollment && (
            <p role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-black text-amber-900">
              DEMO ONLY — this submission contains fictional sample ID images. You may approve it to test attendance selfie matching, but this is not identity verification and must not be used for real employee approval.
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => openEdit(selectedEmployee)} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-xs font-black text-white">
              <Pencil className="h-4 w-4" /> Edit
            </button>
            {accountStatusOf(selectedEmployee) === 'active' ? (
              <button type="button" onClick={() => handleAccountStatus('Inactive')} disabled={accountStatusUpdating} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 disabled:opacity-50">{accountStatusUpdating ? 'Saving...' : 'Deactivate'}</button>
            ) : accountStatusOf(selectedEmployee) !== 'pending' && (
              <button type="button" onClick={() => handleAccountStatus('Active')} disabled={accountStatusUpdating} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{accountStatusUpdating ? 'Saving...' : accountStatusOf(selectedEmployee) === 'rejected' ? 'Approve account' : 'Reactivate'}</button>
            )}
            {accountStatusOf(selectedEmployee) !== 'active' && (
              <button type="button" onClick={handleDeleteEmployee} disabled={accountStatusUpdating} className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-black text-rose-700 disabled:opacity-50">{accountStatusUpdating ? 'Saving...' : 'Delete account'}</button>
            )}
          </div>
          {accountStatusOf(selectedEmployee) === 'active' && (
            <p className="mt-2 text-xs font-semibold text-slate-500">To delete this account, deactivate it first.</p>
          )}

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Access</p>
            {promotion ? (
              <form onSubmit={promoteEmployee} className="mt-2 space-y-2">
                <p className="text-xs font-semibold text-slate-700">
                  Make {employeeName(selectedEmployee)} a {promotion.accessLevel === 'hr_admin' ? 'HR/Admin' : 'Supervisor'}? They will log in with that role, and their attendance and leave records are kept.
                </p>
                {promotion.accessLevel === 'hr_admin' && (
                  <label className="block text-xs font-black uppercase text-slate-500">Your current password (required for HR/Admin)
                    <input type="password" autoComplete="current-password" required value={promotion.password} onChange={event => setPromotion(current => ({ ...current, password: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold normal-case text-slate-800" />
                  </label>
                )}
                <div className="flex gap-2">
                  <button type="submit" disabled={promotionSaving} className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{promotionSaving ? 'Saving...' : 'Confirm'}</button>
                  <button type="button" onClick={() => setPromotion(null)} disabled={promotionSaving} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700">Cancel</button>
                </div>
              </form>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-600">Employee</span>
                <button type="button" onClick={() => setPromotion({ accessLevel: 'supervisor', password: '' })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-black text-slate-700">Make Supervisor</button>
                <button type="button" onClick={() => setPromotion({ accessLevel: 'hr_admin', password: '' })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-black text-slate-700">Make HR/Admin</button>
              </div>
            )}
          </div>

          <HRResetPasswordCard key={employeeKey(selectedEmployee)} account={selectedEmployee} />

          {accountStatusOf(selectedEmployee) === 'pending' && (
            <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-black text-amber-900">This account is waiting for approval</p>
              <p className="mt-1 text-xs font-semibold text-amber-800">
                Check that {selectedEmployee.email || 'this email'} belongs to a DILG employee. After approval, they can log in; set their office and job designation with Edit.
              </p>
              <p className="mt-1 text-xs font-semibold text-amber-800">
                {signedUpWithGoogle(selectedEmployee)
                  ? `Signed up with Google. They will get an email at ${selectedEmployee.email} when you approve.`
                  : mobileNumberOf(selectedEmployee)
                    ? `They will get an SMS at ${selectedEmployee.phoneNumber} when you approve.`
                    : 'No mobile number on file, so no SMS will be sent. Add one with Edit before approving, or let them know yourself.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => handleAccountStatus('Active')} disabled={accountStatusUpdating} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{accountStatusUpdating ? 'Saving...' : 'Approve account'}</button>
                <button type="button" onClick={() => handleAccountStatus('Rejected')} disabled={accountStatusUpdating} className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-xs font-black text-rose-700 disabled:opacity-50">{accountStatusUpdating ? 'Saving...' : 'Reject'}</button>
              </div>
            </div>
          )}

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-700">Leave Credits</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">Approved vacation, forced, and sick leave is deducted automatically. Adjust here to match the official leave card.</p>
              </div>
              {!creditForm && (
                <button type="button" onClick={startCreditAdjustment} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700">Adjust</button>
              )}
            </div>
            {creditForm ? (
              <form onSubmit={saveLeaveCredits} className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-black uppercase text-slate-500">Vacation leave (days)
                    <input type="number" min="0" max="1000" step="0.001" required value={creditForm.vacationLeaveCredits} onChange={event => setCreditForm(form => ({ ...form, vacationLeaveCredits: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800" />
                  </label>
                  <label className="text-xs font-black uppercase text-slate-500">Sick leave (days)
                    <input type="number" min="0" max="1000" step="0.001" required value={creditForm.sickLeaveCredits} onChange={event => setCreditForm(form => ({ ...form, sickLeaveCredits: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800" />
                  </label>
                </div>
                <label className="block text-xs font-black uppercase text-slate-500">Reason (recorded and sent to the employee)
                  <input required maxLength={300} value={creditForm.reason} onChange={event => setCreditForm(form => ({ ...form, reason: event.target.value }))} placeholder="e.g. Balance from the leave card as of September 2026" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold normal-case text-slate-800" />
                </label>
                <div className="flex gap-2">
                  <button type="submit" disabled={creditSaving} className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{creditSaving ? 'Saving...' : 'Save credits'}</button>
                  <button type="button" onClick={() => setCreditForm(null)} disabled={creditSaving} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700">Cancel</button>
                </div>
              </form>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {[['Vacation leave', creditsOf(selectedEmployee).vacationLeaveCredits], ['Sick leave', creditsOf(selectedEmployee).sickLeaveCredits]].map(([label, days]) => (
                  <div key={label} className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-black uppercase text-slate-500">{label}</p>
                    <p className="mt-1 text-xl font-black text-slate-900">{days} <span className="text-xs font-bold text-slate-500">days</span></p>
                  </div>
                ))}
              </div>
            )}
            {(() => {
              const last = (selectedEmployee.leaveCreditHistory || []).at(-1);
              return last ? (
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  Last adjusted {new Date(last.changedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} by {last.changedBy}: {last.reason}
                </p>
              ) : null;
            })()}
          </section>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-700">Biometric Enrollment Review</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">Review the employee-submitted ID and enrollment selfie. After approval, attendance selfies are automatically matched; liveness is not checked.</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-black ${
                selectedEmployee.biometricEnrollmentStatus === 'rejected'
                  ? 'bg-rose-100 text-rose-800'
                  : selectedEmployee.biometricEnrollmentStatus === 'hr-approved'
                    ? 'bg-blue-100 text-blue-800'
                    : selectedEmployee.biometricEnrollmentStatus === 'pending'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-600'
              }`}>
                {selectedEmployee.biometricEnrollmentStatus === 'pending'
                  ? 'Pending HR review'
                  : selectedEmployee.biometricEnrollmentStatus === 'hr-approved'
                    ? selectedEmployee.biometricEnrollmentIsDemo
                      ? 'DEMO approved · attendance matching for testing'
                      : 'HR approved · attendance face matching enabled'
                    : selectedEmployee.biometricEnrollmentStatus === 'rejected'
                      ? 'Not approved'
                      : 'Not submitted'}
              </span>
            </div>
            {selectedEmployee.biometricEnrollmentSubmittedAt && (
              <p className="mt-2 text-xs font-semibold text-slate-500">
                Submitted {new Date(selectedEmployee.biometricEnrollmentSubmittedAt).toLocaleString()}
                {selectedEmployee.biometricEnrollmentReviewedAt ? ` · reviewed ${new Date(selectedEmployee.biometricEnrollmentReviewedAt).toLocaleString()}` : ''}
              </p>
            )}
            {(() => {
              const fingerprints = registeredFingerprints(selectedEmployee);
              return (
                <div className={`mt-3 rounded-xl border p-3 ${fingerprints.length ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                  <p className={`flex items-center gap-1.5 text-xs font-black uppercase tracking-wide ${fingerprints.length ? 'text-emerald-800' : 'text-slate-600'}`}>
                    <Fingerprint className="h-3.5 w-3.5" /> Fingerprint for Time In
                  </p>
                  {fingerprints.length ? (
                    <>
                      {fingerprints.map(({ source, registeredAt }) => (
                        <p key={source} className="mt-1 text-xs font-bold text-emerald-900">
                          Registered · {source}{registeredAt ? ` · ${new Date(registeredAt).toLocaleString()}` : ''}
                        </p>
                      ))}
                      <p className="mt-1 text-xs font-semibold text-emerald-800">Every Time In must match this registered fingerprint. The fingerprint itself never leaves the employee's phone; WorkMate keeps only the phone's security key, so there is no fingerprint image to view.</p>
                    </>
                  ) : (
                    <p className="mt-1 text-xs font-semibold text-slate-600">Not registered yet. The employee registers it on the Biometric Enrollment page. Time In needs a registered fingerprint.</p>
                  )}
                </div>
              );
            })()}
            {(dilgIdPhoto || dilgIdBackPhoto || savedEnrollmentImage) ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {dilgIdPhoto && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-2">
                    <p className="mb-2 text-xs font-black uppercase tracking-wide text-amber-900">Government ID · Front</p>
                    <img src={dilgIdPhoto} alt="Employee-submitted front of government ID for HR review" className="max-h-64 w-full rounded-lg object-contain" />
                  </div>
                )}
                {dilgIdBackPhoto && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-2">
                    <p className="mb-2 text-xs font-black uppercase tracking-wide text-amber-900">Government ID · Back</p>
                    <img src={dilgIdBackPhoto} alt="Employee-submitted back of government ID for HR review" className="max-h-64 w-full rounded-lg object-contain" />
                  </div>
                )}
                {savedEnrollmentImage && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-2">
                    <p className="mb-2 text-xs font-black uppercase tracking-wide text-blue-900">Employee enrollment selfie</p>
                    <img src={savedEnrollmentImage} alt="Employee-submitted enrollment selfie for HR review" className="max-h-64 w-full rounded-lg object-contain" />
                  </div>
                )}
              </div>
            ) : enrollmentImagesLoading ? (
              <p role="status" className="mt-3 rounded-xl bg-blue-50 p-3 text-xs font-semibold text-blue-800">Loading the employee's submitted enrollment images...</p>
            ) : enrollmentImagesError ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p role="alert" className="text-xs font-semibold text-rose-800">{enrollmentImagesError}</p>
                <button
                  type="button"
                  onClick={() => setEnrollmentImagesReloadKey(previous => previous + 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-black text-rose-800"
                >
                  <RefreshCw className="h-3 w-3" /> Retry
                </button>
              </div>
            ) : (
              selectedEmployee.biometricEnrollmentStatus === 'pending' ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-800">No enrollment images were returned for this pending submission. Retry loading or ask the employee to submit again.</p>
                  <button
                    type="button"
                    onClick={() => setEnrollmentImagesReloadKey(previous => previous + 1)}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800"
                  >
                    <RefreshCw className="h-3 w-3" /> Retry
                  </button>
                </div>
              ) : (
                <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-500">The employee has not submitted enrollment images.</p>
              )
            )}
            {selectedEmployee.biometricEnrollmentReviewNote && (
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                Previous HR note: {selectedEmployee.biometricEnrollmentReviewNote}
                {selectedEmployee.biometricEnrollmentReviewedBy ? ` · ${selectedEmployee.biometricEnrollmentReviewedBy}` : ''}
              </p>
            )}
            {selectedEmployee.biometricEnrollmentStatus === 'pending' && (
              <div className="mt-4 space-y-3">
                <label className="block text-[11px] font-black text-slate-600">
                  HR review note
                  <textarea
                    value={biometricReviewNote}
                    onChange={event => setBiometricReviewNote(event.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="Required if rejecting. Add correction instructions for the employee."
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-medium outline-none focus:border-blue-500"
                  />
                </label>
                {isDemoEnrollment ? (
                  <p role="status" className="text-xs font-semibold text-amber-800">This is a demo enrollment. Approving enables attendance selfie matching for testing only.</p>
                ) : (!dilgIdPhoto || (requiresBackId && !dilgIdBackPhoto) || !savedEnrollmentImage) && (
                  <p role="status" className="text-xs font-semibold text-amber-800">This submission is missing one or more required images. Ask the employee to resubmit before approving.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => handleBiometricReview('approve')} disabled={biometricReviewLoading || !dilgIdPhoto || (requiresBackId && !dilgIdBackPhoto) || !savedEnrollmentImage} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
                    {biometricReviewLoading ? 'Saving...' : isDemoEnrollment ? 'Approve Demo for Testing' : 'Approve HR Review'}
                  </button>
                  <button type="button" onClick={() => handleBiometricReview('reject')} disabled={biometricReviewLoading} className="rounded-xl bg-rose-700 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
                    {biometricReviewLoading ? 'Saving...' : 'Reject & Notify Employee'}
                  </button>
                </div>
                <p className="text-xs font-semibold text-amber-800">Approval enables face matching for attendance selfies. It does not check liveness or prevent photo/screen replay.</p>
              </div>
            )}
          </section>
          {toast && (
            <div role={toastIsError ? 'alert' : 'status'} className={`mt-3 rounded-xl border px-3 py-2 text-xs font-bold ${
              toastIsError
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}>
              {toast}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-xs font-black uppercase tracking-wide text-slate-700">Enrollment Activity</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">Enrollment, fingerprint registration, and HR review events. Attendance face matches are shown on DTR records; liveness is not checked.</p>
          {selectedEmployee.faceVerificationAudit?.length ? (
            <div className="mt-3 space-y-2">
              {[...selectedEmployee.faceVerificationAudit].slice(-5).reverse().map((event, index) => (
                <div key={`${event.timestamp}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                  <div>
                    <p className="font-black text-blue-700">
                      {String(event.outcome || 'unknown').replaceAll('-', ' ').toUpperCase()}
                    </p>
                    <p className="mt-1 font-semibold text-slate-500">
                      {event.timestamp ? new Date(event.timestamp).toLocaleString() : 'Unknown time'}
                      {event.deviceId ? ` · Device ${event.deviceId}` : ''}
                      {event.reviewedBy ? ` · HR ${event.reviewedBy}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-500">No enrollment events recorded yet.</p>
          )}
          {selectedEmployee.dilgIdVerifiedAt && (
            <p className="mt-3 text-xs font-semibold text-slate-500">
              HR manually recorded ID review {new Date(selectedEmployee.dilgIdVerifiedAt).toLocaleString()}
              {selectedEmployee.dilgIdVerifiedBy ? ` by ${selectedEmployee.dilgIdVerifiedBy}` : ''}
              {' · attendance face matching runs after HR approval'}
            </p>
          )}
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Employee Information</p>
            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3"><UserRound className="mt-0.5 h-4 w-4 text-blue-600" /><div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Full Name</p><p className="mt-1 text-xs font-bold text-slate-800">{employeeName(selectedEmployee)}</p></div></div>
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3"><Mail className="mt-0.5 h-4 w-4 text-blue-600" /><div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Email</p><p className="mt-1 text-xs font-bold text-slate-800">{selectedEmployee.email || '-'}</p></div></div>
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3"><Phone className="mt-0.5 h-4 w-4 text-blue-600" /><div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Phone</p><p className="mt-1 text-xs font-bold text-slate-800">{selectedEmployee.phoneNumber || '-'}</p></div></div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Assignment Details</p>
            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3"><Building2 className="mt-0.5 h-4 w-4 text-blue-600" /><div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Office</p><p className="mt-1 text-xs font-bold text-slate-800">{selectedEmployee.office || '-'}</p></div></div>
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3"><ShieldCheck className="mt-0.5 h-4 w-4 text-blue-600" /><div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Role</p><p className="mt-1 text-xs font-bold text-slate-800">{selectedEmployee.role || '-'}</p></div></div>
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3"><MapPin className="mt-0.5 h-4 w-4 text-blue-600" /><div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Assigned LGU / Station</p><p className="mt-1 text-xs font-bold text-slate-800">{selectedEmployee.assignedLGU || selectedEmployee.assignedStation || '-'}</p></div></div>
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
            <p className="text-sm font-semibold text-slate-600">Create and manage employee accounts, job designations, and access status.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={refreshEmployees} disabled={employeesRefreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${employeesRefreshing ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-3 py-2 text-xs font-black text-white">
              <Plus className="h-4 w-4" /> Add Employee
            </button>
          </div>
        </div>

        {toast && (
          <div role={toastIsError ? 'alert' : 'status'} className={`rounded-xl border px-3 py-2 text-xs font-black ${
            toastIsError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}>
            {toast}
          </div>
        )}
      </header>

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee or email..." className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm shadow-sm outline-none focus:border-blue-500" />
        </div>
        <button
          type="button"
          onClick={() => setStatusFilter((current) => STATUS_FILTERS[(STATUS_FILTERS.indexOf(current) + 1) % STATUS_FILTERS.length])}
          className={`flex h-11 w-11 items-center justify-center rounded-xl border shadow-sm ${statusFilter === 'All' ? 'border-slate-200 bg-white text-slate-600' : 'border-blue-300 bg-blue-50 text-blue-700'}`}
          title={`Filter employees (showing: ${statusFilter})`}
        >
          <Filter className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => { setStatusFilter('All'); setShowBiometricPending(false); }}
          aria-pressed={statusFilter === 'All' && !showBiometricPending}
          className={`rounded-2xl border p-3 text-left shadow-sm ${statusFilter === 'All' && !showBiometricPending ? 'border-slate-400 bg-slate-50' : 'border-slate-200 bg-white'}`}
        >
          <p className="text-xs font-black uppercase text-slate-500">Total Employees</p>
          <strong className="mt-1 block text-2xl text-slate-900">{totalCount}</strong>
          <span className="text-xs font-semibold text-slate-500">{statusFilter === 'All' && !showBiometricPending ? 'Showing all' : 'Show all'}</span>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter(current => (current === 'Active' ? 'All' : 'Active'))}
          aria-pressed={statusFilter === 'Active'}
          className={`rounded-2xl border p-3 text-left shadow-sm ${statusFilter === 'Active' ? 'border-emerald-300 bg-emerald-100' : 'border-emerald-100 bg-emerald-50'}`}
        >
          <p className="text-xs font-black uppercase text-emerald-700">Active</p>
          <strong className="mt-1 block text-2xl text-emerald-700">{activeCount}</strong>
          <span className="text-xs font-semibold text-emerald-700">{statusFilter === 'Active' ? 'Showing active' : 'Show active'}</span>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter(current => (current === 'Pending' ? 'All' : 'Pending'))}
          aria-pressed={statusFilter === 'Pending'}
          className={`rounded-2xl border p-3 text-left shadow-sm ${statusFilter === 'Pending' ? 'border-amber-300 bg-amber-100' : 'border-amber-100 bg-amber-50'}`}
        >
          <p className="text-xs font-black uppercase text-amber-700">Pending</p>
          <strong className="mt-1 block text-2xl text-amber-700">{pendingCount}</strong>
          <span className="text-xs font-semibold text-amber-700">{statusFilter === 'Pending' ? 'Showing pending' : 'Show pending'}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowBiometricPending(current => !current)}
          aria-pressed={showBiometricPending}
          className={`rounded-2xl border p-3 text-left shadow-sm ${showBiometricPending ? 'border-amber-300 bg-amber-100' : 'border-amber-100 bg-amber-50'}`}
        >
          <p className="text-xs font-black uppercase text-amber-800">Biometric Reviews</p>
          <strong className="mt-1 block text-2xl text-amber-800">{pendingBiometricCount}</strong>
          <span className="text-xs font-semibold text-amber-800">{showBiometricPending ? 'Showing pending' : 'Show pending'}</span>
        </button>
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
                {showStationColumn && <th className="px-3 py-3 font-black uppercase tracking-wide">Assigned Station</th>}
                <th className="px-3 py-3 font-black uppercase tracking-wide text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={showStationColumn ? 6 : 5} className="px-3 py-8 text-center text-sm font-semibold text-slate-500">No employees found.</td>
                </tr>
              ) : (
                filteredEmployees.map((employee) => {
                  const key = employeeKey(employee);
                  return (
                    <tr key={key} className="border-t border-slate-100">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-xs font-black text-blue-700">
                            {employee.profilePicture ? (
                              <img src={employee.profilePicture} alt={employeeName(employee)} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              initials(employeeName(employee))
                            )}
                          </div>
                          <div>
                            <p className="font-black text-slate-800">{employeeName(employee)}</p>
                            <p className="text-xs text-slate-500">{employee.email || 'No email'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{employee.role || 'Employee'}</td>
                      <td className="px-3 py-3 text-slate-700">{employee.office || 'Administrative Office'}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full px-2 py-1 text-xs font-black ${statusStyle(employee.accountStatus || 'Pending')}`}>
                            {employee.accountStatus || 'Pending'}
                          </span>
                          {employee.biometricEnrollmentStatus === 'pending' && (
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-black text-amber-800">Biometric review</span>
                          )}
                        </div>
                        {/* One line under the badge; employment status only when it is not the usual ACTIVE. */}
                        <span className={`mt-1 block text-xs font-semibold ${employee.hasBrowserFingerprint || employee.hasPhoneFingerprint ? 'text-emerald-700' : 'text-slate-500'}`}>
                          {employee.hasBrowserFingerprint || employee.hasPhoneFingerprint ? 'Fingerprint ✓' : 'No fingerprint'}
                          {employmentNote(employee)}
                        </span>
                      </td>
                      {showStationColumn && <td className="px-3 py-3 text-slate-700">{employee.assignedStation || employee.assignedLGU || '—'}</td>}
                      <td className="px-3 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {accountStatusOf(employee) === 'pending' && (
                            <button type="button" onClick={() => updateAccountStatus(employee, 'Active', { openProfile: false })} disabled={accountStatusUpdating} className="rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-black text-white disabled:opacity-50">Approve</button>
                          )}
                          <button type="button" onClick={() => openView(employee)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-black text-slate-700">View</button>
                          <button type="button" onClick={() => openEdit(employee)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-black text-slate-700">Edit</button>
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
