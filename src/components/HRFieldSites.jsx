import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { ChevronDown, Crosshair, MapPinned, Trash2 } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { MARINDUQUE_MUNICIPALITIES } from '../../shared/marinduqueLocations';
import { MARINDUQUE_BARANGAY_AREAS } from '../../shared/marinduqueBarangayAreas';
import { DEFAULT_FIELD_SITE_NAME, DEFAULT_FIELD_SITE_RADIUS, FIELD_SITE_RADIUS_OPTIONS } from '../../shared/fieldSites';
import { builtInFieldSiteName } from '../../shared/fieldAssignmentArea';
import { apiFetch } from '../utils/api';

const MUNICIPALITIES = Object.keys(MARINDUQUE_MUNICIPALITIES);
const AREA_STYLE = { color: '#38bdf8', weight: 2, dashArray: '6 4', fillOpacity: 0.05 };
const SITE_STYLE = { color: '#16a34a', weight: 2, fillColor: '#16a34a', fillOpacity: 0.15 };
const inputClass = 'mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold text-slate-800';

// HR's field sites: for each barangay, the one place where field work there counts, such as its
// barangay hall, within a radius (shared/fieldSites.js). A barangay without one counts as a
// whole. HR picks the barangay, taps the site on the map (or uses this device's GPS while
// standing there), and saves. Brgy. Tanza, Boac is the Marinduque State University campus, built
// in. `sites` is the list from GET /api/field-sites; `onSitesChange` gets the new list.
export default function HRFieldSites({ sites = [], onSitesChange }) {
  const [open, setOpen] = useState(false);
  const [municipality, setMunicipality] = useState(MUNICIPALITIES[0]);
  const [barangay, setBarangay] = useState('');
  const [point, setPoint] = useState(null); // { latitude, longitude }
  const [name, setName] = useState(DEFAULT_FIELD_SITE_NAME);
  const [radius, setRadius] = useState(DEFAULT_FIELD_SITE_RADIUS);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [result, setResult] = useState({ text: '', error: false });
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  const barangays = MARINDUQUE_MUNICIPALITIES[municipality] || [];
  const builtIn = barangay ? builtInFieldSiteName(municipality, barangay) : '';
  const saved = useMemo(() => sites.find(site => site.municipality === municipality && site.barangay === barangay) || null, [sites, municipality, barangay]);

  // Choosing a barangay starts from its saved site, if it has one.
  useEffect(() => {
    setResult({ text: '', error: false });
    setPoint(saved ? { latitude: saved.latitude, longitude: saved.longitude } : null);
    setName(saved?.name || DEFAULT_FIELD_SITE_NAME);
    setRadius(saved?.radiusMeters || DEFAULT_FIELD_SITE_RADIUS);
  }, [municipality, barangay, saved]);

  // The map, made once the card is open.
  useEffect(() => {
    if (!open || !containerRef.current || mapRef.current) return undefined;
    const map = L.map(containerRef.current).setView([13.4, 121.95], 11);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      maxNativeZoom: 18,
      attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics'
    }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 18 }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [open]);

  // A tap on the map marks the site.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const onClick = event => {
      if (!barangay || builtIn) return;
      setPoint({ latitude: Math.round(event.latlng.lat * 1e6) / 1e6, longitude: Math.round(event.latlng.lng * 1e6) / 1e6 });
    };
    map.on('click', onClick);
    return () => map.off('click', onClick);
  }, [open, barangay, builtIn]);

  // The barangay's outline, and the site with its range.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const area = barangay ? MARINDUQUE_BARANGAY_AREAS[municipality]?.[barangay] : null;
    if (area) {
      const outline = L.geoJSON(area.geometry, { style: AREA_STYLE, interactive: false }).addTo(layer);
      if (!point) map.fitBounds(outline.getBounds(), { maxZoom: 17 });
    }
    if (point) {
      L.circle([point.latitude, point.longitude], { ...SITE_STYLE, radius, interactive: false }).addTo(layer);
      L.circleMarker([point.latitude, point.longitude], { radius: 7, color: '#ffffff', weight: 2, fillColor: '#16a34a', fillOpacity: 1 }).addTo(layer);
      map.setView([point.latitude, point.longitude], Math.max(map.getZoom(), 17));
    }
  }, [open, municipality, barangay, point, radius]);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setResult({ text: 'This device cannot give its location.', error: true });
      return;
    }
    setLocating(true);
    setResult({ text: '', error: false });
    navigator.geolocation.getCurrentPosition(position => {
      setLocating(false);
      if (!(position.coords.accuracy <= 30)) {
        setResult({ text: `GPS is only accurate to ${Math.round(position.coords.accuracy)} m here. Go outdoors and try again, or tap the site on the map.`, error: true });
        return;
      }
      setPoint({ latitude: Math.round(position.coords.latitude * 1e6) / 1e6, longitude: Math.round(position.coords.longitude * 1e6) / 1e6 });
    }, () => {
      setLocating(false);
      setResult({ text: 'Could not get this device\'s location. Allow location, or tap the site on the map.', error: true });
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  };

  const send = async (options, doneText) => {
    setSaving(true);
    setResult({ text: '', error: false });
    try {
      const query = options.method === 'DELETE' ? `?municipality=${encodeURIComponent(municipality)}&barangay=${encodeURIComponent(barangay)}` : '';
      const response = await apiFetch(`/api/field-sites${query}`, options);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save the field site.');
      onSitesChange?.(data.sites || []);
      setResult({ text: doneText, error: false });
    } catch (saveError) {
      setResult({ text: saveError.message || 'Unable to save the field site.', error: true });
    } finally {
      setSaving(false);
    }
  };
  const save = event => {
    event.preventDefault();
    if (!point) return;
    send({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ municipality, barangay, name: name.trim(), latitude: point.latitude, longitude: point.longitude, radiusMeters: radius })
    }, `Saved. Field work in Brgy. ${barangay}, ${municipality} now counts within ${radius} m of the ${name.trim() || DEFAULT_FIELD_SITE_NAME}.`);
  };
  const remove = () => {
    if (window.confirm(`Remove the field site of Brgy. ${barangay}, ${municipality}? Field work there will count anywhere in the barangay again.`)) {
      send({ method: 'DELETE' }, `Removed. Field work in Brgy. ${barangay}, ${municipality} counts anywhere in the barangay again.`);
    }
  };
  const pick = site => {
    setMunicipality(site.municipality);
    setBarangay(site.barangay);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="flex items-center gap-2">
          <MapPinned className="h-5 w-5 shrink-0 text-blue-700" />
          <span>
            <span className="block text-sm font-black text-slate-900">Field Sites</span>
            <span className="block text-xs text-slate-500">Where field work in a barangay counts, such as its barangay hall. {sites.length} set; a barangay without one counts as a whole.</span>
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 p-4">
          <p className="text-xs text-slate-500">A barangay can be 1 to 3 km across, so field work counts anywhere in it until you set its site. Choose the barangay, tap its barangay hall (or the site the staff go to) on the map, or stand there and use this device's GPS, then choose the range and save. Field work in Brgy. Tanza, Boac counts only inside the Marinduque State University campus.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[11px] font-black text-slate-600">Municipality
              <select value={municipality} onChange={event => { setMunicipality(event.target.value); setBarangay(''); }} className={inputClass}>
                {MUNICIPALITIES.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-black text-slate-600">Barangay
              <select value={barangay} onChange={event => setBarangay(event.target.value)} className={inputClass}>
                <option value="">Choose a barangay</option>
                {barangays.map(item => <option key={item} value={item}>{item}{sites.some(site => site.municipality === municipality && site.barangay === item) ? ' (site set)' : ''}</option>)}
              </select>
            </label>
          </div>
          <div ref={containerRef} className="h-72 w-full overflow-hidden rounded-xl border border-slate-200" />
          {builtIn ? (
            <p className="rounded-xl bg-blue-50 p-3 text-xs font-bold text-blue-800">Field work in Brgy. {barangay}, {municipality} counts only inside the {builtIn}. It is built in and cannot be changed here.</p>
          ) : barangay ? (
            <form onSubmit={save} className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="text-[11px] font-black text-slate-600 sm:col-span-2">Site name
                  <input value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder={DEFAULT_FIELD_SITE_NAME} className={inputClass} />
                </label>
                <label className="text-[11px] font-black text-slate-600">Range
                  <select value={radius} onChange={event => setRadius(Number(event.target.value))} className={inputClass}>
                    {FIELD_SITE_RADIUS_OPTIONS.map(option => <option key={option} value={option}>Within {option} m</option>)}
                  </select>
                </label>
              </div>
              <p className="text-xs text-slate-600">{point ? `Site: ${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}. Tap elsewhere on the map to move it.` : 'Tap the site on the map, inside the dashed outline of the barangay.'}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={useMyLocation} disabled={locating || saving} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50">
                  <Crosshair className="h-3.5 w-3.5" />{locating ? 'Locating...' : 'Use my location here'}
                </button>
                <button type="submit" disabled={!point || saving} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{saving ? 'Saving...' : saved ? 'Save changes' : 'Save field site'}</button>
                {saved && (
                  <button type="button" onClick={remove} disabled={saving} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-xs font-black text-rose-700 disabled:opacity-50">
                    <Trash2 className="h-3.5 w-3.5" />Remove
                  </button>
                )}
              </div>
            </form>
          ) : (
            <p className="text-xs text-slate-500">Choose a barangay to set its field site.</p>
          )}
          {result.text && <p className={`rounded-xl p-3 text-xs font-bold ${result.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{result.text}</p>}
          {sites.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Field sites set</p>
              {sites.map(site => (
                <button key={`${site.municipality}|${site.barangay}`} type="button" onClick={() => pick(site)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-left text-xs hover:bg-slate-50">
                  <span className="font-black text-slate-800">Brgy. {site.barangay}, {site.municipality}</span>
                  <span className="text-slate-500">{site.name} · within {site.radiusMeters} m</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
