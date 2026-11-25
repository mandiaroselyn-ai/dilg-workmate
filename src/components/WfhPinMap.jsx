import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MARINDUQUE_BARANGAY_AREAS } from '../../shared/marinduqueBarangayAreas';
import { GEOFENCE_METERS } from '../../shared/assignmentGeofence';

const OUTLINE_STYLE = { color: '#38bdf8', weight: 2, dashArray: '6 4', fillOpacity: 0.04, interactive: false };
const RANGE_STYLE = { color: '#16a34a', weight: 2, fillColor: '#16a34a', fillOpacity: 0.15, interactive: false };

// HR pins an employee's work-from-home house (shared/wfhPin.js): the barangay's outline is
// dashed, a tap marks the house, and the green circle is the 50 m that counts for a WFH Time In.
// Satellite imagery with roads and place names, or the street map, so HR can find the house.
// The map does not zoom in by itself on a tap. `value` is { latitude, longitude } or null;
// `onChange` gets the new pin.
export default function WfhPinMap({ municipality, barangay, value, onChange }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const outlineRef = useRef(null);
  const pinRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const map = L.map(containerRef.current).setView([13.4, 121.95], 11);
    const esri = service => L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19, maxNativeZoom: 18 });
    const satellite = L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        maxNativeZoom: 18,
        attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics'
      }),
      esri('Reference/World_Transportation'),
      esri('Reference/World_Boundaries_and_Places')
    ]).addTo(map);
    const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' });
    L.control.layers({ Satellite: satellite, Map: street }, null, { position: 'topright' }).addTo(map);
    outlineRef.current = L.layerGroup().addTo(map);
    pinRef.current = L.layerGroup().addTo(map);
    map.on('click', event => onChangeRef.current?.({
      latitude: Math.round(event.latlng.lat * 1e6) / 1e6,
      longitude: Math.round(event.latlng.lng * 1e6) / 1e6
    }));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // The barangay's outline; the map shows the whole barangay, or the pin close up.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    outlineRef.current.clearLayers();
    const area = MARINDUQUE_BARANGAY_AREAS[municipality]?.[barangay];
    if (!area) return;
    const outline = L.geoJSON(area.geometry, { style: OUTLINE_STYLE }).addTo(outlineRef.current);
    if (value) map.setView([value.latitude, value.longitude], 18);
    else map.fitBounds(outline.getBounds(), { maxZoom: 17 });
    // Only when the barangay changes; a new pin keeps the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [municipality, barangay]);

  // The pin and its 50 m.
  useEffect(() => {
    if (!pinRef.current) return;
    pinRef.current.clearLayers();
    if (!value) return;
    L.circle([value.latitude, value.longitude], { ...RANGE_STYLE, radius: GEOFENCE_METERS }).addTo(pinRef.current);
    L.circleMarker([value.latitude, value.longitude], { radius: 7, color: '#ffffff', weight: 2, fillColor: '#16a34a', fillOpacity: 1, interactive: false }).addTo(pinRef.current);
  }, [value]);

  return <div ref={containerRef} className="h-72 w-full overflow-hidden rounded-xl border border-slate-200" />;
}
