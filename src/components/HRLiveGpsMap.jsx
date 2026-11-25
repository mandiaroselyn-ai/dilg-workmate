import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Maximize2, Minimize2 } from 'lucide-react';
import GoogleMutant from 'leaflet.gridlayer.googlemutant';
import polygonClipping from 'polygon-clipping';
import 'leaflet/dist/leaflet.css';
// Marinduque's land (the main island and its islets) from OpenStreetMap (ODbL),
// simplified to about 20 m.
import marinduqueLand from '../assets/marinduque-land.json';
import { GEOFENCE_METERS } from '../../shared/assignmentGeofence';
import { FIELD_RANGE_METERS } from '../../shared/dutyRange';

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

// HR's map of the employees who timed in today. While on duty, each dot is the employee's
// latest phone GPS, which the app sends every minute while it is open: green inside their
// assigned area, red outside it, blue while out for lunch. When no GPS has come for 15 minutes
// the dot stays at the last known location, faded. After Time Out the dot is gray, at where
// they timed in. The picked employee's assigned area is outlined, so HR can see whether they
// are really there.

const COLORS = { inside: '#16a34a', outside: '#dc2626', lunch: '#0284c7', done: '#94a3b8' };
const NO_SIGNAL_OPACITY = 0.4;
const MARINDUQUE = [13.4, 121.95];
// Each employee's range, a green circle at their location (shared/dutyRange.js); the picked
// employee's is drawn stronger.
const RANGE_STYLE = { color: '#16a34a', weight: 2, dashArray: '6 4', fillColor: '#16a34a', fillOpacity: 0.08 };
const PICKED_RANGE_STYLE = { ...RANGE_STYLE, weight: 3, fillOpacity: 0.16 };
// How far from an office or home address still counts as there, as in the Time In check
// (shared/assignmentGeofence.js). Within this distance of a barangay's edge also counts.
const ALLOWANCE_METERS = GEOFENCE_METERS;
// Areas up to this size across (a barangay is about 6 km) are shown whole when an
// employee is picked.
const SMALL_AREA_METERS = 7000;

// Text for Leaflet labels and popups, which are HTML: names come from user input.
const textElement = (tag, text, className = '') => {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
};

// The label on a dot: the employee's name, and whether they are in the Field, at the Office, or
// on WFH, with the place they are in once known.
const labelFor = point => {
  const label = document.createElement('div');
  label.append(textElement('div', point.name, 'font-bold'));
  const where = [point.duty, point.place].filter(Boolean).join(' · ');
  if (where) label.append(textElement('div', where, 'text-[10px] font-semibold text-slate-600'));
  return label;
};

const popupFor = point => {
  const wrapper = document.createElement('div');
  wrapper.append(textElement('strong', point.name), ...point.details.map(line => textElement('div', line)));
  return wrapper;
};

// The land part of an area. Town outlines on OpenStreetMap include their municipal
// waters, and a barangay that is only a point on the map gets a box that can reach into
// the sea, so assigned areas looked like they were in the sea. Only what HR sees is
// trimmed; the Time In check still uses the whole area. When nothing would be left, the
// area is shown as it is.
const landOnly = polygons => {
  try {
    const land = polygonClipping.intersection(polygons, marinduqueLand.coordinates);
    return land.length ? { type: 'MultiPolygon', coordinates: land } : null;
  } catch {
    return null;
  }
};

// How far, in meters, the corners of `bounds` are from its middle.
const halfDiagonalMeters = ({ south, north, west, east }) => {
  const latitude = (south + north) / 2;
  return Math.hypot((north - south) * 110574, (east - west) * 111320 * Math.cos(latitude * Math.PI / 180)) / 2;
};

