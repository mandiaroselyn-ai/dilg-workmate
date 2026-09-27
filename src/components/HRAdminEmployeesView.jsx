import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Camera,
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
import { resizeFaceImage } from '../utils/faceImage';
import { apiFetch } from '../utils/api';

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
  const [toastIsError, setToastIsError] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [facePhotoPreparing, setFacePhotoPreparing] = useState(false);
  const [faceEnrollmentLoading, setFaceEnrollmentLoading] = useState(false);
  const [enrollmentSelfie, setEnrollmentSelfie] = useState('');
  const [savedEnrollmentImage, setSavedEnrollmentImage] = useState('');
  const [dilgIdPhoto, setDilgIdPhoto] = useState('');
  const [hrIdentityConfirmed, setHrIdentityConfirmed] = useState(false);
  const [enrollmentCameraActive, setEnrollmentCameraActive] = useState(false);
  const [enrollmentCameraError, setEnrollmentCameraError] = useState('');
  const enrollmentVideoRef = useRef(null);
  const enrollmentStreamRef = useRef(null);

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
    return employeeKey(employee) === selectedId;
  });

  useEffect(() => {
    let active = true;
    setDilgIdPhoto('');
    setSavedEnrollmentImage('');
    if ((!selectedEmployee?.hasDilgIdPhoto && !selectedEmployee?.hasFaceEnrollmentImage) || !selectedEmployee.employeeId) return undefined;
    apiFetch(`/api/face/enrollment/${encodeURIComponent(selectedEmployee.employeeId)}`)
      .then(async response => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load restricted HR enrollment images.');
        if (active) {
          setDilgIdPhoto(result.dilgIdImage || '');
          setSavedEnrollmentImage(result.enrollmentImage || '');
        }
      })
      .catch(error => {
        if (active) notify(error.message || 'Unable to load restricted HR enrollment images.', true);
      });
    return () => { active = false; };
  }, [selectedId, selectedEmployee?.employeeId, selectedEmployee?.hasDilgIdPhoto, selectedEmployee?.hasFaceEnrollmentImage]);

  const notify = (message, isError = false) => {
    setToast(message);
    setToastIsError(isError);
    window.setTimeout(() => setToast(''), 6000);
  };

  const handleFaceEnrollment = async () => {
    if (!selectedEmployee?.employeeId) {
      notify('This employee has no employee ID. Add a valid employee ID before enrolling a face.', true);
      return;
    }
    if (!enrollmentSelfie.startsWith('data:image/')) {
      notify('Capture a fresh enrollment selfie while the employee is present.', true);
      return;
    }
    if (!dilgIdPhoto.startsWith('data:image/')) {
      notify('Upload the employee’s DILG ID photo before enrollment.', true);
      return;
    }
    if (!hrIdentityConfirmed) {
      notify('Confirm that you physically checked the DILG ID and matched it to the HR record.', true);
      return;
    }
    if (!onEnrollEmployeeFace) {
      notify('Face enrollment is unavailable. Refresh the HR portal and try again.', true);
      return;
    }

    setFaceEnrollmentLoading(true);
    try {
      const result = await onEnrollEmployeeFace(selectedEmployee, {
        dilgIdImage: dilgIdPhoto,
        selfieImage: enrollmentSelfie,
        hrConfirmed: hrIdentityConfirmed
      });
      onEmployeesChange?.(previous => previous.map(employee =>
        employeeKey(employee) === employeeKey(selectedEmployee)
          ? {
              ...employee,
              hasDilgIdPhoto: true,
              hasFaceEnrollmentImage: true,
              dilgIdVerifiedAt: result.dilgIdVerifiedAt,
              faceEnrolledAt: result.faceEnrolledAt
            }
          : employee
      ));
      setSavedEnrollmentImage(enrollmentSelfie);
      setEnrollmentSelfie('');
      setHrIdentityConfirmed(false);
      notify('HR ID check and enrollment selfie recorded. There is no automatic face match or liveness check.');
    } catch (error) {
      notify(error.message || 'Face enrollment failed. Check the server configuration and try again.', true);
    } finally {
      setFaceEnrollmentLoading(false);
    }
  };

  const stopEnrollmentCamera = () => {
    enrollmentStreamRef.current?.getTracks().forEach(track => track.stop());
    enrollmentStreamRef.current = null;
    setEnrollmentCameraActive(false);
  };

  const startEnrollmentCamera = async () => {
    setEnrollmentCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setEnrollmentCameraError('A secure live camera is not available in this browser. Open HR enrollment on a camera-enabled HTTPS browser.');
      return;
    }
    try {
      stopEnrollmentCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }
      });
      enrollmentStreamRef.current = stream;
      setEnrollmentSelfie('');
      setEnrollmentCameraActive(true);
    } catch (error) {
      setEnrollmentCameraError(error.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access to take a live enrollment selfie.'
        : `Unable to start the live enrollment camera: ${error.message || 'camera unavailable'}`);
    }
  };

  useEffect(() => {
    if (enrollmentCameraActive && enrollmentVideoRef.current && enrollmentStreamRef.current) {
      enrollmentVideoRef.current.srcObject = enrollmentStreamRef.current;
    }
  }, [enrollmentCameraActive]);

  useEffect(() => () => {
    enrollmentStreamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  const captureEnrollmentSelfie = () => {
    const video = enrollmentVideoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setEnrollmentCameraError('Wait for the live camera preview before capturing the employee selfie.');
      return;
    }
    const longestSide = Math.max(video.videoWidth, video.videoHeight);
    if (!longestSide) {
      setEnrollmentCameraError('Live camera image is not ready. Retry the capture.');
      return;
    }
    const scale = Math.min(1, 1280 / longestSide);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      setEnrollmentCameraError('Unable to process the live selfie image.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setEnrollmentSelfie(canvas.toDataURL('image/jpeg', 0.85));
    setHrIdentityConfirmed(false);
    setEnrollmentCameraError('');
    stopEnrollmentCamera();
    notify('Fresh live enrollment selfie captured. Compare it with the employee’s DILG ID.');
  };

  const handleDilgIdPhotoUpload = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('Choose an image file of the DILG ID.', true);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      notify('Choose an ID image smaller than 20 MB.', true);
      return;
    }
    setFacePhotoPreparing(true);
    try {
      const image = await resizeFaceImage(file);
      setDilgIdPhoto(image);
      setHrIdentityConfirmed(false);
      notify('DILG ID photo prepared. It is retained in the restricted HR record after enrollment.');
    } catch (error) {
      notify(error.message || 'Unable to prepare this ID photo.', true);
    } finally {
      setFacePhotoPreparing(false);
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
    stopEnrollmentCamera();
    setSelectedId(employeeKey(employee));
    setEnrollmentSelfie('');
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
          return employeeKey(employee) === editingId ? { ...employee, ...normalized } : employee;
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
    const key = employeeKey(selectedEmployee);
    onEmployeesChange?.((previous) =>
      previous.map((employee) => {
        const currentKey = employeeKey(employee);
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
        <button type="button" onClick={() => { stopEnrollmentCamera(); setScreen('list'); }} className="inline-flex items-center gap-1 text-xs font-black text-blue-700">
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
            <label htmlFor="employee-dilg-id-photo" className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-xs font-black ${facePhotoPreparing ? 'border-slate-200 bg-slate-100 text-slate-400' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              <ShieldCheck className="h-4 w-4" />
              {dilgIdPhoto ? 'Change DILG ID Photo' : selectedEmployee.hasDilgIdPhoto ? 'Loading DILG ID Photo...' : 'Upload DILG ID Photo'}
            </label>
            <input
              id="employee-dilg-id-photo"
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={facePhotoPreparing}
              onChange={handleDilgIdPhotoUpload}
            />
            {!enrollmentCameraActive && (
              <button type="button" onClick={startEnrollmentCamera} disabled={faceEnrollmentLoading} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-black text-blue-700 disabled:opacity-50">
                <Camera className="h-4 w-4" />
                {enrollmentSelfie ? 'Retake Enrollment Selfie' : 'Capture Enrollment Selfie'}
              </button>
            )}
            {enrollmentCameraActive && (
              <div className="w-full space-y-2 rounded-xl border border-blue-200 bg-slate-950 p-3">
                <video ref={enrollmentVideoRef} autoPlay playsInline muted className="mx-auto max-h-64 w-full rounded-lg object-contain" />
                <div className="flex gap-2">
                  <button type="button" onClick={captureEnrollmentSelfie} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white">Capture Selfie Photo</button>
                  <button type="button" onClick={stopEnrollmentCamera} className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-black text-white">Cancel Camera</button>
                </div>
              </div>
            )}
            <label className="flex w-full items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-900">
              <input
                type="checkbox"
                checked={hrIdentityConfirmed}
                onChange={event => setHrIdentityConfirmed(event.target.checked)}
                disabled={!dilgIdPhoto || faceEnrollmentLoading}
                className="mt-0.5"
              />
              I physically checked the DILG ID card and confirmed the name, employee number, and office against the HR record.
            </label>
            <button
              type="button"
              onClick={handleFaceEnrollment}
              disabled={facePhotoPreparing || faceEnrollmentLoading || !enrollmentSelfie || !dilgIdPhoto || !hrIdentityConfirmed}
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-black text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {faceEnrollmentLoading ? 'Saving HR Enrollment...' : selectedEmployee.faceEnrolledAt ? 'Update HR Enrollment' : 'Record HR ID Check & Selfie'}
            </button>
            <span className="self-center text-[10px] font-semibold text-slate-500">
              {selectedEmployee.faceEnrolledAt
                ? `HR recorded ID check and selfie ${new Date(selectedEmployee.faceEnrolledAt).toLocaleDateString()} · no automated face match`
                : !dilgIdPhoto
                  ? 'Upload the DILG ID card photo first'
                  : !enrollmentSelfie
                    ? 'Capture a fresh selfie while the employee is present'
                    : 'Confirm the physical ID check to enroll'}
            </span>
          </div>
          {dilgIdPhoto && (
            <div className="mt-4 max-w-xs rounded-xl border border-amber-200 bg-amber-50 p-2">
              <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-amber-900">Restricted HR DILG ID photo</p>
              <img src={dilgIdPhoto} alt="Employee DILG ID for HR review" className="max-h-48 w-full rounded-lg object-contain" />
            </div>
          )}
          {enrollmentSelfie && (
            <div className="mt-4 max-w-xs rounded-xl border border-blue-200 bg-blue-50 p-2">
              <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-blue-900">Fresh enrollment selfie</p>
              <img src={enrollmentSelfie} alt="Fresh employee enrollment selfie" className="max-h-48 w-full rounded-lg object-contain" />
            </div>
          )}
          {savedEnrollmentImage && (
            <div className="mt-4 max-w-xs rounded-xl border border-blue-200 bg-blue-50 p-2">
              <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-blue-900">Restricted HR enrollment selfie</p>
              <img src={savedEnrollmentImage} alt="HR enrollment selfie reference" className="max-h-48 w-full rounded-lg object-contain" />
            </div>
          )}
          {enrollmentCameraError && (
            <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
              {enrollmentCameraError}
            </p>
          )}
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
          <h3 className="text-xs font-black uppercase tracking-wide text-slate-700">HR Enrollment Audit</h3>
          <p className="mt-1 text-[10px] font-semibold text-slate-500">Manual ID review and enrollment records. These images are not automatically face-matched or liveness-checked.</p>
          {selectedEmployee.faceVerificationAudit?.length ? (
            <div className="mt-3 space-y-2">
              {[...selectedEmployee.faceVerificationAudit].slice(-5).reverse().map((event, index) => (
                <div key={`${event.timestamp}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-[10px]">
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
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-[10px] font-semibold text-slate-500">No face verification events recorded yet.</p>
          )}
          {selectedEmployee.dilgIdVerifiedAt && (
            <p className="mt-3 text-[10px] font-semibold text-slate-500">
              HR manually recorded ID review {new Date(selectedEmployee.dilgIdVerifiedAt).toLocaleString()}
              {selectedEmployee.dilgIdVerifiedBy ? ` by ${selectedEmployee.dilgIdVerifiedBy}` : ''}
              {' · no automated face match'}
            </p>
          )}
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
          <div role={toastIsError ? 'alert' : 'status'} className={`rounded-xl border px-3 py-2 text-xs font-black ${
            toastIsError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}>
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
                  const key = employeeKey(employee);
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
