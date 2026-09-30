import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/api';

// Lists of attendance records leave selfies out (they would make the lists too large), so
// a record's selfie is loaded from the server when it comes into view, once per record.
const selfieRequests = new Map();

const loadSelfie = id => {
  if (!selfieRequests.has(id)) {
    const request = apiFetch(`/api/dtr/action?action=record-selfie&id=${encodeURIComponent(id)}`)
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load the selfie.');
        return data.selfieUrl || '';
      })
      .catch(error => {
        selfieRequests.delete(id);
        throw error;
      });
    selfieRequests.set(id, request);
  }
  return selfieRequests.get(id);
};

// Shows `record`'s selfie as an <img className={className}>. While it loads, and if it
// cannot be loaded, the <span className={placeholderClassName}> shows `placeholder`.
export default function RecordSelfie({ record, className, placeholderClassName, placeholder = null, alt = 'Logged selfie' }) {
  const placeholderRef = useRef(null);
  const [loaded, setLoaded] = useState('');
  const id = record?.id;
  const needsLoad = Boolean(!record?.selfieUrl && record?.hasSelfie && id);

  useEffect(() => {
    setLoaded('');
    if (!needsLoad) return undefined;
    let active = true;
    const start = () => loadSelfie(id).then(url => { if (active) setLoaded(url); }, () => {});
    const element = placeholderRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      start();
      return () => { active = false; };
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        start();
      }
    }, { rootMargin: '200px' });
    observer.observe(element);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [id, needsLoad]);

  const src = record?.selfieUrl || loaded;
  if (src) return <img src={src} alt={alt} className={className} referrerPolicy="no-referrer" />;
  return <span ref={placeholderRef} className={placeholderClassName}>{placeholder}</span>;
}