// An employee's range, drawn as it is checked (shared/dutyRange.js): a circle (field work, 50 m
// around the Time In; a work-from-home address, 50 m), an office's grounds (a town hall with its
// 50 m drawn as a circle around it), the Marinduque State University campus, or a whole barangay's
// outline when nothing smaller is known. Nothing when its shape is not known.
const areaLayerFor = (area, style = RANGE_STYLE) => {
  if (!area) return null;
  const hasCenter = Number.isFinite(area.latitude) && Number.isFinite(area.longitude);
  const circle = radius => (hasCenter ? L.circle([area.latitude, area.longitude], { ...style, radius }) : null);
  if (Number(area.radiusMeters) > 0) return circle(Number(area.radiusMeters));
  const type = area.geometry?.type;
  const margin = Number(area.areaMarginMeters) || 0;
  const bounds = area.bounds || {};
  if ((type === 'Polygon' || type === 'MultiPolygon') && margin > 0 && [bounds.south, bounds.north, bounds.west, bounds.east].every(Number.isFinite)) {
    return circle(halfDiagonalMeters(bounds) + margin);
  }
  if (type === 'Polygon' || type === 'MultiPolygon') {
    const polygons = type === 'Polygon' ? [area.geometry.coordinates] : area.geometry.coordinates;
    return L.geoJSON(landOnly(polygons) || area.geometry, { style });
  }
  if (area.mode !== 'field') return circle(ALLOWANCE_METERS);
  if (!area.fallbackToRadius) return null;
  const { south, north, west, east } = bounds;
  if ([south, north, west, east].every(Number.isFinite)) {
    const box = [[[west, south], [east, south], [east, north], [west, north], [west, south]]];
    const land = landOnly([box]);
    return land ? L.geoJSON(land, { style }) : L.rectangle([[south, west], [north, east]], style);
  }
  return circle(ALLOWANCE_METERS);
};

// The area's extent, measured without adding it to the map: a Leaflet circle can only
// measure itself once it is on a map, so its extent is worked out from its radius.
const areaBoundsFor = area => {
  const layer = areaLayerFor(area);
  if (!layer) return null;
  return layer instanceof L.Circle ? layer.getLatLng().toBounds(layer.getRadius() * 2) : layer.getBounds();
};

