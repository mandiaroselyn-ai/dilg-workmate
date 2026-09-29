import { useEffect, useState } from 'react';
import { Download, Printer, X } from 'lucide-react';
import cscForm6Template from '../assets/csc-form-6-template.pdf';
import { fillLeaveForm } from '../utils/leaveForm';

async function makeFilledForm(request, user) {
  const response = await fetch(cscForm6Template);
  return fillLeaveForm(await response.arrayBuffer(), request, user);
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
