import { useEffect, useId, useState } from 'react';

// Adobe's own PDF viewer (Adobe PDF Embed API) inside WorkMate, for the form being signed. It
// needs the Client ID registered in Adobe for WorkMate's domain, dilg-workmate.vercel.app
// (VITE_ADOBE_EMBED_CLIENT_ID, read when the site is built, can replace it). When Adobe's viewer
// cannot show the form (not loaded, another domain, or too slow), `fallback` is shown instead. The
// viewer only shows the form: download, print, and markup tools are off, and so are its PDF
// analytics.
const ADOBE_VIEWER_SCRIPT = 'https://acrobatservices.adobe.com/view-sdk/viewer.js';
export const ADOBE_CLIENT_ID = import.meta.env.VITE_ADOBE_EMBED_CLIENT_ID || '14428d7ebaf449a09b828eed1acdbb45';
// How long to wait for Adobe's viewer to show the form before showing the fallback.
const LOAD_TIMEOUT_MS = 30000;

let loading = null;
// Loads Adobe's viewer script once; resolves with window.AdobeDC when it is ready.
const loadAdobeViewer = () => {
  if (window.AdobeDC?.View) return Promise.resolve(window.AdobeDC);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      document.addEventListener('adobe_dc_view_sdk.ready', () => resolve(window.AdobeDC), { once: true });
      const script = document.createElement('script');
      script.src = ADOBE_VIEWER_SCRIPT;
      script.async = true;
      script.onerror = () => {
        loading = null;
        reject(new Error('Adobe\'s viewer could not be loaded.'));
      };
      document.head.append(script);
    });
  }
  return loading;
};

export default function AdobePdfView({ bytes, fileName = 'form.pdf', fallback = null }) {
  const divId = `adobe-pdf-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const [failed, setFailed] = useState(!ADOBE_CLIENT_ID);

  useEffect(() => {
    if (!ADOBE_CLIENT_ID || !bytes) return undefined;
    let active = true;
    const timer = window.setTimeout(() => { if (active) setFailed(true); }, LOAD_TIMEOUT_MS);
    loadAdobeViewer()
      .then(AdobeDC => {
        if (!active) return null;
        document.getElementById(divId)?.replaceChildren();
        const view = new AdobeDC.View({ clientId: ADOBE_CLIENT_ID, divId });
        return view.previewFile(
          { content: { promise: Promise.resolve(bytes.slice().buffer) }, metaData: { fileName } },
          {
            embedMode: 'FULL_WINDOW',
            showDownloadPDF: false,
            showPrintPDF: false,
            showAnnotationTools: false,
            enableFormFilling: false,
            sendAutoPDFAnalytics: false
          }
        );
      })
      // Shown: no fallback needed.
      .then(() => window.clearTimeout(timer))
      .catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [bytes, fileName, divId]);

  if (failed) return fallback;
  return <div id={divId} className="h-full w-full bg-white" />;
}
