import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import GoogleMutant from 'leaflet.gridlayer.googlemutant';
import 'leaflet/dist/leaflet.css';

// With a Google Maps API key (VITE_GOOGLE_MAPS_API_KEY, set on Vercel), the map uses
// Google's satellite view through Google's official Maps JavaScript API. Without one, or
// if Google rejects the key, it uses Esri's satellite imagery.
const GOOGLE_MAPS_KEY = import.meta.env?.VITE_GOOGLE_MAPS_API_KEY || '';

let googleMapsLoading = null;
const loadGoogleMaps = key => {
  if (window.google?.maps?.Map) return Promise.resolve();
  if (!googleMapsLoading) {
    googleMapsLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        googleMapsLoading = null;
        reject(new Error('Google Maps could not load.'));
      };
      document.head.append(script);
    });
  }
  return googleMapsLoading;
};

// HR's map of employees on duty. Each dot is where the employee was when they timed in
// (their phone's GPS, checked against their assigned area at Time In): green inside the
// area, red outside it. Someone picked after timing out is gray.

const COLORS = { inside: '#16a34a', outside: '#dc2626', stale: '#94a3b8' };
const MARINDUQUE = [13.4, 121.95];

// Text for Leaflet labels and popups, which are HTML: names come from user input.
const textElement = (tag, text, className = '') => {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
};

// The label on a dot: the employee's name and, once known, the place they are in.
const labelFor = point => {
  const label = document.createElement('div');
  label.append(textElement('div', point.name, 'font-bold'));
  if (point.place) label.append(textElement('div', point.place, 'text-[10px] font-semibold text-slate-600'));
  return label;
};

const popupFor = point => {
  const wrapper = document.createElement('div');
  wrapper.append(
    textElement('strong', point.name),
    textElement('div', point.place ? `Place at Time In: ${point.place}` : 'Place at Time In: finding place name…'),
    textElement('div', point.statusText || (point.state === 'inside' ? 'Inside assigned area' : 'Outside assigned area')),
    textElement('div', `Assigned: ${point.areaLabel || 'Not recorded'}`),
    textElement('div', point.lastUpdateText)
  );
  return wrapper;
};

// points: [{ key, name, latitude, longitude, state: 'inside' | 'outside', stale,
//            statusText?, place, areaLabel, lastUpdateText }]
export default function HRLiveGpsMap({ points, selectedKey, onSelect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const fittedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const map = L.map(containerRef.current).setView(MARINDUQUE, 11);
    // Satellite imagery with roads and place names drawn on top (like Google Maps'
    // satellite view), so HR can see the actual surroundings. The street map is one tap
    // away in the top-right corner.
    const esriLayer = service => L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`, {
      maxZoom: 19,
      maxNativeZoom: 18
    });
    const satellite = L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        maxNativeZoom: 18,
        attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics'
      }),
      esriLayer('Reference/World_Transportation'),
      esriLayer('Reference/World_Boundaries_and_Places')
    ]).addTo(map);
    const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    });
    const layerSwitch = L.control.layers({ Satellite: satellite, Map: street }, null, { position: 'topright' }).addTo(map);

    if (GOOGLE_MAPS_KEY) {
      loadGoogleMaps(GOOGLE_MAPS_KEY)
        .then(() => {
          if (mapRef.current !== map) return;
          const google = new GoogleMutant({ type: 'hybrid', maxZoom: 21, maxNativeZoom: 21 });
          // Google calls this when it rejects the key (for example, the site is not
          // allowed); the map then goes back to Esri's imagery.
          window.gm_authFailure = () => {
            if (mapRef.current !== map || !map.hasLayer(google)) return;
            map.removeLayer(google);
            satellite.addTo(map);
          };
          layerSwitch.addBaseLayer(google, 'Google satellite');
          map.removeLayer(satellite);
          google.addTo(map);
        })
        .catch(() => {
          // Esri's satellite imagery stays.
        });
    }
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Redraws the dots whenever the data changes.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    points.forEach(point => {
      const isSelected = point.key === selectedKey;
      L.circleMarker([point.latitude, point.longitude], {
        radius: isSelected ? 11 : 8,
        color: '#ffffff',
        weight: isSelected ? 3 : 2,
        fillColor: point.stale ? COLORS.stale : COLORS[point.state],
        fillOpacity: 0.95
      })
        .bindTooltip(labelFor(point), { permanent: true, direction: 'top', offset: [0, -10] })
        .bindPopup(popupFor(point))
        .on('click', () => onSelectRef.current?.(point.key))
        .addTo(layer);
    });

    // First time: show everyone. Afterwards the view only moves when HR picks someone.
    if (!fittedRef.current && points.length) {
      map.fitBounds(L.latLngBounds(points.map(point => [point.latitude, point.longitude])).pad(0.3), { maxZoom: 16 });
      fittedRef.current = true;
    }
  }, [points, selectedKey]);

  // Zooms in on the selected employee, or back out to everyone when the selection is cleared.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const selected = points.find(point => point.key === selectedKey);
    if (!selected) {
      if (points.length) map.fitBounds(L.latLngBounds(points.map(point => [point.latitude, point.longitude])).pad(0.3), { maxZoom: 16 });
      return;
    }
    map.setView([selected.latitude, selected.longitude], 16);
    fittedRef.current = true;
    // Only when HR picks a different employee, not on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="relative isolate z-0 h-80 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100" />
      <div className="flex flex-wrap gap-3 text-[10px] font-bold text-slate-600">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS.inside }} />Inside assigned area</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS.outside }} />Outside assigned area</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS.stale }} />Timed out</span>
      </div>
      <p className="text-xs font-semibold text-slate-500">Each dot is where the employee was when they timed in (their phone's GPS at Time In).</p>
      {points.length === 0 && <p className="text-center text-xs font-semibold text-slate-500">No employee is on duty right now, so there is no one to show on the map.</p>}
    </div>
  );
}
