import React, { useEffect, useRef, useState } from 'react';
import { Eraser, Upload } from 'lucide-react';

const WIDTH = 480;
const HEIGHT = 160;
const MAX_UPLOAD_BYTES = 300 * 1024;

// A signature drawn with a finger, stylus, or mouse, or uploaded as a picture (PNG or JPG
// under 300 KB). `onChange` gets it as a data: URL, or '' when it is cleared.
export default function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [uploaded, setUploaded] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#0f2a6b';
  }, [uploaded]);

  const point = event => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * WIDTH, y: ((event.clientY - rect.top) / rect.height) * HEIGHT };
  };
  const start = event => {
    event.preventDefault();
    canvasRef.current.setPointerCapture?.(event.pointerId);
    drawingRef.current = true;
    const { x, y } = point(event);
    const context = canvasRef.current.getContext('2d');
    context.beginPath();
    context.moveTo(x, y);
  };
  const move = event => {
    if (!drawingRef.current) return;
    event.preventDefault();
    const { x, y } = point(event);
    const context = canvasRef.current.getContext('2d');
    context.lineTo(x, y);
    context.stroke();
    if (!hasInk) setHasInk(true);
  };
  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (hasInk) onChange?.(canvasRef.current.toDataURL('image/png'));
  };
  const clear = () => {
    setUploaded('');
    setHasInk(false);
    setError('');
    canvasRef.current?.getContext('2d').clearRect(0, 0, WIDTH, HEIGHT);
    onChange?.('');
  };
  const upload = event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('Choose a PNG or JPG picture of your signature.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('The picture is over 300 KB. Crop it closer to the signature, or draw it here instead.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setError('');
      setUploaded(String(reader.result));
      onChange?.(String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2">
      {uploaded ? (
        <div className="flex h-32 items-center justify-center rounded-xl border border-slate-200 bg-white p-2">
          <img src={uploaded} alt="Your signature" className="max-h-full max-w-full object-contain" />
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          aria-label="Draw your signature here"
          className="h-32 w-full touch-none rounded-xl border border-dashed border-slate-300 bg-white"
        />
      )}
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
        <span className="text-slate-500">{uploaded ? 'Uploaded picture' : 'Sign inside the box.'}</span>
        <button type="button" onClick={clear} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700"><Eraser className="h-3.5 w-3.5" />Clear</button>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700">
          <Upload className="h-3.5 w-3.5" />Upload a picture
          <input type="file" accept="image/png,image/jpeg" onChange={upload} className="hidden" />
        </label>
      </div>
      {error && <p role="alert" className="text-[11px] font-bold text-rose-700">{error}</p>}
    </div>
  );
}
