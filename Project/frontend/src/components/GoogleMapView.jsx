import React, { useEffect, useRef, useState } from 'react';
import { Ambulance, Building2, MapPin, Navigation, Compass, Layers, ShieldCheck, Info } from 'lucide-react';

const EMPTY_LIST = Object.freeze([]);
const NOOP = () => {};
const validNumber = (value) => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value));
const hasCoordinates = (latitude, longitude) => validNumber(latitude) && validNumber(longitude) && Math.abs(Number(latitude)) <= 90 && Math.abs(Number(longitude)) <= 180;
const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

/**
 * Decodes Google Maps encoded polyline algorithm format into lat/lng array
 */
function decodePolyline(encoded) {
  if (!encoded) return [];
  const poly = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    poly.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return poly;
}

export const GoogleMapView = ({
  center = { lat: 12.9716, lng: 77.5946 },
  ambulance = null,
  hospitals = EMPTY_LIST,
  selectedHospital = null,
  onSelectHospital = NOOP,
  radiusMeters = 15000,
  isDemoFallback = false,
  originType = 'DEMO_FALLBACK',
  isGpsStale = false,
  locationTimestamp = null,
  fleet = EMPTY_LIST,
  onSelectAmbulance = NOOP
}) => {
  const mapRef = useRef(null);
  const googleMapInstance = useRef(null);
  const markersRef = useRef([]);
  const polylineRef = useRef(null);
  const circleRef = useRef(null);
  const fleetMarkersRef = useRef(new Map());

  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [mapLoadError, setMapLoadError] = useState(false);
  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_BROWSER_API_KEY || '').trim();
  const hasFleetLayer = fleet.length > 0;
  const legacyCenter = hasFleetLayer ? null : center;
  const legacyAmbulance = hasFleetLayer ? null : ambulance;

  // Bound external loading and release handlers on navigation/remount.
  useEffect(() => {
    const previous = window.gm_authFailure;
    const onAuthFailure = () => { setMapLoadError(true); setMapsLoaded(false); previous?.(); };
    window.gm_authFailure = onAuthFailure;
    return () => { if (window.gm_authFailure === onAuthFailure) window.gm_authFailure = previous; };
  }, []);

  useEffect(() => {
    const isTestEnv = typeof process !== 'undefined' && (process.env?.NODE_ENV === 'test' || process.env?.VITEST);
    if (!apiKey || isTestEnv) { setMapLoadError(true); return; }
    if (window.google?.maps?.Map) { setMapLoadError(false); setMapsLoaded(true); return; }
    let script = document.getElementById('google-maps-script');
    const created = !script;
    if (created) {
      script = document.createElement('script');
      script.id = 'google-maps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places,geometry`;
      script.async = true;
      script.defer = true;
    }
    const fail = () => { setMapLoadError(true); setMapsLoaded(false); };
    const timer = setTimeout(fail, 15000);
    const loaded = () => {
      clearTimeout(timer);
      if (!window.google?.maps?.Map) return fail();
      setMapLoadError(false); setMapsLoaded(true);
    };
    const failed = () => { clearTimeout(timer); fail(); };
    script.addEventListener('load', loaded);
    script.addEventListener('error', failed);
    if (created) document.head.appendChild(script);
    return () => { clearTimeout(timer); script.removeEventListener('load', loaded); script.removeEventListener('error', failed); };
  }, [apiKey]);

  // Initialize and update Google Map
  useEffect(() => {
    if (!mapsLoaded || !mapRef.current || !window.google?.maps) return;

    if (!googleMapInstance.current) {
      googleMapInstance.current = new window.google.maps.Map(mapRef.current, {
        center,
        zoom: 12,
        mapTypeId: 'roadmap',
        disableDefaultUI: false,
        zoomControl: true,
        streetViewControl: false,
        fullscreenControl: true,
        styles: [
          { elementType: 'geometry', stylers: [{ color: '#1a2234' }] },
          { elementType: 'labels.text.stroke', stylers: [{ color: '#1a2234' }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
          {
            featureType: 'administrative.locality',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#d59563' }]
          },
          {
            featureType: 'poi',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#d59563' }]
          },
          {
            featureType: 'poi.park',
            elementType: 'geometry',
            stylers: [{ color: '#142a27' }]
          },
          {
            featureType: 'road',
            elementType: 'geometry',
            stylers: [{ color: '#29354e' }]
          },
          {
            featureType: 'road',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#1b2334' }]
          },
          {
            featureType: 'road',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#9ca5b9' }]
          },
          {
            featureType: 'road.highway',
            elementType: 'geometry',
            stylers: [{ color: '#3d4c6a' }]
          },
          {
            featureType: 'water',
            elementType: 'geometry',
            stylers: [{ color: '#0f172a' }]
          }
        ]
      });
    }

    const map = googleMapInstance.current;

    // Clear old markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    // Clear old radius circle
    if (circleRef.current) {
      circleRef.current.setMap(null);
    }

    // Draw radius boundary circle
    circleRef.current = new window.google.maps.Circle({
      strokeColor: '#10B981',
      strokeOpacity: 0.5,
      strokeWeight: 1.5,
      fillColor: '#10B981',
      fillOpacity: 0.06,
      map,
      center,
      radius: radiusMeters
    });

    // 1. Ambulance / Origin Marker. In live fleet mode this is deliberately
    // omitted because the reconciled fleet layer already owns every marker.
    if (!hasFleetLayer) {
    const isFallback = isDemoFallback || originType === 'DEMO_FALLBACK';
    const markerTitle = isFallback
      ? 'Demo / Fallback Origin (Bengaluru - Not Live Ambulance)'
      : (ambulance ? `Ambulance ${ambulance.fleet_code || `#${ambulance.AmbulanceID}`}` : 'Dispatch GPS Origin');

    const ambulanceMarker = new window.google.maps.Marker({
      position: center,
      map,
      title: markerTitle,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: isFallback ? '#F59E0B' : (isGpsStale ? '#EA580C' : '#EF4444'),
        fillOpacity: 1,
        strokeColor: '#FFFFFF',
        strokeWeight: 3
      }
    });

    const ambInfoWindow = new window.google.maps.InfoWindow({
      content: `
        <div style="color: #0f172a; padding: 8px; font-family: sans-serif; font-size: 12px; max-width: 240px;">
          <div style="font-weight: bold; font-size: 13px; margin-bottom: 4px; color: ${isFallback ? '#d97706' : '#ef4444'};">
            ${isFallback ? '📍 Demo / Fallback Origin' : `🚑 Ambulance ${escapeHtml(ambulance?.fleet_code || `#${ambulance?.AmbulanceID || ''}`)}`}
          </div>
          ${isFallback ? '<div style="color: #b45309; font-size: 11px; margin-bottom: 4px; font-weight: 600;">⚠️ Bengaluru Demo Reference — Not Live Vehicle GPS</div>' : ''}
          ${isGpsStale ? '<div style="color: #ea580c; font-size: 11px; margin-bottom: 4px; font-weight: 600;">⚠️ Location Stale (>15 minutes old)</div>' : ''}
          <div>Lat: ${center.lat.toFixed(5)}, Lng: ${center.lng.toFixed(5)}</div>
          <div>Status: <strong>${escapeHtml(ambulance?.Status || ambulance?.status || 'N/A')}</strong></div>
          ${locationTimestamp ? `<div style="font-size: 10px; color: #64748b; margin-top: 4px;">Last GPS Sync: ${new Date(locationTimestamp).toLocaleTimeString()}</div>` : ''}
        </div>
      `
    });
    ambulanceMarker.addListener('click', () => ambInfoWindow.open(map, ambulanceMarker));
    markersRef.current.push(ambulanceMarker);
    }

    // 2. Hospital Markers
    hospitals.forEach((hosp) => {
      if (!hasCoordinates(hosp.latitude, hosp.longitude)) return;
      const isSelected = selectedHospital && (selectedHospital.HospitalID === hosp.HospitalID || selectedHospital.name === hosp.name);

      let pinColor = '#10B981'; // Gov NIN Directory = Emerald
      if (hosp.data_source === 'GOOGLE_PLACES') pinColor = '#3B82F6'; // Google Places = Blue
      if (hosp.data_source === 'MATCHED_BOTH') pinColor = '#8B5CF6'; // Matched Both = Purple

      const marker = new window.google.maps.Marker({
        position: { lat: parseFloat(hosp.latitude), lng: parseFloat(hosp.longitude) },
        map,
        title: hosp.name || hosp.HospitalName,
        zIndex: isSelected ? 999 : 10,
        icon: {
          path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
          scale: isSelected ? 7 : 5,
          fillColor: pinColor,
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: isSelected ? 2.5 : 1.5
        }
      });

      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="color: #0f172a; padding: 8px; font-family: sans-serif; max-width: 220px;">
            <div style="font-weight: bold; font-size: 13px; margin-bottom: 4px; color: ${pinColor};">
              🏥 ${escapeHtml(hosp.name || hosp.HospitalName)}
            </div>
            <div style="font-size: 11px; color: #475569; margin-bottom: 4px;">
              ${escapeHtml(hosp.address || hosp.Location || 'Address not listed')}
            </div>
            <div style="display: flex; gap: 8px; font-size: 11px; margin-top: 6px; font-weight: 600;">
              <span>📍 ${escapeHtml(hosp.distance_km || '?')} km</span>
              <span>⏱️ ${hosp.duration_minutes ? `${escapeHtml(hosp.duration_minutes)} mins` : '?'}</span>
            </div>
            <div style="margin-top: 6px; font-size: 10px; color: #64748b;">
              Source: <strong>${escapeHtml(hosp.data_source || 'GOV_DIRECTORY')}</strong>
            </div>
          </div>
        `
      });

      marker.addListener('click', () => {
        infoWindow.open(map, marker);
        onSelectHospital(hosp);
      });

      markersRef.current.push(marker);
    });

    // 3. Polyline Route Drawing
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    if (selectedHospital && hasCoordinates(selectedHospital.latitude, selectedHospital.longitude)) {
      let routePath = [];
      if (selectedHospital.route?.encoded_polyline) {
        routePath = decodePolyline(selectedHospital.route.encoded_polyline);
      } else {
        routePath = [
          center,
          { lat: parseFloat(selectedHospital.latitude), lng: parseFloat(selectedHospital.longitude) }
        ];
      }

      polylineRef.current = new window.google.maps.Polyline({
        path: routePath,
        geodesic: true,
        strokeColor: '#38BDF8',
        strokeOpacity: 0.9,
        strokeWeight: 4,
        map
      });
    }
  }, [mapsLoaded, legacyCenter, hospitals, selectedHospital, radiusMeters, onSelectHospital, legacyAmbulance, isDemoFallback, originType, isGpsStale, locationTimestamp, hasFleetLayer]);

  // Position updates are intentionally separated from legacy layers: fleet
  // telemetry can re-center the map without rebuilding hospital markers.
  useEffect(() => {
    if (!mapsLoaded || !googleMapInstance.current || !hasCoordinates(center.lat, center.lng)) return;
    googleMapInstance.current.setCenter(center);
    circleRef.current?.setCenter(center);
    circleRef.current?.setRadius(radiusMeters);
  }, [mapsLoaded, center, radiusMeters]);

  // Fleet markers have their own reconciliation pass so location events only
  // move the affected marker; the Google map and hospital layers are preserved.
  useEffect(() => {
    if (!mapsLoaded || !googleMapInstance.current || !window.google?.maps) return;
    const map = googleMapInstance.current;
    const visibleIds = new Set();
    const healthColor = (vehicle) => {
      if (vehicle.health === 'OFFLINE') return '#64748B';
      if (vehicle.health === 'LOCATION_STALE' || vehicle.health === 'LOCATION_UNAVAILABLE') return '#F59E0B';
      if (vehicle.operational_status === 'AVAILABLE') return '#10B981';
      return '#38BDF8';
    };

    fleet.forEach((vehicle) => {
      const id = String(vehicle.ambulance_id || vehicle.AmbulanceID);
      const latitude = Number(vehicle.latitude);
      const longitude = Number(vehicle.longitude);
      if (!id || !hasCoordinates(vehicle.latitude, vehicle.longitude)) return;
      visibleIds.add(id);
      const position = { lat: latitude, lng: longitude };
      const color = healthColor(vehicle);
      let entry = fleetMarkersRef.current.get(id);
      if (!entry) {
        const marker = new window.google.maps.Marker({
          map,
          position,
          title: vehicle.fleet_code || `Ambulance #${id}`,
          icon: {
            path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 6,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: '#FFFFFF',
            strokeWeight: 2,
            rotation: Number(vehicle.heading_degrees || 0)
          }
        });
        const infoWindow = new window.google.maps.InfoWindow();
        marker.addListener('click', () => {
          onSelectAmbulance(entry.vehicle);
          infoWindow.open(map, marker);
        });
        entry = { marker, infoWindow, vehicle };
        fleetMarkersRef.current.set(id, entry);
      }
      entry.vehicle = vehicle;
      entry.marker.setPosition(position);
      entry.marker.setTitle(vehicle.fleet_code || `Ambulance #${id}`);
      entry.marker.setIcon({
        path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 6,
        fillColor: color,
        fillOpacity: vehicle.health === 'OFFLINE' ? 0.55 : 1,
        strokeColor: '#FFFFFF',
        strokeWeight: 2,
        rotation: Number(vehicle.heading_degrees || 0)
      });
      entry.infoWindow.setContent(`
        <div style="color:#0f172a;padding:8px;font-family:sans-serif;font-size:12px;min-width:190px;">
          <strong>${escapeHtml(vehicle.fleet_code || `Ambulance #${id}`)}</strong>
          <div>Status: ${escapeHtml(String(vehicle.operational_status || 'AVAILABLE').replace(/_/g, ' '))}</div>
          <div>Connection: ${escapeHtml(String(vehicle.health || 'LOCATION_UNAVAILABLE').replace(/_/g, ' '))}</div>
          <div>Speed: ${vehicle.speed_kph ?? '—'} km/h</div>
          <div>Updated: ${vehicle.last_gps_at ? new Date(vehicle.last_gps_at).toLocaleTimeString() : 'Location unavailable'}</div>
        </div>
      `);
    });
    fleetMarkersRef.current.forEach((entry, id) => {
      if (!visibleIds.has(id)) {
        entry.marker.setMap(null);
        fleetMarkersRef.current.delete(id);
      }
    });
  }, [fleet, mapsLoaded, onSelectAmbulance]);

  useEffect(() => () => {
    fleetMarkersRef.current.forEach(({ marker }) => marker.setMap(null));
    fleetMarkersRef.current.clear();
  }, []);

  // Tactical SVG Vector Radar Fallback View when Google Maps API Key is omitted
  if (!apiKey || mapLoadError) {
    const scaleFactor = 160 / (radiusMeters / 1000); // 160px is radar boundary in SVG

    return (
      <div className="relative w-full h-[460px] bg-[#0A0F1D] rounded-2xl border border-slate-800 overflow-hidden flex flex-col items-center justify-center p-4">
        {/* Subtle grid backdrop */}
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none" />

        {/* Top Info Bar */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-10">
          <div className="flex items-center gap-2 bg-[#0F172A]/90 backdrop-blur border border-slate-700/80 px-3 py-1.5 rounded-lg text-xs">
            <Compass className="w-3.5 h-3.5 text-emerald-400 animate-spin-slow" />
            <span className="text-white font-medium">EMS Tactical Radar & Vector View</span>
            <span className="text-slate-400">({(radiusMeters / 1000).toFixed(0)} km scan)</span>
          </div>

          <div className="flex items-center gap-2">
            {isDemoFallback ? (
              <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg text-[11px] text-amber-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>Demo / Fallback Origin</span>
              </div>
            ) : isGpsStale ? (
              <div className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/30 px-2.5 py-1 rounded-lg text-[11px] text-orange-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-orange-400" />
                <span>GPS Stale (&gt;15m)</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-[11px] text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{hasFleetLayer ? 'Fleet positions ? see health legend' : 'Live GPS'}</span>
              </div>
            )}
            <div className="flex items-center gap-2 bg-[#0F172A]/90 backdrop-blur border border-slate-700/80 px-3 py-1.5 rounded-lg text-[11px] text-slate-300">
              <span>Center: {center.lat.toFixed(4)}, {center.lng.toFixed(4)}</span>
            </div>
          </div>
        </div>

        {/* SVG Tactical Radar Display */}
        <div className="relative w-[360px] h-[360px] flex items-center justify-center">
          <svg className="w-full h-full" viewBox="0 0 360 360">
            {/* Concentric distance rings */}
            <circle cx="180" cy="180" r="40" fill="none" stroke="#1E293B" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx="180" cy="180" r="80" fill="none" stroke="#1E293B" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx="180" cy="180" r="120" fill="none" stroke="#1E293B" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx="180" cy="180" r="160" fill="none" stroke="#10B981" strokeWidth="1.5" strokeOpacity="0.4" />

            {/* Crosshairs */}
            <line x1="20" y1="180" x2="340" y2="180" stroke="#1E293B" strokeWidth="1" strokeDasharray="2 2" />
            <line x1="180" y1="20" x2="180" y2="340" stroke="#1E293B" strokeWidth="1" strokeDasharray="2 2" />

            {/* Radar Sweep Animation */}
            <g className="origin-center animate-[spin_6s_linear_infinite]" style={{ transformOrigin: '180px 180px' }}>
              <defs>
                <linearGradient id="radarSweep" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M 180 180 L 180 20 A 160 160 0 0 1 320 100 Z" fill="url(#radarSweep)" />
            </g>

            {/* Connecting Route Line if a hospital is selected */}
            {selectedHospital && hasCoordinates(selectedHospital.latitude, selectedHospital.longitude) && (() => {
              const dLat = (parseFloat(selectedHospital.latitude) - center.lat) * 111;
              const dLng = (parseFloat(selectedHospital.longitude) - center.lng) * 111 * Math.cos((center.lat * Math.PI) / 180);
              const targetX = 180 + dLng * scaleFactor;
              const targetY = 180 - dLat * scaleFactor;

              return (
                <line
                  x1="180"
                  y1="180"
                  x2={Math.max(20, Math.min(340, targetX))}
                  y2={Math.max(20, Math.min(340, targetY))}
                  stroke="#38BDF8"
                  strokeWidth="2.5"
                  strokeDasharray="4 2"
                  className="animate-pulse"
                />
              );
            })()}

            {!hasFleetLayer && <>
              <circle
                cx="180"
                cy="180"
                r="14"
                fill={isDemoFallback ? '#F59E0B' : (isGpsStale ? '#EA580C' : '#EF4444')}
                fillOpacity="0.25"
                className="animate-ping"
              />
              <circle
                cx="180"
                cy="180"
                r="7"
                fill={isDemoFallback ? '#F59E0B' : (isGpsStale ? '#EA580C' : '#EF4444')}
                stroke="#FFFFFF"
                strokeWidth="2"
              />
            </>}

            {/* Hospital Markers plotted relative to center */}
            {fleet.map((vehicle) => {
              const latitude = Number(vehicle.latitude);
              const longitude = Number(vehicle.longitude);
              if (!hasCoordinates(vehicle.latitude, vehicle.longitude)) return null;
              const dLat = (latitude - center.lat) * 111;
              const dLng = (longitude - center.lng) * 111 * Math.cos((center.lat * Math.PI) / 180);
              const x = Math.max(25, Math.min(335, 180 + dLng * scaleFactor));
              const y = Math.max(25, Math.min(335, 180 - dLat * scaleFactor));
              const color = vehicle.health === 'OFFLINE' ? '#64748B'
                : vehicle.health === 'LOCATION_STALE' || vehicle.health === 'LOCATION_UNAVAILABLE' ? '#F59E0B'
                : vehicle.operational_status === 'AVAILABLE' ? '#10B981' : '#38BDF8';
              return (
                <g
                  key={`fleet-${vehicle.ambulance_id}`}
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${vehicle.fleet_code || `ambulance ${vehicle.ambulance_id}`}`}
                  onClick={() => onSelectAmbulance(vehicle)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectAmbulance(vehicle);
                    }
                  }}
                >
                  <circle cx={x} cy={y} r="7" fill={color} fillOpacity={vehicle.health === 'OFFLINE' ? 0.55 : 1} stroke="#FFFFFF" strokeWidth="1.5" />
                  <text x={x + 9} y={y + 3} fill="#E2E8F0" fontSize="8" className="font-mono">{vehicle.fleet_code || `#${vehicle.ambulance_id}`}</text>
                </g>
              );
            })}
            {hospitals.map((hosp, idx) => {
              if (!hasCoordinates(hosp.latitude, hosp.longitude)) return null;
              const dLat = (parseFloat(hosp.latitude) - center.lat) * 111; // ~111km per lat degree
              const dLng = (parseFloat(hosp.longitude) - center.lng) * 111 * Math.cos((center.lat * Math.PI) / 180);
              const x = 180 + dLng * scaleFactor;
              const y = 180 - dLat * scaleFactor;

              // Constrain to radar bounds
              const clampedX = Math.max(25, Math.min(335, x));
              const clampedY = Math.max(25, Math.min(335, y));
              const isSelected = selectedHospital && (selectedHospital.HospitalID === hosp.HospitalID || selectedHospital.name === hosp.name);

              let fillColor = '#10B981';
              if (hosp.data_source === 'GOOGLE_PLACES') fillColor = '#3B82F6';
              if (hosp.data_source === 'MATCHED_BOTH') fillColor = '#8B5CF6';

              return (
                <g
                  key={idx}
                  className="cursor-pointer transition-transform hover:scale-125"
                  onClick={() => onSelectHospital(hosp)}
                >
                  {isSelected && (
                    <circle cx={clampedX} cy={clampedY} r="12" fill={fillColor} fillOpacity="0.3" className="animate-pulse" />
                  )}
                  <circle
                    cx={clampedX}
                    cy={clampedY}
                    r={isSelected ? 6 : 4.5}
                    fill={fillColor}
                    stroke="#FFFFFF"
                    strokeWidth={isSelected ? 2 : 1}
                  />
                </g>
              );
            })}
          </svg>

          {/* Center Label */}
          {!hasFleetLayer && <div className="absolute flex flex-col items-center pointer-events-none mt-7">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
              isDemoFallback
                ? 'text-amber-400 bg-[#0F172A]/90 border-amber-500/30'
                : 'text-red-400 bg-[#0F172A]/90 border-red-500/30'
            }`}>
              {isDemoFallback ? 'DEMO / FALLBACK ORIGIN' : (ambulance?.fleet_code || 'AMBULANCE')}
            </span>
          </div>}
        </div>

        {/* Bottom Legend */}
        <div className="absolute bottom-3 left-4 right-4 flex flex-wrap items-center justify-between gap-2 pointer-events-none z-10">
          <div className="flex items-center gap-3 bg-[#0F172A]/90 backdrop-blur border border-slate-700/80 px-3 py-1.5 rounded-lg text-[10px]">
            {!hasFleetLayer && <span className="flex items-center gap-1.5 text-slate-300">
              <span className={`w-2 h-2 rounded-full ${isDemoFallback ? 'bg-amber-400' : 'bg-red-500'}`} />
              <span>{isDemoFallback ? 'Demo Origin' : 'Ambulance GPS'}</span>
            </span>}
            {fleet.length > 0 && <span className="flex items-center gap-1.5 text-slate-300"><span className="w-2 h-2 rounded-full bg-sky-400" /><span>Live Fleet ({fleet.length})</span></span>}
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>NIN Directory</span>
            </span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span>Google Places</span>
            </span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              <span>Cross-Matched</span>
            </span>
          </div>

          <div className="text-[10px] text-slate-400 bg-[#0F172A]/80 px-2.5 py-1 rounded border border-slate-800">
            {apiKey && mapLoadError ? (
              <span className="text-amber-400">Google Maps unavailable. Vector view active.</span>
            ) : (
              <span>Configure <code className="text-emerald-400">VITE_GOOGLE_MAPS_BROWSER_API_KEY</code> for Google Satellite/Street view</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[460px] rounded-2xl overflow-hidden border border-slate-800 shadow-xl">
      <div ref={mapRef} className="w-full h-full" />
      {!mapsLoaded && <div role="status" className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">Loading map...</div>}
    </div>
  );
};

export default GoogleMapView;
