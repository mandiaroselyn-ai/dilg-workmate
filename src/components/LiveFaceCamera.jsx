import React, { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, Loader2, X } from 'lucide-react';

// A selfie camera that finds the face as other apps do: the oval turns green when one face is
// centred, near enough, lit, and looking straight, and the selfie is taken by itself. Then an
// arrow asks for a head turn, and that photo is taken by itself too once the head has turned.
// The server checks both photos again (backend utils/punchLiveness.js and faceController).
// Face finding runs on the phone with the small face-api models in public/models; without
// them (an old phone, or no internet the first time), the button takes each photo instead.

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

// How far the face is turned, from its 68 landmarks, as the server reads it (headTurnOf in
// backend services/faceMatchingService.js): where the nose tip sits between the two sides of
// the jaw. The preview and the saved photos are mirrored, so the camera's reading is flipped.
const mirroredTurnOf = positions => {
  const [jawStart, jawEnd, noseTip] = [positions?.[0], positions?.[16], positions?.[30]];
  if (![jawStart, jawEnd, noseTip].every(point => Number.isFinite(point?.x))) return 0;
  const toLeft = noseTip.x - Math.min(jawStart.x, jawEnd.x);
  const toRight = Math.max(jawStart.x, jawEnd.x) - noseTip.x;
  const width = toLeft + toRight;
  return width > 0 ? -(toLeft - toRight) / width : 0;
};

// The oval, in a 300 x 400 frame (the preview is 3:4).
const OVAL = { cx: 150, cy: 185, rx: 95, ry: 125 };
// Looking straight: the turn reading within this.
const STRAIGHT_TURN = 0.15;
// The head turn taken: this much toward the arrow (a little more than the server's 0.25).
const TURN_NEEDED = 0.32;
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
  preparing: 'Preparing the head turn...',
  lostWhileTurning: 'Not too far. Keep your face in view',
  manualSelfie: 'Center your face, then tap the button',
  done: 'Done'
};

