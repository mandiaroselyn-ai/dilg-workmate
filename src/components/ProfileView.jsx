/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  User,
  CheckCircle,
  IdCard,
  Camera,
  MapPin,
  Database,
  Pencil,
  Upload,
  Trash2,
  X,
  RefreshCw
} from 'lucide-react';
import BiometricEnrollmentView from './BiometricEnrollmentView';
import ProfileDetails, { employmentBadge } from './ProfileDetails';
import { encodeProfilePhoto, resizeProfilePhoto } from '../utils/profilePhoto.js';
import { GOVERNMENT_ID_FIELDS, PERSONAL_FIELDS, profileFieldValues } from '../../shared/profileFields';
import { getManilaDateString } from '../../shared/localDate';
import { requestCoversDate } from '../utils/hrAttendance';

// What the employee can change on their profile. HR keeps the position, office, region,
// and other employment details.
const editableValues = person => ({
  name: person?.name || '',
  phoneNumber: person?.phoneNumber || '',
  ...profileFieldValues(person, [...PERSONAL_FIELDS, ...GOVERNMENT_ID_FIELDS])
});

const STATUS_INDICATOR = {
  'On Leave':  { label: 'On Leave',  dotClass: 'bg-white', pillClass: 'bg-amber-500 text-white' },
  'Absent':    { label: 'Absent',    dotClass: 'bg-white', pillClass: 'bg-red-500 text-white' },
  'On Travel': { label: 'On Travel', dotClass: 'bg-white', pillClass: 'bg-sky-500 text-white' },
};

