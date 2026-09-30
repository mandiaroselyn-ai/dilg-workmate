import { useEffect, useRef, useState } from 'react';

// Browsers with their own PDF viewer (most computers) show the PDF in a frame. Phone browsers
// such as Chrome on Android cannot show a PDF inside a page, so there each page is drawn with
// pdf.js, which is loaded only then.
const canShowPdfInPage = () => typeof navigator !== 'undefined' && navigator.pdfViewerEnabled === true;

// pdf.js's own copies of the standard PDF fonts (Liberation Sans stands in for Helvetica and
// Arial), so the pages look the same on every phone instead of depending on its fonts.
const standardFontFiles = import.meta.glob('../../node_modules/pdfjs-dist/standard_fonts/*.{pfb,ttf}', { query: '?url', import: 'default', eager: true });
class StandardFontDataFactory {
  async fetch({ filename }) {
    const url = Object.entries(standardFontFiles).find(([path]) => path.endsWith(`/${filename}`))?.[1];
    if (!url) throw new Error(`The PDF font ${filename} is missing.`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to load the PDF font ${filename}.`);
    return new Uint8Array(await response.arrayBuffer());
  }
}

export default function PdfPreview({ url, bytes, title }) {
  if (canShowPdfInPage()) return <iframe title={title} src={url} className="h-full w-full rounded bg-white" />;
  return <PdfPages bytes={bytes} title={title} />;
}

// Every page of the PDF, drawn as wide as the preview and sharp on high-density screens.
function PdfPages({ bytes, title }) {
  const pagesRef = useRef(null);
  const [status, setStatus] = useState('Preparing preview...');

  useEffect(() => {
    let cancelled = false;
    const pages = pagesRef.current;
    pages.replaceChildren();
    setStatus('Preparing preview...');
    (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const { default: workerUrl } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      // pdf.js takes over the bytes it is given, so it gets a copy.
      // pdf.js draws each letter's outline itself instead of handing the PDF's fonts to the
      // browser, which on some phones drops or swaps letters.
      const pdf = await pdfjs.getDocument({ data: bytes.slice(), StandardFontDataFactory, useSystemFonts: false, disableFontFace: true }).promise;
      for (let number = 1; number <= pdf.numPages; number += 1) {
        const page = await pdf.getPage(number);
        if (cancelled) return;
        const width = pages.clientWidth || 360;
        const scale = (width / page.getViewport({ scale: 1 }).width) * Math.min(window.devicePixelRatio || 1, 3);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.className = 'mb-3 block w-full rounded bg-white shadow';
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `${title}, page ${number} of ${pdf.numPages}`);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        if (cancelled) return;
        pages.append(canvas);
      }
      if (!cancelled) setStatus('');
    })().catch(error => {
      if (!cancelled) setStatus(error.message || 'Unable to show this PDF. Use Download instead.');
    });
    return () => { cancelled = true; };
  }, [bytes, title]);

  return (
    <div className="h-full overflow-y-auto">
      {status && <p role="status" className="p-4 text-center text-sm text-white">{status}</p>}
      <div ref={pagesRef} />
    </div>
  );
}
