import { useEffect, useState } from 'react';
import { Download, Printer, X } from 'lucide-react';
import travelOrderTemplate from '../assets/travelorder-template.pdf';
import { fillTravelOrder, travelOrderNumber } from '../utils/travelOrderForm';
import PdfPreview from './PdfPreview';

async function makeFilledOrder(request, person) {
  const response = await fetch(travelOrderTemplate);
  return fillTravelOrder(await response.arrayBuffer(), request, person);
}

// The official Provincial Order (travel order) template, filled in for one travel request.
export default function TravelOrderPreview({ request, user, onClose }) {
  const [pdf, setPdf] = useState(null); // { url, bytes }
  const [error, setError] = useState('');

  // Made again only when the request or the person actually changes, not on every render
  // of the screen that opened it.
  const requestKey = JSON.stringify(request);
  const userKey = JSON.stringify(user || {});
  useEffect(() => {
    let objectUrl;
    let active = true;
    setPdf(null);
    setError('');
    makeFilledOrder(request, user || {})
      .then(bytes => {
        if (!active) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        setPdf({ url: objectUrl, bytes });
      })
      .catch(errorValue => active && setError(errorValue.message || 'Unable to generate the official travel order.'));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, userKey]);

  const download = () => {
    if (!pdf) return;
    const link = document.createElement('a');
    link.href = pdf.url;
    link.download = `${travelOrderNumber(request) || request.id || 'travel-order'}_Provincial_Order.pdf`;
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/80 p-2 sm:p-5">
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden rounded-xl bg-slate-800 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-700 bg-slate-900 p-3 text-white">
          <div className="min-w-0"><h2 className="text-sm font-extrabold">Official Travel Order</h2><p className="hidden text-[10px] text-slate-400 sm:block">Provincial Order template with the request's details</p></div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => pdf && window.open(pdf.url, '_blank', 'noopener,noreferrer')} disabled={!pdf} className="inline-flex items-center gap-1 rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold disabled:opacity-50"><Printer className="h-4 w-4" />Print</button>
            <button type="button" onClick={download} disabled={!pdf} className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold disabled:opacity-50"><Download className="h-4 w-4" />Download</button>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-300 hover:bg-slate-700" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="min-h-0 flex-1 bg-slate-500 p-2 sm:p-5">
          {error ? <p className="rounded-lg bg-rose-100 p-4 text-sm text-rose-800">{error}</p> : pdf ? <PdfPreview url={pdf.url} bytes={pdf.bytes} title="Official Travel Order" /> : <div className="flex h-full items-center justify-center text-sm text-white">Preparing official travel order...</div>}
        </div>
      </div>
    </div>
  );
}
