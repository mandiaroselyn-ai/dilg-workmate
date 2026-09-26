import { useEffect, useState } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Download, Printer, X } from 'lucide-react';
import cscForm6Template from '../assets/csc-form-6-template.pdf';

const PAGE_HEIGHT = 841.89;
const black = rgb(0, 0, 0);

const formatDate = value => {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
};

const splitName = value => {
  const parts = (value || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { last: parts[0] || '', first: '', middle: '' };
  return { last: parts.at(-1), first: parts.slice(0, -1).join(' '), middle: '' };
};

async function makeFilledForm(request, user) {
  const response = await fetch(cscForm6Template);
  const document = await PDFDocument.load(await response.arrayBuffer());
  const page = document.getPages()[0];
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const name = splitName(user?.name);
  const leaveType = (request.leaveType || request.type || '').toLowerCase();
  const draw = (value, x, top, options = {}) => page.drawText(String(value || ''), {
    x,
    y: PAGE_HEIGHT - top,
    size: options.size || 7,
    font: options.bold ? bold : regular,
    color: black,
    maxWidth: options.maxWidth
  });
  const mark = (x, top, active) => active && draw('X', x, top, { size: 8, bold: true });

  // Header fields aligned to the writable lines of the official template.
  draw(user?.office, 78, 143, { bold: true, maxWidth: 170 });
  draw(name.last, 265, 143, { bold: true, maxWidth: 90 });
  draw(name.first, 385, 143, { bold: true, maxWidth: 100 });
  draw(name.middle, 505, 143, { bold: true, maxWidth: 65 });
  draw(formatDate(request.submissionDate), 105, 182, { bold: true, maxWidth: 120 });
  draw(user?.role, 295, 182, { bold: true, maxWidth: 130 });
  draw(user?.salary, 495, 182, { bold: true, maxWidth: 70 });

  const leaveRows = { vacation: 223, mandatory: 236, sick: 249, maternity: 262, paternity: 275, 'special privilege': 288, 'solo parent': 301, study: 314, vawc: 327, rehabilitation: 340, women: 353, emergency: 366, adoption: 379 };
  Object.entries(leaveRows).forEach(([key, top]) => mark(42, top, leaveType.includes(key)));
  draw(request.leaveType || 'Others', 65, 421, { bold: true, maxWidth: 170 });
  draw(request.detailsSpecify || request.purpose, 370, 238, { maxWidth: 185 });
  mark(350, 228, request.detailsType?.toLowerCase().includes('within') || leaveType.includes('vacation'));
  mark(350, 254, request.detailsType?.toLowerCase().includes('hospital'));
  mark(350, 267, request.detailsType?.toLowerCase().includes('out patient') || leaveType.includes('sick'));

  const days = String(request.workingDays || 1);
  draw(days, 75, 477, { bold: true, maxWidth: 90 });
  draw(`${formatDate(request.startDate)}${request.endDate && request.endDate !== request.startDate ? ` - ${formatDate(request.endDate)}` : ''}`, 75, 509, { bold: true, maxWidth: 190 });
  mark(350, 477, request.commutation !== 'Requested');
  mark(350, 490, request.commutation === 'Requested');
  draw(user?.name, 370, 504, { bold: true, maxWidth: 145 });

  return document.save();
}

export default function CSCForm6Preview({ request, user, onClose }) {
  const [pdfUrl, setPdfUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let objectUrl;
    setPdfUrl('');
    setError('');
    makeFilledForm(request, user)
      .then(bytes => {
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        setPdfUrl(objectUrl);
      })
      .catch(errorValue => setError(errorValue.message || 'Unable to generate the official CSC Form 6.'));
    return () => objectUrl && URL.revokeObjectURL(objectUrl);
  }, [request, user]);

  const download = () => {
    if (!pdfUrl) return;
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `CSC_Form_6_${request.id || 'leave'}.pdf`;
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/80 p-2 sm:p-5">
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden rounded-xl bg-slate-800 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-700 bg-slate-900 p-3 text-white">
          <div><h2 className="text-sm font-extrabold">Official CSC Form No. 6</h2><p className="text-[10px] text-slate-400">Official PDF template with dynamic fields</p></div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => pdfUrl && window.open(pdfUrl, '_blank', 'noopener,noreferrer')} disabled={!pdfUrl} className="inline-flex items-center gap-1 rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold disabled:opacity-50"><Printer className="h-4 w-4" />Print</button>
            <button type="button" onClick={download} disabled={!pdfUrl} className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold disabled:opacity-50"><Download className="h-4 w-4" />Download</button>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-300 hover:bg-slate-700" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="min-h-0 flex-1 bg-slate-500 p-2 sm:p-5">
          {error ? <p className="rounded-lg bg-rose-100 p-4 text-sm text-rose-800">{error}</p> : pdfUrl ? <iframe title="Official CSC Form 6" src={pdfUrl} className="h-full w-full rounded bg-white" /> : <div className="flex h-full items-center justify-center text-sm text-white">Preparing official form...</div>}
        </div>
      </div>
    </div>
  );
}
