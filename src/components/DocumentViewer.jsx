import { useEffect, useState } from 'react';
import { Download, Printer, X } from 'lucide-react';
import PdfPreview from './PdfPreview';
import { downloadBytes, isPdf, isViewable, objectUrlFor } from '../utils/documentFiles';

// Shows one document: a PDF page by page, a photo as it is, and any other file as a
// download only. `load` returns { fileName, fileType, bytes }: a stored file, or a form
// filled in on the spot. It is called once, when the viewer opens.
export default function DocumentViewer({ title, load, onClose }) {
  const [file, setFile] = useState(null); // { fileName, fileType, bytes, url }
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let url;
    Promise.resolve()
      .then(load)
      .then(result => {
        if (!active) return;
        url = objectUrlFor(result.bytes, result.fileType);
        setFile({ ...result, url });
      })
      .catch(errorValue => active && setError(errorValue.message || 'Unable to open this document.'));
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canView = file && isViewable(file.fileType);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/80 p-2 sm:p-5">
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden rounded-xl bg-slate-800 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-700 bg-slate-900 p-3 text-white">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-extrabold">{title}</h2>
            {file?.fileName && <p className="hidden truncate text-[10px] text-slate-400 sm:block">{file.fileName}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canView && <button type="button" onClick={() => window.open(file.url, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-1 rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold"><Printer className="h-4 w-4" />Print</button>}
            <button type="button" onClick={() => file && downloadBytes(file.bytes, file.fileName, file.fileType)} disabled={!file} className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold disabled:opacity-50"><Download className="h-4 w-4" />Download</button>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-300 hover:bg-slate-700" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="min-h-0 flex-1 bg-slate-500 p-2 sm:p-5">
          {error ? <p className="rounded-lg bg-rose-100 p-4 text-sm text-rose-800">{error}</p>
            : !file ? <div className="flex h-full items-center justify-center text-sm text-white">Opening document...</div>
              : isPdf(file.fileType) ? <PdfPreview url={file.url} bytes={file.bytes} title={title} />
                : canView ? <div className="flex h-full items-center justify-center overflow-auto"><img src={file.url} alt={title} className="max-h-full max-w-full rounded bg-white object-contain shadow" /></div>
                  : <p className="rounded-lg bg-white p-4 text-sm text-slate-700">This file type cannot be shown here. Use Download to open it on your device.</p>}
        </div>
      </div>
    </div>
  );
}
