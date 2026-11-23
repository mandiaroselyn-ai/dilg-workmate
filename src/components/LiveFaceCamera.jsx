import React, { useEffect, useId, useRef, useState } from 'react';
import { Camera, Check, Loader2, X } from 'lucide-react';

// A selfie camera that finds the face as other apps do: it says what to fix, the oval turns
// green when one face is centred, near enough, lit, and looking straight, and the selfie is
// taken by itself. Face finding runs on the phone with the small face-api models in
// public/models; without them (an old phone, or no internet the first time), the button
// takes the selfie instead.

// The face finder is loaded once, the first time the camera opens.
let detectorPromise = null;
const loadFaceDetector = () => {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      const usesGpu = await faceapi.tf.setBackend('webgl').catch(() => false);
      if (!usesGpu) await faceapi.tf.setBackend('cpu');
      await faceapi.tf.ready();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models')
      ]);
      return faceapi;
    })().catch(error => {
      detectorPromise = null;
      throw error;
    });
  }
  return detectorPromise;
};

// How far the face is turned to one side, from -1 to 1, from its 68 landmarks: where the nose
// tip sits between the two sides of the jaw (0 is straight on).
const turnOf = positions => {
  const [jawStart, jawEnd, noseTip] = [positions?.[0], positions?.[16], positions?.[30]];
  if (![jawStart, jawEnd, noseTip].every(point => Number.isFinite(point?.x))) return 0;
  const toLeft = noseTip.x - Math.min(jawStart.x, jawEnd.x);
  const toRight = Math.max(jawStart.x, jawEnd.x) - noseTip.x;
  const width = toLeft + toRight;
  return width > 0 ? (toLeft - toRight) / width : 0;
};

// The oval, in a 300 x 400 frame (the preview is 3:4).
const OVAL = { cx: 150, cy: 185, rx: 95, ry: 125 };
// Looking straight: the turn reading within this.
const STRAIGHT_TURN = 0.15;
// How long the face must stay right before the selfie is taken.
const HOLD_MS = 700;
const DETECT_EVERY_MS = 120;

const HINTS = {
  starting: 'Starting the camera...',
  loading: 'Getting face detection ready...',
  noFace: 'Place your face inside the oval',
  manyFaces: 'Only your face should be in the frame',
  dark: 'Too dark. Face a window or a light',
  far: 'Move closer',
  near: 'Move back a little',
  center: 'Center your face in the oval',
  straight: 'Look straight at the camera',
  hold: 'Hold still...',
  manual: 'Center your face, then tap the button',
  done: 'Done'
};

