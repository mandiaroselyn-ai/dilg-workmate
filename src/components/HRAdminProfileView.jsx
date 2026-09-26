import React, { useRef, useState, useEffect } from 'react';
import { Building2, Camera, CheckCircle2, IdCard, Mail, MapPin, Pencil, Phone, ShieldAlert } from 'lucide-react';

const InfoRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-3 border-b border-slate-100 py-4 last:border-0">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1551b5]">
      <Icon className="h-5 w-5" />
    </div>
    <span className="min-w-0 flex-1 text-xs text-slate-700">{label}</span>
    <span className="min-w-0 max-w-[54%] break-words text-right text-xs font-bold text-slate-800">{value || '-'}</span>
  </div>
);

export default function HRAdminProfileView({ user: sourceUser = {}, onUpdateUser, onToast, title = 'HR/Admin Profile' }) {
  const [editing, setEditing] = useState(false);
  const [photoMenu, setPhotoMenu] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [profilePicture, setProfilePicture] = useState(sourceUser.profilePicture || '');
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const user = { ...sourceUser, profilePicture };
  const [form, setForm] = useState({
    name: user.name || '',
    email: user.email || '',
    role: user.role || '',
    office: user.office || '',
    phoneNumber: user.phoneNumber || '',
  });

  const initials = (user.name || 'HR').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
  const notify = message => onToast?.(message);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!showCamera || !videoRef.current || !streamRef.current) return;

    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play?.().catch(() => {});
  }, [showCamera]);

  const applyPhoto = (dataUrl) => {
    setProfilePicture(dataUrl);
    setPhotoMenu(false);
    setShowCamera(false);
    setCameraError('');
    onUpdateUser?.({ ...user, profilePicture: dataUrl });
    notify('Profile photo updated.');
  };

  const startCamera = async () => {
    setCameraError('');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });

      streamRef.current = stream;
      setShowCamera(true);
    } catch (error) {
      console.error('Camera error:', error);
      setCameraError('Camera access is unavailable. Please use Upload Photo instead.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
    setCameraError('');
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;

    context.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    applyPhoto(dataUrl);
    stopCamera();
  };

  const save = event => {
    event.preventDefault();
    onUpdateUser?.({ ...user, ...form });
    setEditing(false);
    notify('Profile information updated successfully.');
  };

  const update = event => setForm(previous => ({ ...previous, [event.target.name]: event.target.value }));

  const updatePhoto = event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const uploadedPhoto = reader.result;
      applyPhoto(uploadedPhoto);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 space-y-5 pb-24 font-sans sm:pb-0">
      <section className="overflow-visible rounded-2xl bg-gradient-to-r from-[#1e40af] via-[#1d4ed8] to-[#2563eb] p-6 text-white shadow-md sm:p-7">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <div className="relative">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white/90 bg-gradient-to-tr from-amber-500 to-amber-600 text-3xl font-black shadow-md">
              {user.profilePicture ? (
                <img src={user.profilePicture} alt="HR Admin" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>

            <button
              type="button"
              onClick={() => setPhotoMenu(value => !value)}
              className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-white text-blue-700 shadow-md"
              title="Profile photo actions"
              aria-label="Profile photo actions"
            >
              <Camera className="h-4 w-4" />
            </button>

            {photoMenu && (
              <div className="absolute left-1/2 top-full z-30 mt-2 w-48 -translate-x-1/2 rounded-xl bg-white p-2 text-xs font-bold text-slate-700 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setPhotoMenu(false);
                    startCamera();
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                >
                  Take Photo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhotoMenu(false);
                    fileInputRef.current?.click();
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                >
                  Upload Photo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhotoMenu(false);
                    setShowPhoto(true);
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                >
                  See Profile Picture
                </button>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" onChange={updatePhoto} className="hidden" />
            <canvas ref={canvasRef} className="hidden" />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-2xl font-black tracking-tight">{user.name || 'HR Administrator'}</h3>
            <p className="mt-1 text-sm font-semibold text-blue-100">{user.role || 'Human Resource Management Officer'}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-blue-50">
                <Building2 className="h-3.5 w-3.5" />
                {user.office || 'Office Unit'}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-100">
                <CheckCircle2 className="h-3.5 w-3.5" /> Active Access
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-600">Government Profile</p>
            <h3 className="mt-2 text-lg font-black text-slate-900">Official Information</h3>
            <p className="mt-1 text-xs text-slate-500">Current office assignment and official administrative details.</p>
          </div>

          {!editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setForm({
                  name: user.name || '',
                  email: user.email || '',
                  role: user.role || '',
                  office: user.office || '',
                  phoneNumber: user.phoneNumber || '',
                });
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              <Pencil className="h-4 w-4" /> Edit
            </button>
          )}
        </div>

        {editing ? (
          <form onSubmit={save} className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                Full Name
                <input
                  name="name"
                  value={form.name}
                  onChange={update}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-bold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white"
                />
              </label>

              <label className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                Official Email
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={update}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-bold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white"
                />
              </label>

              <label className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                Designation
                <input
                  name="role"
                  value={form.role}
                  onChange={update}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-bold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white"
                />
              </label>

              <label className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                Office / Unit
                <input
                  name="office"
                  value={form.office}
                  onChange={update}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-bold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white"
                />
              </label>

              <label className="text-[11px] font-black uppercase tracking-wide text-slate-500 sm:col-span-2">
                Contact Number
                <input
                  name="phoneNumber"
                  value={form.phoneNumber}
                  onChange={update}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-bold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-black text-white transition hover:bg-blue-800">
                Save Changes
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-5 space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-2">
            <InfoRow icon={Mail} label="Official Government Email" value={user.email} />
            <InfoRow icon={Phone} label="Official Contact Number" value={user.phoneNumber} />
            <InfoRow icon={ShieldAlert} label="Designation / Position" value={user.role} />
            <InfoRow icon={Building2} label="Office / Agency Unit" value={user.office} />
            <InfoRow icon={MapPin} label="Assigned Government Office" value={user.location || 'Provincial Office'} />
            <InfoRow icon={IdCard} label="Employee / Admin ID" value={user.employeeId || 'HR-ADMIN-001'} />
          </div>
        )}
      </section>

      {showCamera && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-700">Take Photo</h3>
              <button type="button" onClick={stopCamera} className="rounded-lg bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-700">Close</button>
            </div>

            {cameraError ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-semibold text-amber-800">{cameraError}</div>
            ) : (
              <>
                <video ref={videoRef} autoPlay playsInline muted className="h-72 w-full rounded-xl object-cover bg-slate-200" />
                <button type="button" onClick={capturePhoto} className="mt-3 w-full rounded-xl bg-blue-700 px-4 py-2 text-xs font-black text-white">Capture Photo</button>
              </>
            )}
          </div>
        </div>
      )}

      {showPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
          <div className="max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex justify-end p-3">
              <button
                type="button"
                onClick={() => setShowPhoto(false)}
                className="rounded-lg bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-700"
              >
                Close
              </button>
            </div>

            {user.profilePicture ? (
              <img src={user.profilePicture} alt="HR Admin full" className="max-h-[70vh] w-full object-contain" />
            ) : (
              <div className="flex h-[300px] w-full items-center justify-center bg-slate-100 text-6xl font-black text-slate-400">
                {initials}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
