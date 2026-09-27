import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Clock3, FileCheck2, RefreshCw, Upload, X } from 'lucide-react';
import { resizeFaceImage } from '../utils/faceImage';

const statusCopy = {
  'not-submitted': 'Not submitted',
  pending: 'Pending HR review',
  'hr-approved': 'HR approved · biometric verification pending',
  rejected: 'Not approved · changes required'
};

export default function BiometricEnrollmentView({ user, onSubmitEnrollment, onRefreshEnrollmentStatus }) {
  const [dilgIdImage, setDilgIdImage] = useState('');
  const [selfieImage, setSelfieImage] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [successIsWarning, setSuccessIsWarning] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [refreshingStatus, setRefreshingStatus] = useState(Boolean(onRefreshEnrollmentStatus));
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const idInputRef = useRef(null);
  const selfieInputRef = useRef(null);
  const automaticSubmissionStartedRef = useRef(false);
  const submissionInProgressRef = useRef(false);
  const status = user?.biometricEnrollmentStatus || 'not-submitted';
  const canSubmit = !refreshingStatus && (status === 'not-submitted' || status === 'rejected');

  const refreshStatus = async () => {
    if (!onRefreshEnrollmentStatus) return;
    setRefreshingStatus(true);
    try {
      await onRefreshEnrollmentStatus();
      setStatusError('');
    } catch (refreshError) {
      setStatusError(refreshError.message || 'Unable to refresh enrollment status.');
    } finally {
      setRefreshingStatus(false);
    }
  };

  useEffect(() => {
    refreshStatus();
  }, [onRefreshEnrollmentStatus]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraActive]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const startCamera = async () => {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Live camera preview needs HTTPS or localhost. On a phone, use the device-camera option below.');
      return;
    }
    try {
      stopCamera();
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }
      });
      setCameraActive(true);
    } catch (cameraFailure) {
      setCameraError(cameraFailure.name === 'NotAllowedError'
        ? 'Allow camera access in your browser settings, then try again.'
        : `Unable to start camera: ${cameraFailure.message || 'camera unavailable'}`);
    }
  };

  const captureSelfie = () => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) {
      setCameraError('Wait until the camera preview is ready, then capture again.');
      return;
    }
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('Unable to process the selfie image.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setSelfieImage(canvas.toDataURL('image/jpeg', 0.85));
    setCameraError('');
    stopCamera();
  };

  const handleIdSelection = async event => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choose a photo or scan of your government ID.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('Choose an ID image smaller than 20 MB.');
      return;
    }
    try {
      setDilgIdImage(await resizeFaceImage(file));
      automaticSubmissionStartedRef.current = false;
      setError('');
      setSuccess('');
    } catch (imageError) {
      setError(imageError.message || 'Unable to prepare the government ID image.');
    }
  };

  const handleSelfieSelection = async event => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setCameraError('Choose a photo captured with your front-facing camera.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setCameraError('Choose a selfie image smaller than 20 MB.');
      return;
    }
    try {
      setSelfieImage(await resizeFaceImage(file));
      automaticSubmissionStartedRef.current = false;
      setCameraError('');
      setError('');
      setSuccess('');
    } catch (imageError) {
      setCameraError(imageError.message || 'Unable to prepare the selfie image.');
    }
  };

  const handleSubmit = async () => {
    if (submissionInProgressRef.current) return;
    setError('');
    if (!dilgIdImage || !selfieImage) {
      setError('Upload your government ID and capture your enrollment selfie first.');
      return;
    }
    if (!onSubmitEnrollment) {
      setError('Enrollment submission is unavailable. Refresh the app and try again.');
      return;
    }
    submissionInProgressRef.current = true;
    setSubmitting(true);
    try {
      const result = await onSubmitEnrollment({ dilgIdImage, selfieImage });
      setDilgIdImage('');
      setSelfieImage('');
      setSuccess(result.notificationWarning || 'Enrollment submitted. HR/Admin has been notified to review your documents.');
      setSuccessIsWarning(Boolean(result.notificationWarning));
    } catch (submitError) {
      setError(submitError.message || 'Unable to submit your enrollment.');
    } finally {
      submissionInProgressRef.current = false;
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!canSubmit || !dilgIdImage || !selfieImage || automaticSubmissionStartedRef.current) return;
    automaticSubmissionStartedRef.current = true;
    void handleSubmit();
  }, [canSubmit, dilgIdImage, selfieImage]);

  const badgeClass = status === 'rejected'
    ? 'bg-rose-100 text-rose-800'
    : status === 'hr-approved'
      ? 'bg-blue-100 text-blue-800'
      : status === 'pending'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-slate-100 text-slate-700';

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-4 pb-24 md:p-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-900">Biometric Enrollment</h2>
            <p className="mt-1 text-sm text-slate-600">Submit a government ID and a camera selfie for HR review.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1.5 text-xs font-black ${badgeClass}`}>
              {statusCopy[status] || 'Pending review'}
            </span>
            <button type="button" onClick={refreshStatus} disabled={refreshingStatus} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black text-slate-700 disabled:opacity-50">
              <RefreshCw className={`h-3 w-3 ${refreshingStatus ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>
        {statusError && <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">{statusError}</p>}

        {status === 'pending' && (
          <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <Clock3 className="h-5 w-5 shrink-0" />
            <p>Your submission is waiting for HR/Admin review. You will see the decision here.</p>
          </div>
        )}
        {status === 'hr-approved' && (
          <div className="mt-4 flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <p>HR approved the submitted ID and selfie. Automatic face matching and liveness are not configured, so your biometric identity is <strong>not yet verified</strong>.</p>
          </div>
        )}
        {status === 'rejected' && (
          <div className="mt-4 flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p><strong>HR review note:</strong> {user.biometricEnrollmentReviewNote || 'Please review and resubmit your images.'}</p>
          </div>
        )}
        {success && <p role="status" className={`mt-3 rounded-xl border p-3 text-sm font-semibold ${successIsWarning ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{success}</p>}

        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-black">Liveness verification is not available yet.</p>
          <p className="mt-1">This camera photo is not an automated liveness test or face match. Your submission will remain unverified until a liveness/face-matching provider is configured.</p>
        </div>
        {user.biometricEnrollmentSubmittedAt && (
          <p className="mt-3 text-xs font-semibold text-slate-500">
            Submitted {new Date(user.biometricEnrollmentSubmittedAt).toLocaleString()}
            {user.biometricEnrollmentReviewedAt ? ` · reviewed ${new Date(user.biometricEnrollmentReviewedAt).toLocaleString()}` : ''}
          </p>
        )}
        {user.biometricEnrollmentReviewNote && status === 'hr-approved' && (
          <p className="mt-2 text-xs text-slate-600">HR note: {user.biometricEnrollmentReviewNote}</p>
        )}
      </section>

      {canSubmit && (
        <>
          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <FileCheck2 className="h-5 w-5 text-blue-700" />
                <h3 className="font-black text-slate-900">01 · Upload Government ID</h3>
              </div>
              <p className="mt-2 text-xs text-slate-600">Upload a clear photo or scan of your valid government ID. HR will check it against your personnel record.</p>
              <input ref={idInputRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleIdSelection} />
              <button type="button" onClick={() => idInputRef.current?.click()} disabled={submitting} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-black text-blue-800 disabled:opacity-50">
                <Upload className="h-4 w-4" /> {dilgIdImage ? 'Change ID Image' : 'Choose ID Image'}
              </button>
              {dilgIdImage && <img src={dilgIdImage} alt="Government ID preview" className="mt-4 max-h-48 w-full rounded-xl border border-slate-200 object-contain" />}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-blue-700" />
                <h3 className="font-black text-slate-900">02 · Capture Face Selfie</h3>
              </div>
              <p className="mt-2 text-xs text-slate-600">Take a fresh selfie using the camera. Liveness detection is not currently active and will not be claimed as passed.</p>
              {!cameraActive ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={startCamera} disabled={submitting} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-black text-blue-800 disabled:opacity-50">
                    <Camera className="h-4 w-4" /> {selfieImage ? 'Retake Selfie' : 'Open Camera'}
                  </button>
                  <input ref={selfieInputRef} type="file" accept="image/*" capture="user" disabled={submitting} className="sr-only" onChange={handleSelfieSelection} />
                  <button type="button" onClick={() => selfieInputRef.current?.click()} disabled={submitting} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 disabled:opacity-50">
                    <Camera className="h-4 w-4" /> Use Device Camera / Choose Selfie
                  </button>
                </div>
              ) : (
                <div className="mt-4 space-y-2 rounded-xl bg-slate-950 p-3">
                  <video ref={videoRef} autoPlay playsInline muted className="mx-auto max-h-56 w-full rounded-lg object-contain" />
                  <div className="flex gap-2">
                    <button type="button" onClick={captureSelfie} disabled={submitting} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Capture Selfie</button>
                    <button type="button" onClick={stopCamera} disabled={submitting} className="inline-flex items-center gap-1 rounded-lg bg-slate-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50"><X className="h-3 w-3" /> Cancel</button>
                  </div>
                </div>
              )}
              {cameraError && <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">{cameraError}</p>}
              {selfieImage && <img src={selfieImage} alt="Enrollment selfie preview" className="mt-4 max-h-48 w-full rounded-xl border border-slate-200 object-contain" />}
            </div>
          </section>

          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}
          {submitting && <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-800">Uploading your ID and selfie securely for HR review...</p>}
          <button type="button" onClick={handleSubmit} disabled={submitting || !dilgIdImage || !selfieImage} className="w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50 md:w-auto">
            {submitting ? 'Uploading...' : error ? 'Retry Upload for HR Review' : 'Upload for HR Review'}
          </button>
        </>
      )}

      <p className="text-xs text-slate-500">Your ID image and enrollment selfie are stored in the restricted HR record. Do not submit images belonging to another person.</p>
    </div>
  );
}