// `direction`: the side to turn ('left' or 'right' of the preview), or null while
// `directionReady` is false; when it is ready but null (no internet), only the selfie is taken.
// `onDone({ selfie, turnPhoto })` gets the photos (JPEG data URLs, mirrored as seen);
// `onError(message)` is called when the camera cannot start.
export default function LiveFaceCamera({ direction = null, directionReady = true, onDone, onCancel, onError, label = 'Selfie' }) {
  const maskId = useId().replace(/:/g, '');
  const wrapperRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const faceapiRef = useRef(null);
  const phaseRef = useRef('align');
  const selfieRef = useRef(null);
  const baseTurnRef = useRef(0);
  const goodSinceRef = useRef(0);
  const turnHitsRef = useRef(0);
  const brightnessRef = useRef({ at: 0, value: 255 });
  const directionRef = useRef({ direction, directionReady });
  directionRef.current = { direction, directionReady };
  const [cameraReady, setCameraReady] = useState(false);
  const [detector, setDetector] = useState('loading'); // 'loading' | 'ready' | 'failed'
  const [phase, setPhase] = useState('align'); // 'align' | 'turn' | 'done'
  const [hint, setHint] = useState(HINTS.starting);
  const [tone, setTone] = useState('idle'); // 'idle' | 'adjust' | 'good'
  const [progress, setProgress] = useState(0);

  const setPhaseBoth = next => {
    phaseRef.current = next;
    setPhase(next);
  };

  // The live picture as a JPEG at most `maxSide` pixels, mirrored as the preview shows it.
  const takeFrame = maxSide => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return null;
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
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

  const finish = (selfie, turnPhoto) => {
    if (phaseRef.current === 'done') return;
    setPhaseBoth('done');
    setTone('good');
    setProgress(100);
    setHint(HINTS.done);
    onDone?.({ selfie, turnPhoto });
  };

  // After the selfie: the head turn, or done when there is no side to turn to.
  const afterSelfie = selfie => {
    selfieRef.current = selfie;
    goodSinceRef.current = 0;
    turnHitsRef.current = 0;
    const { direction: side, directionReady: ready } = directionRef.current;
    if (ready && !side) {
      finish(selfie, null);
      return;
    }
    setPhaseBoth('turn');
    setProgress(0);
  };

  // The button: takes the photo of the step showing (when face finding is off or struggling).
  const takeByHand = () => {
    if (phaseRef.current === 'align') {
      const selfie = takeFrame(1280);
      if (selfie) afterSelfie(selfie);
    } else if (phaseRef.current === 'turn' && directionRef.current.direction) {
      const turnPhoto = takeFrame(640);
      if (turnPhoto) finish(selfieRef.current, turnPhoto);
    }
  };

  // The camera.
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
        console.warn('Face detection is not available; photos are taken with the button.', error);
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
      if (stopped || phaseRef.current === 'done') return;
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
      if (stopped || phaseRef.current === 'done') return;

      const phaseNow = phaseRef.current;
      const { direction: side, directionReady: ready } = directionRef.current;
      if (phaseNow === 'turn' && !side) {
        // The side to turn is still coming from the server, or there is none (no internet).
        if (ready) finish(selfieRef.current, null);
        else show(HINTS.preparing, 'idle');
      } else if (faces.length !== 1) {
        goodSinceRef.current = 0;
        turnHitsRef.current = 0;
        if (phaseNow === 'turn') show(faces.length ? HINTS.manyFaces : HINTS.lostWhileTurning, 'adjust');
        else show(faces.length ? HINTS.manyFaces : HINTS.noFace, faces.length ? 'adjust' : 'idle');
      } else {
        const [face] = faces;
        const turn = mirroredTurnOf(face.landmarks?.positions);
        if (phaseNow === 'turn') {
          const toward = side === 'left' ? baseTurnRef.current - turn : turn - baseTurnRef.current;
          const share = Math.max(0, Math.min(1, toward / TURN_NEEDED));
          turnHitsRef.current = toward >= TURN_NEEDED ? turnHitsRef.current + 1 : 0;
          if (turnHitsRef.current >= 2) {
            const turnPhoto = takeFrame(640);
            if (turnPhoto) {
              finish(selfieRef.current, turnPhoto);
              return;
            }
          }
          show(`Slowly turn your head to the ${side}`, share > 0.6 ? 'good' : 'adjust', Math.round(share * 100));
        } else {
          // Where the face is on screen, next to the oval (the preview fills its 3:4 frame and
          // is mirrored).
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
                  : Math.abs(turn) > STRAIGHT_TURN ? HINTS.straight
                    : '';
          if (problem) {
            goodSinceRef.current = 0;
            show(problem, 'adjust');
          } else {
            const now = Date.now();
            if (!goodSinceRef.current) goodSinceRef.current = now;
            const held = now - goodSinceRef.current;
            if (held >= HOLD_MS) {
              const selfie = takeFrame(1280);
              if (selfie) {
                baseTurnRef.current = turn;
                afterSelfie(selfie);
              }
            } else {
              show(HINTS.hold, 'good', Math.round((held / HOLD_MS) * 100));
            }
          }
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

  // Waiting for the head turn's side when the server has none to give (no internet): the
  // selfie alone is used. (While face finding runs, its loop does this too.)
  useEffect(() => {
    if (phase === 'turn' && directionReady && !direction) finish(selfieRef.current, null);
  }, [phase, direction, directionReady]);

  // Words shown before face finding runs, or when it cannot.
  useEffect(() => {
    if (!cameraReady) return;
    if (detector === 'loading') setHint(HINTS.loading);
    if (detector === 'failed') {
      setTone('idle');
      setHint(phase === 'turn'
        ? (direction ? `Turn your head a little to the ${direction}, then tap the button` : HINTS.preparing)
        : HINTS.manualSelfie);
    }
  }, [cameraReady, detector, phase, direction]);

  const ovalColor = tone === 'good' ? '#22c55e' : tone === 'adjust' ? '#f59e0b' : '#ffffff';
  const turnSide = phase === 'turn' ? direction : null;

  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-white">
          <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
          {label}
        </span>
        <span className="text-[10px] font-semibold text-slate-400">
          {phase === 'turn' ? 'Now the head turn' : phase === 'done' ? 'Done' : 'Selfie first'}
        </span>
      </div>

      <div ref={wrapperRef} className="relative aspect-[3/4] w-full overflow-hidden bg-slate-900">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full scale-x-[-1] object-cover" />

        {/* The oval, with the rest of the picture dimmed; its border fills as the step completes. */}
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
            {phase === 'done' ? <Check className="h-4 w-4" /> : (!cameraReady || detector === 'loading') ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {hint}
          </span>
        </div>

        {/* The side to turn to. */}
        {turnSide && (
          <div className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${turnSide === 'left' ? 'left-2' : 'right-2'}`}>
            <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-full bg-amber-400 text-slate-950 shadow-xl">
              {turnSide === 'left' ? <ArrowLeft className="h-9 w-9" /> : <ArrowRight className="h-9 w-9" />}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-6 px-4 py-3">
        <button
          type="button"
          onClick={takeByHand}
          disabled={!cameraReady || phase === 'done' || (phase === 'turn' && !direction)}
          aria-label={phase === 'turn' ? 'Take the head-turn photo' : 'Take the selfie'}
          title={detector === 'ready' ? 'The photo is taken by itself; tap if it does not' : 'Take the photo'}
          className={`flex h-14 w-14 items-center justify-center rounded-full border-4 border-white text-white shadow-lg transition hover:scale-105 disabled:opacity-40 ${phase === 'turn' ? 'bg-amber-500' : 'bg-blue-600'}`}
        >
          {phase === 'turn' ? (direction === 'left' ? <ArrowLeft className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />) : <Camera className="h-5 w-5" />}
        </button>
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/10">
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
      </div>
      <p className="px-4 pb-3 text-center text-[10px] font-semibold text-slate-400">
        {detector === 'ready' ? 'The photos are taken by themselves. Tap the button only if they are not.' : 'Good light. No cap, sunglasses, or face mask.'}
      </p>
    </div>
  );
}