export default function ProfileView({ user, attendanceHistory = [], requests = [], onUpdateUser, onSubmitEnrollment, onRefreshEnrollmentStatus }) {
  const [form, setForm] = useState(() => editableValues(user));
  const { name } = form;
  const { role, office, employeeId } = user;
  const badge = employmentBadge(user);
  const today = getManilaDateString();
  const approvedToday = type => requests.some(r =>
    /approved/i.test(r?.status || '') && r?.type === type && requestCoversDate(r, today)
  );
  const todayStatus = approvedToday('Leave Request') ? 'On Leave'
    : approvedToday('Travel Order') ? 'On Travel'
    : null;
  const statusIndicator = STATUS_INDICATOR[todayStatus] || null;
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [activeProfileTab, setActiveProfileTab] = useState('profile');

  // Avatar and Camera Upload States
  const [profilePicture, setProfilePicture] = useState(user.profilePicture || '');
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [viewProfileOnly, setViewProfileOnly] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [tempPhoto, setTempPhoto] = useState('');
  const [stream, setStream] = useState(null);
  const [showAvatarActions, setShowAvatarActions] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const avatarActionsRef = useRef(null);

  // Stop camera when component unmounts
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream, cameraActive]);

  useEffect(() => {
    if (!user) return;
    setForm(editableValues(user));
    setProfilePicture(user.profilePicture || '');
    setTempPhoto(user.profilePicture || '');
  }, [user]);

  const startCamera = async () => {
    setTempPhoto('');
    setCameraActive(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is not supported by this browser.');
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 300, height: 300, facingMode: 'user' }
      });
      setStream(mediaStream);
      setCameraActive(true);
    } catch (err) {
      console.error("Camera access error:", err);
      setCameraActive(false);
      setStream(null);
      alert("Unable to access the camera. Please allow camera permission and try again. Camera access also requires HTTPS or localhost.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current?.videoWidth && videoRef.current?.videoHeight && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      const size = Math.min(videoRef.current.videoWidth, videoRef.current.videoHeight);
      canvasRef.current.width = size;
      canvasRef.current.height = size;
      
      // Mirror the image to match the video element mirroring
      context.translate(size, 0);
      context.scale(-1, 1);
      context.drawImage(
        videoRef.current,
        (videoRef.current.videoWidth - size) / 2,
        (videoRef.current.videoHeight - size) / 2,
        size,
        size,
        0,
        0,
        size,
        size
      );
      context.setTransform(1, 0, 0, 1, 0, 0); // reset transform
      
      try {
        setTempPhoto(encodeProfilePhoto(canvasRef.current));
      } catch (error) {
        alert(error.message || 'Unable to process the photo.');
      }
      stopCamera();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Please choose an image file.');
        return;
      }
      resizeProfilePhoto(file)
        .then(uploadedPhoto => {
          setProfilePicture(uploadedPhoto);
          setTempPhoto(uploadedPhoto);
          stopCamera();
          setShowPhotoModal(false);
          setShowAvatarActions(false);
          onUpdateUser(buildUserPayload(uploadedPhoto));
        })
        .catch(error => alert(error.message || 'Unable to process the photo.'));
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (avatarActionsRef.current && !avatarActionsRef.current.contains(event.target)) {
        setShowAvatarActions(false);
      }
    };

    if (showAvatarActions) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAvatarActions]);

  const buildUserPayload = (picture) => ({
    ...user,
    ...form,
    profilePicture: picture
  });

  const handleChange = event => {
    const { name: field, value } = event.target;
    setForm(previous => ({ ...previous, [field]: value }));
  };

  const handleSavePhoto = () => {
    setProfilePicture(tempPhoto);
    setShowPhotoModal(false);
    // Auto-sync immediately so that Header & Sidebar will receive the update
    onUpdateUser(buildUserPayload(tempPhoto));
  };

  const handleRemovePhoto = () => {
    setTempPhoto('');
    setProfilePicture('');
    setShowPhotoModal(false);
    onUpdateUser(buildUserPayload(''));
  };

  // Shows the success message only after the server has saved the changes.
  const saveEmploymentInfo = async () => {
    setSavingInfo(true);
    const saved = await onUpdateUser(buildUserPayload(profilePicture));
    setSavingInfo(false);
    if (!saved) return false;
    setProfileSuccess(true);
    setTimeout(() => setProfileSuccess(false), 4000);
    return true;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    void saveEmploymentInfo();
  };

  // The phone layout shows the details first; Update Personnel Information opens the form.
  const handleMobileSave = async (e) => {
    e.preventDefault();
    if (await saveEmploymentInfo()) setEditingInfo(false);
  };

  const cancelMobileEdit = () => {
    setForm(editableValues(user));
    setEditingInfo(false);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        id="profile-photo-upload"
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <div role="tablist" aria-label="Profile sections" className="flex gap-2 border-b border-slate-200 bg-white px-4 pt-3 md:px-8">
        <button
          type="button"
          role="tab"
          aria-selected={activeProfileTab === 'profile'}
          onClick={() => setActiveProfileTab('profile')}
          className={`rounded-t-xl px-4 py-3 text-xs font-black ${activeProfileTab === 'profile' ? 'border-b-2 border-blue-700 text-blue-800' : 'text-slate-500'}`}
        >
          Profile
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeProfileTab === 'biometric'}
          onClick={() => setActiveProfileTab('biometric')}
          className={`rounded-t-xl px-4 py-3 text-xs font-black ${activeProfileTab === 'biometric' ? 'border-b-2 border-blue-700 text-blue-800' : 'text-slate-500'}`}
        >
          Biometric Enrollment
        </button>
      </div>
      {activeProfileTab === 'profile' && (
        <>
      <div className="md:hidden flex-1 w-full min-h-0 overflow-y-auto bg-slate-50 px-3 pt-3 pb-24 id-profile-view-mobile font-sans">
        <section className="relative overflow-visible rounded-[22px] bg-gradient-to-br from-[#1551b5] via-[#245fc6] to-[#0d4299] px-5 pb-5 pt-6 text-white shadow-lg">
          <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-white/10" />
          <div className="relative flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="relative">
                <div className="h-[104px] w-[104px] overflow-hidden rounded-full border-4 border-white bg-amber-500 shadow-md">
                  {profilePicture ? (
                    <img src={profilePicture} alt="Profile" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl font-black">{name.split(' ').map(n => n[0]).join('').substring(0, 2)}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTempPhoto(profilePicture);
                    setShowAvatarActions(true);
                  }}
                  className="absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full border-4 border-white bg-white text-slate-700 shadow-md"
                  aria-label="Change profile photo"
                >
                  <Camera className="h-5 w-5" />
                </button>
              </div>
              {showAvatarActions && (
                <div ref={avatarActionsRef} onMouseDown={(event) => event.stopPropagation()} className="absolute left-0 top-[112px] z-40 w-44 rounded-xl bg-white p-2 text-xs font-bold text-slate-700 shadow-xl">
                  <button type="button" onClick={() => { setShowAvatarActions(false); setViewProfileOnly(false); startCamera(); setShowPhotoModal(true); }} className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50">Take Photo</button>
                  <button type="button" onClick={() => { setShowAvatarActions(false); fileInputRef.current?.click(); }} className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50">Upload Photo</button>
                  <button type="button" onClick={() => { setShowAvatarActions(false); setCameraActive(false); setTempPhoto(profilePicture); setViewProfileOnly(true); setShowPhotoModal(true); }} className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50">See Profile Picture</button>
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-[22px] font-black leading-tight">{name}</h2>
              {statusIndicator ? (
                <span className={`mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black uppercase ${statusIndicator.pillClass}`}>
                  <span className={`h-2 w-2 rounded-full shrink-0 animate-pulse ${statusIndicator.dotClass}`} />
                  {statusIndicator.label}
                </span>
              ) : (
                <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-3 py-1 text-xs font-black uppercase text-white">
                  <span className="h-2 w-2 rounded-full bg-green-300 shrink-0" />
                  Active
                </span>
              )}
              <p className="mt-2 text-xs font-extrabold leading-snug text-white">{role}</p>
            </div>
          </div>
          <div className="relative mt-5 grid grid-cols-2 gap-3 border-t border-white/20 pt-4 text-xs font-semibold text-blue-50">
            <span className="flex items-center gap-2 truncate"><IdCard className="h-5 w-5 shrink-0" /><span><span className="block text-blue-200">DILG ID</span>{employeeId}</span></span>
            <span className="flex items-center gap-2 truncate"><MapPin className="h-5 w-5 shrink-0" /><span><span className="block text-blue-200">Office</span>{office}</span></span>
          </div>
        </section>

        <form onSubmit={handleMobileSave} className="mt-5 rounded-[20px] bg-white px-4 py-5 shadow-sm ring-1 ring-slate-100">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1551b5] text-white"><User className="h-6 w-6" /></div>
              <div><h3 className="text-base font-black text-slate-800">Personnel Information</h3><p className="mt-1 text-[11px] text-slate-500">{editingInfo ? 'Update your personal details and government ID numbers.' : 'View your personal and employment information.'}</p></div>
            </div>
            <div className="hidden shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 sm:flex"><Database className="h-6 w-6" /> Personnel<br />Record</div>
          </div>
          <div className="pt-4">
            <ProfileDetails person={user} form={form} onChange={handleChange} editing={editingInfo} attendanceAssignment />
          </div>
          {editingInfo ? (
            <div className="mt-5 flex gap-2">
              <button type="submit" disabled={savingInfo} className="flex-1 rounded-2xl bg-[#0645ad] px-4 py-3 text-xs font-bold text-white shadow-md disabled:opacity-60">
                {savingInfo ? 'Saving...' : 'Save Changes'}
              </button>
              <button type="button" onClick={cancelMobileEdit} disabled={savingInfo} className="rounded-2xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-700 disabled:opacity-60">
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setEditingInfo(true)} className="mt-5 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#0645ad] px-4 py-3 text-xs font-bold text-white shadow-md">
              <Pencil className="h-4 w-4" /> Update Personnel Information
            </button>
          )}
          {profileSuccess && <p className="mt-3 text-center text-xs font-bold text-emerald-600">Personnel information updated successfully.</p>}
        </form>
      </div>

      <div className="hidden md:block p-8 space-y-8 overflow-y-auto flex-1 id-profile-view font-sans">
      
      {/* Profile ID Card Visual */}
      <div className="bg-gradient-to-r from-[#1e40af] via-[#1d4ed8] to-[#2563eb] text-white rounded-2xl p-7 flex flex-col md:flex-row items-center gap-6 shadow-md border border-[#1e40af]/20 relative overflow-visible backdrop-blur-lg text-left">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15)_0%,rgba(15,23,42,0)_75%)] pointer-events-none"></div>

        {/* Big Initials circle badge / Interactive Profile Picture */}
        <div className="relative shrink-0" ref={avatarActionsRef}>
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-amber-500 to-amber-600 text-white font-extrabold text-3xl flex items-center justify-center border-4 border-white/90 shadow-md overflow-hidden relative">
              {profilePicture ? (
                <img src={profilePicture} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                name.split(' ').map(n => n[0]).join('').substring(0, 2)
              )}
              <button
                type="button"
                onClick={() => {
                  setTempPhoto(profilePicture);
                  setShowAvatarActions((prev) => !prev);
                }}
                className="absolute bottom-1 right-1 w-9 h-9 rounded-full bg-white/95 text-slate-800 shadow-lg flex items-center justify-center border border-slate-200 transition-transform duration-200 hover:scale-105"
                title="Profile photo actions"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>
          </div>

          {showAvatarActions && (
            <div onMouseDown={(event) => event.stopPropagation()} className="absolute left-0 top-full mt-3 w-56 rounded-2xl bg-white border border-slate-200 shadow-2xl p-3 text-slate-800 z-40">
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAvatarActions(false);
                    setViewProfileOnly(false);
                    startCamera();
                    setShowPhotoModal(true);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 transition"
                >
                  Take Photo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAvatarActions(false);
                    setViewProfileOnly(false);
                    fileInputRef.current?.click();
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 transition"
                >
                  Upload Photo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAvatarActions(false);
                    setCameraActive(false);
                    setTempPhoto(profilePicture);
                    setViewProfileOnly(true);
                    setShowPhotoModal(true);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 transition"
                >
                  See Profile Picture
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2 text-center md:text-left">
          <div className="flex items-center justify-center md:justify-start gap-2.5 flex-wrap">
            <h2 id="txt-profile-top-name" className="text-2xl font-black tracking-tight text-white">{name}</h2>
            {statusIndicator ? (
              <span className={`text-[10px] uppercase font-black tracking-widest text-white px-2.5 py-1 rounded-full inline-flex items-center gap-1.5 ${statusIndicator.pillClass}`}>
                <span className={`h-2 w-2 rounded-full shrink-0 animate-pulse ${statusIndicator.dotClass}`} />
                {statusIndicator.label}
              </span>
            ) : (
              <span className="text-[10px] uppercase font-black tracking-widest bg-emerald-500 text-white px-2.5 py-1 rounded-full inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-green-300 shrink-0" />
                Active
              </span>
            )}
          </div>
          <p id="txt-profile-top-role" className="text-sm text-yellow-300 font-extrabold">{role}</p>
          <div className="flex items-center justify-center md:justify-start gap-4 text-xs text-blue-50 font-extrabold font-mono">
            <span>ID: {employeeId}</span>
            <span>•</span>
            <span>{office}</span>
          </div>
        </div>
      </div>

      {/* Profile Form Details */}
      <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-2xl text-left">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-md">Personnel Information</h3>
              <p className="text-xs text-slate-500 mt-1">Update your personal details and government ID numbers. HR keeps your employment information.</p>
            </div>
            <span className="text-xs font-mono text-slate-650 font-extrabold bg-slate-50 border border-slate-200 px-2.5 py-1 rounded">DILG Core Server V4</span>
          </div>

          <ProfileDetails person={user} form={form} onChange={handleChange} editing attendanceAssignment />

          {profileSuccess && (
            <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-4 rounded-xl text-xs font-semibold flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>DILG database keys matched. Records updated successfully!</span>
            </div>
          )}

          {/* SBM Trigger */}
          <div className="pt-4 border-t border-slate-100 text-right">
            <button
              id="btn-profile-save"
              type="submit"
              disabled={savingInfo}
              className="px-6 py-3.5 bg-[#1e40af] hover:bg-blue-800 transition-all text-white font-bold text-xs rounded-lg cursor-pointer shadow-sm animate-none font-semibold disabled:opacity-60"
            >
              {savingInfo ? 'Saving...' : 'Update Personnel Information'}
            </button>
          </div>
        </form>
      </div>

      </div>
        </>
      )}
      {activeProfileTab === 'biometric' && (
        <BiometricEnrollmentView
          user={user}
          onSubmitEnrollment={onSubmitEnrollment}
          onRefreshEnrollmentStatus={onRefreshEnrollmentStatus}
        />
      )}

      {/* Profile Photo Settings Modal */}
      {showPhotoModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden flex flex-col text-slate-800 text-left">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#1e40af] to-[#1d4ed8] text-white px-5 py-4 flex items-center justify-between">
              <h3 className="font-extrabold text-xs tracking-wide uppercase flex items-center gap-2">
                <Camera className="w-4 h-4" />
                <span>Profile Picture</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setViewProfileOnly(false);
                  setShowPhotoModal(false);
                }}
                className="text-white/85 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              
              {/* Photo Display / Camera Stream */}
              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="relative w-44 h-44 rounded-full bg-slate-100 border-4 border-slate-200 shadow-inner overflow-hidden flex items-center justify-center">
                  {cameraActive ? (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                  ) : tempPhoto ? (
                    <img
                      src={tempPhoto}
                      alt="Captured/Uploaded"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-tr from-amber-500 to-amber-600 text-white font-extrabold text-5xl flex items-center justify-center">
                      {name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                    </div>
                  )}

                  {/* Hidden canvas for drawing snapshot */}
                  <canvas ref={canvasRef} className="hidden" />
                </div>

                <p className="text-[11px] text-slate-500 font-bold text-center">
                  {cameraActive ? "Live Camera View" : tempPhoto ? "Photo Preview" : "No Profile Picture"}
                </p>
              </div>

              {/* Options / Action Area */}
              {!viewProfileOnly && <div className="space-y-4">
                
                {/* Main Controls row */}
                {!tempPhoto && (
                <div className="grid grid-cols-2 gap-3">
                  {/* Camera Control */}
                  {cameraActive ? (
                    <button
                      type="button"
                      onClick={capturePhoto}
                      className="col-span-2 py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all shadow-rose-600/10 uppercase tracking-wider"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Take Photo</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startCamera}
                      className="py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-black text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all uppercase tracking-wider"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Camera</span>
                    </button>
                  )}

                  {/* Upload File Input Button */}
                  {!cameraActive && (
                    <label htmlFor="profile-photo-upload" className="py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-black text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all text-center uppercase tracking-wider">
                      <Upload className="w-4 h-4" />
                      <span>Upload Photo</span>
                    </label>
                  )}
                </div>
                )}

                {/* Stop Camera button if active */}
                {cameraActive && (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-all uppercase"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Cancel Camera</span>
                  </button>
                )}

                {/* Preset Avatars Row */}
                {!cameraActive && !tempPhoto && (
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Quick Presets</label>
                    <div className="flex justify-center gap-3">
                      {[
                        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
                        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
                        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80",
                        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80"
                      ].map((presetUrl, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setTempPhoto(presetUrl);
                          }}
                          className={`w-10 h-10 rounded-full overflow-hidden border-2 transition-all cursor-pointer hover:scale-110 ${
                            tempPhoto === presetUrl ? 'border-blue-600 ring-2 ring-blue-500/20 scale-105' : 'border-transparent'
                          }`}
                        >
                          <img src={presetUrl} alt="Preset" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              </div>}
            </div>

            {/* Modal Footer */}
            {!viewProfileOnly ? (
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              {tempPhoto && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="text-xs font-bold text-rose-650 hover:text-rose-700 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Photo</span>
                </button>
              )}
              <div className="flex gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setViewProfileOnly(false);
                    setShowPhotoModal(false);
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePhoto}
                  className="px-4 py-2 text-xs font-black bg-[#1e40af] hover:bg-blue-800 text-white rounded-lg cursor-pointer shadow-sm transition-colors uppercase tracking-wider"
                >
                  Save
                </button>
              </div>
            </div>
            ) : (
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setViewProfileOnly(false);
                    setShowPhotoModal(false);
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </>
  );
}