// points: [{ key, name, latitude, longitude, state: 'inside' | 'outside' | 'lunch' | 'done',
//            noSignal, duty ('Field' | 'Office' | 'WFH'), area (their range), place,
//            details: [lines for the popup] }]
// Each employee's range is a green circle (or their office's grounds) at their location.
export default function HRLiveGpsMap({ points, selectedKey, onSelect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const fittedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const fullScreenRef = useRef(null);
  const [fullScreen, setFullScreen] = useState(false);

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

  // Redraws the dots and the picked employee's area whenever the data changes.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    // Each employee's range, under all the dots; the picked employee's stronger.
    points.forEach(point => {
      const range = areaLayerFor(point.area, point.key === selectedKey ? PICKED_RANGE_STYLE : RANGE_STYLE);
      if (!range) return;
      range.options.interactive = false;
      range.addTo(layer);
    });

    points.forEach(point => {
      const isSelected = point.key === selectedKey;
      L.circleMarker([point.latitude, point.longitude], {
        radius: isSelected ? 11 : 8,
        color: '#ffffff',
        weight: isSelected ? 3 : 2,
        dashArray: point.noSignal ? '3 3' : null,
        fillColor: COLORS[point.state],
        fillOpacity: point.noSignal ? NO_SIGNAL_OPACITY : 0.95
      })
        .bindTooltip(labelFor(point), { permanent: true, direction: 'top', offset: [0, -10], opacity: point.noSignal ? 0.6 : 0.9 })
        .bindPopup(popupFor(point))
        .on('click', () => onSelectRef.current?.(point.key))
        .addTo(layer);
    });

    // First time: show everyone. Afterwards the view only moves when HR picks someone, or
    // to keep the picked employee in view as they move.
    if (!fittedRef.current && points.length) {
      map.fitBounds(L.latLngBounds(points.map(point => [point.latitude, point.longitude])).pad(0.3), { maxZoom: 16 });
      fittedRef.current = true;
    }
    const selected = points.find(point => point.key === selectedKey);
    if (selected && !map.getBounds().contains([selected.latitude, selected.longitude])) {
      map.panTo([selected.latitude, selected.longitude]);
    }
  }, [points, selectedKey]);

  // Zooms to the selected employee, or back out to everyone when the selection is cleared.
  // A small assigned area (an office or a barangay) is shown whole with the employee. A
  // large one, such as a whole town, would zoom far out, so the map centers on the
  // employee close up instead.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const selected = points.find(point => point.key === selectedKey);
    if (!selected) {
      if (points.length) map.fitBounds(L.latLngBounds(points.map(point => [point.latitude, point.longitude])).pad(0.3), { maxZoom: 16 });
      return;
    }
    const position = L.latLng(selected.latitude, selected.longitude);
    const areaBounds = areaBoundsFor(selected.area);
    const smallArea = areaBounds && areaBounds.getNorthWest().distanceTo(areaBounds.getSouthEast()) <= SMALL_AREA_METERS;
    if (smallArea) {
      map.fitBounds(L.latLngBounds([position]).extend(areaBounds).pad(0.15), { maxZoom: 17 });
    } else {
      map.setView(position, 16);
    }
    fittedRef.current = true;
    // Only when HR picks a different employee, not on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  // Full screen uses the browser's own full screen, which shows above the header and sidebar.
  // Where the browser has none (iPhone), the map covers the page instead.
  const toggleFullScreen = () => {
    if (!fullScreen) fullScreenRef.current?.requestFullscreen?.().catch(() => {});
    setFullScreen(!fullScreen);
  };

  // Full screen changes the map's size, so Leaflet redraws it for the new size. Esc closes it.
  useEffect(() => {
    mapRef.current?.invalidateSize();
    if (!fullScreen) return;
    const box = fullScreenRef.current;
    const closeOnEscape = event => {
      if (event.key === 'Escape') setFullScreen(false);
    };
    // The browser's full screen takes Esc itself and only tells the page it has left.
    const closeWhenBrowserLeaves = () => {
      if (!document.fullscreenElement) setFullScreen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    document.addEventListener('fullscreenchange', closeWhenBrowserLeaves);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('fullscreenchange', closeWhenBrowserLeaves);
      if (document.fullscreenElement === box) document.exitFullscreen().catch(() => {});
    };
  }, [fullScreen]);

  return (
    <div className="space-y-2">
      <div ref={fullScreenRef} className={fullScreen ? 'fixed inset-0 z-[100] flex flex-col gap-2 bg-white p-3' : 'space-y-2'}>
        <div className="flex items-center justify-between gap-2">
          {fullScreen && <h3 className="text-base font-black text-slate-900">Live GPS Map</h3>}
          <button type="button" onClick={toggleFullScreen} className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-700">
            {fullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {fullScreen ? 'Close full screen' : 'Full screen'}
          </button>
        </div>
        <div className={`relative isolate z-0 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 ${fullScreen ? 'min-h-0 flex-1' : 'h-[55vh] min-h-[22rem] sm:h-[70vh]'}`}>
          {/* Leaflet adds its own classes to this div, so its className must never change:
              React would wipe them and the map tiles would disappear. */}
          <div ref={containerRef} className="h-full w-full" />
        </div>
        <div className="flex flex-wrap gap-3 text-[10px] font-bold text-slate-600">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS.inside }} />Inside assigned area</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS.outside }} />Outside assigned area</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS.lunch }} />On lunch</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-slate-700" style={{ backgroundColor: COLORS.inside, opacity: NO_SIGNAL_OPACITY }} />Faded: no live signal (15+ min), last known location</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS.done }} />Timed out</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-3 rounded-full border-2 border-dashed" style={{ borderColor: RANGE_STYLE.color, backgroundColor: `${RANGE_STYLE.color}1f` }} />Range: Office = its grounds, WFH = {GEOFENCE_METERS} m from home, Field = {FIELD_RANGE_METERS} m from where they timed in (Brgy. Tanza: the MarSU campus)</span>
        </div>
      </div>
      {points.length === 0 && <p className="text-center text-xs font-semibold text-slate-500">No employee has timed in today, so there is no one to show on the map.</p>}
    </div>
  );
}