// `onDone({ selfie })` gets the selfie (a JPEG data URL, mirrored as the preview shows it);
// `onError(message)` is called when the camera cannot start.
export default function LiveFaceCamera({ onDone, onCancel, onError, label = 'Selfie' }) {
  const maskId = useId().replace(/:/g, '');
  const wrapperRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const faceapiRef = useRef(null);
  const doneRef = useRef(false);
  const goodSinceRef = useRef(0);
  const brightnessRef = useRef({ at: 0, value: 255 });
  const [cameraReady, setCameraReady] = useState(false);
  const [detector, setDetector] = useState('loading'); // 'loading' | 'ready' | 'failed'
  const [done, setDone] = useState(false);
  const [hint, setHint] = useState(HINTS.starting);
  const [tone, setTone] = useState('idle'); // 'idle' | 'adjust' | 'good'
  const [progress, setProgress] = useState(0);

  // The live picture as a JPEG at most 1280 pixels, mirrored as the preview shows it.
  const takeFrame = () => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return null;
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  // How bright the picture is (0 to 255), read from a tiny copy once a second.
  const brightness = () => {
    const now = Date.now();
    if (now - brightnessRef.current.at < 1000) return brightnessRef.current.value;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 32;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    let value = 255;
    if (context && video?.videoWidth) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let total = 0;
      for (let index = 0; index < data.length; index += 4) total += 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
      value = total / (data.length / 4);
    }
    brightnessRef.current = { at: now, value };
    return value;
  };

  const takeSelfie = () => {
    if (doneRef.current) return;
    const selfie = takeFrame();
    if (!selfie) return;
    doneRef.current = true;
    setDone(true);
    setTone('good');
    setProgress(100);
    setHint(HINTS.done);
    onDone?.({ selfie });
  };

  // The camera, and the face finder.
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 960 } }
    })
      .then(stream => {
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.play().catch(() => {});
        }
        setCameraReady(true);
      })
      .catch(error => {
        if (cancelled) return;
        onError?.(error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError'
          ? 'Allow camera access, then try again.'
          : error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError'
            ? 'No camera was found on this device.'
            : `Unable to start the camera: ${error?.message || 'camera unavailable'}`);
      });
    loadFaceDetector()
      .then(faceapi => {
        if (cancelled) return;
        faceapiRef.current = faceapi;
        setDetector('ready');
      })
      .catch(error => {
        console.warn('Face detection is not available; the selfie is taken with the button.', error);
        if (!cancelled) setDetector('failed');
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    };
  }, []);

  // Finding the face, a few times a second.
  useEffect(() => {
    if (!cameraReady || detector !== 'ready') return undefined;
    let stopped = false;
    let timer = null;
    const faceapi = faceapiRef.current;
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });

    const show = (text, nextTone, nextProgress = 0) => {
      setHint(text);
      setTone(nextTone);
      setProgress(nextProgress);
    };

    const check = async () => {
      const video = videoRef.current;
      const wrapper = wrapperRef.current;
      if (stopped || doneRef.current) return;
      if (!video?.videoWidth || !wrapper) {
        timer = window.setTimeout(check, DETECT_EVERY_MS);
        return;
      }
      let faces = [];
      try {
        faces = await faceapi.detectAllFaces(video, options).withFaceLandmarks(true);
      } catch (error) {
        console.warn('Face detection failed on this frame:', error);
      }
      if (stopped || doneRef.current) return;

      if (faces.length !== 1) {
        goodSinceRef.current = 0;
        show(faces.length ? HINTS.manyFaces : HINTS.noFace, faces.length ? 'adjust' : 'idle');
      } else {
        // Where the face is on screen, next to the oval (the preview fills its 3:4 frame and is
        // mirrored).
        const [face] = faces;
        const { clientWidth: width, clientHeight: height } = wrapper;
        const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
        const offsetX = (width - video.videoWidth * scale) / 2;
        const offsetY = (height - video.videoHeight * scale) / 2;
        const box = face.detection.box;
        const centerX = width - (offsetX + (box.x + box.width / 2) * scale);
        const centerY = offsetY + (box.y + box.height / 2) * scale;
        const ovalX = (OVAL.cx / 300) * width;
        const ovalY = (OVAL.cy / 400) * height;
        const ovalRx = (OVAL.rx / 300) * width;
        const ovalRy = (OVAL.ry / 400) * height;
        const offCenter = ((centerX - ovalX) / ovalRx) ** 2 + ((centerY - ovalY) / ovalRy) ** 2;
        const size = (box.width * scale) / (2 * ovalRx);
        const problem = brightness() < 50 ? HINTS.dark
          : size < 0.5 ? HINTS.far
            : size > 1.15 ? HINTS.near
              : offCenter > 0.25 ? HINTS.center
                : Math.abs(turnOf(face.landmarks?.positions)) > STRAIGHT_TURN ? HINTS.straight
                  : '';
        if (problem) {
          goodSinceRef.current = 0;
          show(problem, 'adjust');
        } else {
          const now = Date.now();
          if (!goodSinceRef.current) goodSinceRef.current = now;
          const held = now - goodSinceRef.current;
          if (held >= HOLD_MS) {
            takeSelfie();
            return;
          }
          show(HINTS.hold, 'good', Math.round((held / HOLD_MS) * 100));
        }
      }
      timer = window.setTimeout(check, DETECT_EVERY_MS);
    };
    check();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [cameraReady, detector]);

  // Words shown before face finding runs, or when it cannot.
  useEffect(() => {
    if (!cameraReady || done) return;
    if (detector === 'loading') setHint(HINTS.loading);
    if (detector === 'failed') {
      setTone('idle');
      setHint(HINTS.manual);
    }
  }, [cameraReady, detector, done]);

  const ovalColor = tone === 'good' ? '#22c55e' : tone === 'adjust' ? '#f59e0b' : '#ffffff';

  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-white">
          <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
          {label}
        </span>
        <span className="text-[10px] font-semibold text-slate-400">{done ? 'Done' : 'Live camera'}</span>
      </div>

      <div ref={wrapperRef} className="relative aspect-[3/4] w-full overflow-hidden bg-slate-900">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full scale-x-[-1] object-cover" />

        {/* The oval, with the rest of the picture dimmed; its border fills while holding still. */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 300 400" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="300" height="400" fill="white" />
              <ellipse cx={OVAL.cx} cy={OVAL.cy} rx={OVAL.rx} ry={OVAL.ry} fill="black" />
            </mask>
          </defs>
          <rect width="300" height="400" fill="rgba(2,6,23,0.6)" mask={`url(#${maskId})`} />
          <ellipse cx={OVAL.cx} cy={OVAL.cy} rx={OVAL.rx} ry={OVAL.ry} fill="none" stroke={ovalColor} strokeOpacity="0.45" strokeWidth="3" vectorEffect="non-scaling-stroke" style={{ transition: 'stroke 200ms' }} />
          {/* Drawn from the top of the oval, clockwise. */}
          {progress > 0 && (
            <path
              d={`M ${OVAL.cx} ${OVAL.cy - OVAL.ry} A ${OVAL.rx} ${OVAL.ry} 0 1 1 ${OVAL.cx} ${OVAL.cy + OVAL.ry} A ${OVAL.rx} ${OVAL.ry} 0 1 1 ${OVAL.cx} ${OVAL.cy - OVAL.ry}`}
              fill="none" stroke={ovalColor} strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke"
              pathLength="100" strokeDasharray={`${progress} 100`}
              style={{ transition: 'stroke-dasharray 150ms linear, stroke 200ms' }}
            />
          )}
        </svg>

        {/* What to do now. */}
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3">
          <span className={`flex items-center gap-2 rounded-full px-4 py-2 text-center text-xs font-black shadow-lg backdrop-blur-sm ${
            tone === 'good' ? 'bg-emerald-500/90 text-white' : tone === 'adjust' ? 'bg-amber-400/95 text-slate-950' : 'bg-slate-950/75 text-white'
          }`}>
            {done ? <Check className="h-4 w-4" /> : (!cameraReady || detector === 'loading') ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {hint}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 px-4 py-3">
        <button
          type="button"
          onClick={takeSelfie}
          disabled={!cameraReady || done}
          aria-label="Take the selfie"
          title={detector === 'ready' ? 'The selfie is taken by itself; tap if it is not' : 'Take the selfie'}
          className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-blue-600 text-white shadow-lg transition hover:scale-105 disabled:opacity-40"
        >
          <Camera className="h-5 w-5" />
        </button>
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/10">
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
      </div>
    </div>
  );
}
