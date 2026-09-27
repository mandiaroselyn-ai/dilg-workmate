import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Clock3, FileCheck2, RefreshCw, Upload, X } from 'lucide-react';
import { encodeFaceImage, resizeFaceImage } from '../utils/faceImage';

const statusCopy = {
  'not-submitted': 'Not submitted',
  pending: 'Pending HR review',
  'hr-approved': 'HR approved · attendance face matching enabled',
  rejected: 'Not approved · changes required'
};

export default function BiometricEnrollmentView({ user, onSubmitEnrollment, onRefreshEnrollmentStatus }) {
  const [dilgIdImage, setDilgIdImage] = useState('');
  const [dilgIdBackImage, setDilgIdBackImage] = useState('');
  const [sampleIdSides, setSampleIdSides] = useState({ front: false, back: false });
  const [loadingSampleId, setLoadingSampleId] = useState(false);
  const [selfieImage, setSelfieImage] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraTarget, setCameraTarget] = useState('');
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
  const idBackInputRef = useRef(null);
  const selfieInputRef = useRef(null);
  const enrollmentFormRef = useRef(null);
  const automaticSubmissionStartedRef = useRef(false);
  const submissionInProgressRef = useRef(false);
  const status = user?.biometricEnrollmentStatus || 'not-submitted';
  const canResubmitPendingEnrollment = status === 'pending';
  const canSubmit = !refreshingStatus
    && (status === 'not-submitted' || status === 'rejected' || canResubmitPendingEnrollment);

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

  const startCamera = async (target = 'selfie') => {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Live camera preview needs HTTPS or localhost. On a phone, use the device-camera option.');
      return;
    }
    try {
      stopCamera();
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: target === 'selfie' ? 'user' : 'environment',
          width: { ideal: 1280 },
          height: { ideal: 960 }
        }
      });
      setCameraTarget(target);
      setCameraActive(true);
    } catch (cameraFailure) {
      setCameraError(cameraFailure.name === 'NotAllowedError'
        ? 'Allow camera access in your browser settings, then try again.'
        : `Unable to start camera: ${cameraFailure.message || 'camera unavailable'}`);
    }
  };

  const captureImage = () => {
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
      setCameraError('Unable to process this image.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      const image = encodeFaceImage(canvas, 1280, 0.78);
      if (cameraTarget === 'id-front') {
        setDilgIdImage(image);
        setSampleIdSides(previous => ({ ...previous, front: false }));
      } else if (cameraTarget === 'id-back') {
        setDilgIdBackImage(image);
        setSampleIdSides(previous => ({ ...previous, back: false }));
      } else setSelfieImage(image);
      automaticSubmissionStartedRef.current = false;
      setCameraError('');
      setError('');
      setSuccess('');
      stopCamera();
    } catch (imageError) {
      setCameraError(imageError.message || 'Unable to prepare this camera image.');
    }
  };

  const handleImageSelection = async (event, target) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choose a photo or scan of your government ID.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('Choose an image smaller than 20 MB.');
      return;
    }
    try {
      const image = await resizeFaceImage(file, 1280, 0.78);
      if (target === 'id-front') {
        setDilgIdImage(image);
        setSampleIdSides(previous => ({ ...previous, front: false }));
      } else if (target === 'id-back') {
        setDilgIdBackImage(image);
        setSampleIdSides(previous => ({ ...previous, back: false }));
      } else setSelfieImage(image);
      automaticSubmissionStartedRef.current = false;
      setError('');
      setCameraError('');
      setSuccess('');
    } catch (imageError) {
      setError(imageError.message || 'Unable to prepare the selected image.');
    }
  };

  const handleUseSampleId = async () => {
    setLoadingSampleId(true);
    setError('');
    try {
      const [frontResponse, backResponse] = await Promise.all([
        fetch('/sample-id-front.jpg', { cache: 'no-store' }),
        fetch('/sample-id-back.jpg', { cache: 'no-store' })
      ]);
      if (!frontResponse.ok || !backResponse.ok) {
        throw new Error('The sample ID images could not be loaded. Refresh the app and try again.');
      }
      const [frontBlob, backBlob] = await Promise.all([frontResponse.blob(), backResponse.blob()]);
      const [frontImage, backImage] = await Promise.all([
        resizeFaceImage(new File([frontBlob], 'sample-id-front.jpg', { type: frontBlob.type || 'image/jpeg' }), 1280, 0.78),
        resizeFaceImage(new File([backBlob], 'sample-id-back.jpg', { type: backBlob.type || 'image/jpeg' }), 1280, 0.78)
      ]);
      setDilgIdImage(frontImage);
      setDilgIdBackImage(backImage);
      setSampleIdSides({ front: true, back: true });
      automaticSubmissionStartedRef.current = false;
      setSuccess('');
    } catch (sampleError) {
      setError(sampleError.message || 'Unable to load the demo ID images.');
    } finally {
      setLoadingSampleId(false);
    }
  };

  const handleSubmit = async () => {
    if (submissionInProgressRef.current) return;
    setError('');
    if (!dilgIdImage || !dilgIdBackImage || !selfieImage) {
      setError('Add clear photos of the front and back of your government ID, then capture your enrollment selfie.');
      return;
    }
    if (!onSubmitEnrollment) {
      setError('Enrollment submission is unavailable. Refresh the app and try again.');
      return;
    }
    submissionInProgressRef.current = true;
    setSubmitting(true);
    try {
      const isDemoEnrollment = sampleIdSides.front || sampleIdSides.back;
      const result = await onSubmitEnrollment({ dilgIdImage, dilgIdBackImage, selfieImage, isDemoEnrollment });
      setDilgIdImage('');
      setDilgIdBackImage('');
      setSelfieImage('');
      setSampleIdSides({ front: false, back: false });
      setSuccess(result.notificationWarning || (isDemoEnrollment
        ? 'DEMO submission saved for HR preview. HR approval and attendance matching are disabled for sample ID images.'
        : 'Enrollment submitted. HR/Admin has been notified to review your documents.'));
      setSuccessIsWarning(Boolean(result.notificationWarning));
    } catch (submitError) {
      setError(submitError.message || 'Unable to submit your enrollment.');
    } finally {
      submissionInProgressRef.current = false;
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!canSubmit || !dilgIdImage || !dilgIdBackImage || !selfieImage || automaticSubmissionStartedRef.current) return;
    automaticSubmissionStartedRef.current = true;
    void handleSubmit();
  }, [canSubmit, dilgIdImage, dilgIdBackImage, selfieImage]);

  const renderIdSide = (title, target, image, inputRef) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <FileCheck2 className="h-5 w-5 text-blue-700" />
        <h3 className="font-black text-slate-900">{title}</h3>
      </div>
      <p className="mt-2 text-xs text-slate-600">Place the full {target === 'id-front' ? 'front' : 'back'} of the ID in the frame. Make sure the text and photo are clear.</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={submitting}
        onChange={event => handleImageSelection(event, target)}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={submitting} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-black text-blue-800 disabled:opacity-50">
          <Upload className="h-4 w-4" /> {image ? 'Upload Different Picture' : 'Upload Picture'}
        </button>
        <button type="button" onClick={() => startCamera(target)} disabled={submitting} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 disabled:opacity-50">
          <Camera className="h-4 w-4" /> Open Camera
        </button>
      </div>
      {cameraActive && cameraTarget === target && (
        <div className="mt-4 space-y-2 rounded-xl bg-slate-950 p-3">
          <div className="relative overflow-hidden rounded-lg border-2 border-dashed border-white/70">
            <video ref={videoRef} autoPlay playsInline muted className="mx-auto max-h-56 w-full rounded-lg object-contain" />
            <span className="pointer-events-none absolute inset-3 rounded-lg border border-white/70" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={captureImage} disabled={submitting} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Scan {title}</button>
            <button type="button" onClick={stopCamera} disabled={submitting} className="inline-flex items-center gap-1 rounded-lg bg-slate-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50"><X className="h-3 w-3" /> Cancel</button>
          </div>
        </div>
      )}
      {image && <img src={image} alt={`Government ID ${target === 'id-front' ? 'front' : 'back'} preview`} className="mt-4 max-h-48 w-full rounded-xl border border-slate-200 object-contain" />}
    </div>
  );

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
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Clock3 className="h-5 w-5 shrink-0" />
              <p>
                {user.biometricEnrollmentIsDemo
                  ? 'DEMO ONLY: your sample ID images are saved for HR preview but cannot be approved or used for attendance. Replace them with your actual government ID.'
                  : 'Your submission is waiting for HR/Admin review. If HR cannot see your images, upload all three again; this replaces your pending submission.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => enrollmentFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="shrink-0 rounded-lg bg-amber-800 px-3 py-2 text-xs font-black text-white"
            >
              Resubmit ID + Selfie
            </button>
          </div>
        )}
        {status === 'hr-approved' && (
          <div className="mt-4 flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <p>HR approved the submitted ID and enrollment selfie. Attendance selfies will be compared with this enrollment selfie; liveness is not checked.</p>
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
          <p className="font-black">Face matching starts after HR approval; liveness detection is not enabled.</p>
          <p className="mt-1">The server checks whether your attendance selfie matches this enrollment selfie before saving Time In. It cannot tell whether a photo is live or detect a printed-photo or screen replay.</p>
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
          <section ref={enrollmentFormRef} className="scroll-mt-24 space-y-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">01 · Scan both sides of your government ID</h3>
              <p className="mt-1 text-xs text-slate-600">Upload an existing photo or use the rear camera to capture each side separately.</p>
              <button
                type="button"
                onClick={handleUseSampleId}
                disabled={submitting || loadingSampleId}
                className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900 disabled:opacity-50"
              >
                {loadingSampleId ? 'Loading demo ID...' : 'Use Sample ID (DEMO ONLY)'}
              </button>
              <p className="mt-1 text-[10px] font-semibold text-amber-800">Fictional test images only. HR cannot approve a sample ID or enable attendance matching from it.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {renderIdSide('Front of ID', 'id-front', dilgIdImage, idInputRef)}
              {renderIdSide('Back of ID', 'id-back', dilgIdBackImage, idBackInputRef)}
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-blue-700" />
                <h3 className="font-black text-slate-900">02 · Capture Face Selfie</h3>
              </div>
              <p className="mt-2 text-xs text-slate-600">Take a fresh selfie using the camera. Liveness detection is not currently active and will not be claimed as passed.</p>
              {!cameraActive ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => startCamera('selfie')} disabled={submitting} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-black text-blue-800 disabled:opacity-50">
                    <Camera className="h-4 w-4" /> {selfieImage ? 'Retake Selfie' : 'Open Camera'}
                  </button>
                  <button type="button" onClick={() => selfieInputRef.current?.click()} disabled={submitting} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 disabled:opacity-50">
                    <Camera className="h-4 w-4" /> Use Device Camera / Choose Selfie
                  </button>
                  <input ref={selfieInputRef} type="file" accept="image/*" capture="user" disabled={submitting} className="sr-only" onChange={event => handleImageSelection(event, 'selfie')} />
                </div>
              ) : cameraTarget === 'selfie' ? (
                <div className="mt-4 space-y-2 rounded-xl bg-slate-950 p-3">
                  <video ref={videoRef} autoPlay playsInline muted className="mx-auto max-h-56 w-full rounded-lg object-contain" />
                  <div className="flex gap-2">
                    <button type="button" onClick={captureImage} disabled={submitting} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Capture Selfie</button>
                    <button type="button" onClick={stopCamera} disabled={submitting} className="inline-flex items-center gap-1 rounded-lg bg-slate-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50"><X className="h-3 w-3" /> Cancel</button>
                  </div>
                </div>
              ) : null}
              {cameraError && <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">{cameraError}</p>}
              {selfieImage && <img src={selfieImage} alt="Enrollment selfie preview" className="mt-4 max-h-48 w-full rounded-xl border border-slate-200 object-contain" />}
            </div>
          </section>

          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}
          {submitting && <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-800">Uploading your ID and selfie securely for HR review...</p>}
          <button type="button" onClick={handleSubmit} disabled={submitting || !dilgIdImage || !dilgIdBackImage || !selfieImage} className="w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50 md:w-auto">
            {submitting
              ? 'Uploading...'
              : canResubmitPendingEnrollment
                ? error ? 'Retry Resubmission' : 'Resubmit All Images for HR Review'
                : error ? 'Retry Upload for HR Review' : 'Upload for HR Review'}
          </button>
        </>
      )}

      <p className="text-xs text-slate-500">Your ID images and enrollment selfie are stored in the restricted HR record. After HR approval, the server automatically compares attendance selfies with your enrollment selfie. This does not check liveness. Do not submit images belonging to another person.</p>
    </div>
  );
}
