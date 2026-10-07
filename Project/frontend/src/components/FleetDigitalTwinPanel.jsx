import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Ambulance, CloudOff, LocateFixed, Radio, RefreshCw, TriangleAlert } from 'lucide-react';
import GoogleMapView from './GoogleMapView';
import fleetService from '../services/fleetService';

const HEALTH_LABELS = {
  ONLINE: 'Online / fresh',
  LOCATION_STALE: 'Location stale',
  OFFLINE: 'Offline',
  LOCATION_UNAVAILABLE: 'Location unavailable'
};

const healthClass = (health) => ({
  ONLINE: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  LOCATION_STALE: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  OFFLINE: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
  LOCATION_UNAVAILABLE: 'bg-amber-500/10 text-amber-300 border-amber-500/30'
}[health] || 'bg-slate-500/10 text-slate-300 border-slate-500/30');

import { ageFleetState, hasFleetCoordinates, mergeFleetState, mergeFleetSnapshot } from '../services/fleetState';

const formatTime = (value) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

export const FleetDigitalTwinPanel = () => {
  const [fleetState, setFleet] = useState([]);
  const [now, setNow] = useState(Date.now);
  const fleet = useMemo(() => fleetState.map((vehicle) => ageFleetState(vehicle, now)), [fleetState, now]);
  const [selected, setSelected] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);
  const mountedRef = useRef(false);

  const refreshSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await fleetService.getSnapshot();
      if (!mountedRef.current) return;
      setFleet((previous) => mergeFleetSnapshot(previous, snapshot?.fleet, snapshot?.generated_at));
      setError(snapshot?.redis_live === false ? 'Live fleet storage unavailable. Showing last known positions.' : null);
      if (snapshot?.redis_live === false) setConnection('disconnected');
    } catch (requestError) {
      if (mountedRef.current) setError(requestError.message || 'Fleet snapshot could not be loaded. Reconnect or refresh to retry.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const selectAmbulance = useCallback((vehicle) => setSelected(vehicle), []);

  useEffect(() => {
    let mounted = true;
    mountedRef.current = true;
    const healthTimer = setInterval(() => setNow(Date.now()), 1000);
    refreshSnapshot();
    const socket = fleetService.connect({
      onConnect: () => mounted && setConnection('connected'),
      onDisconnect: () => mounted && setConnection('disconnected'),
      onSnapshot: (payload) => {
        if (!mounted) return;
        setFleet((previous) => mergeFleetSnapshot(previous, payload?.fleet, payload?.generated_at));
        setLoading(false);
        setError(payload?.redis_live === false ? 'Live fleet storage unavailable. Showing last known positions.' : null);
        setConnection(payload?.redis_live === false ? 'disconnected' : 'connected');
      },
      onUpdate: (payload) => mounted && setFleet((previous) => mergeFleetState(previous, payload)),
      onHealth: (payload) => mounted && setFleet((previous) => mergeFleetState(previous, payload)),
      onError: (socketError) => {
        if (!mounted) return;
        if (!socketError?.persistenceOnly) setConnection('disconnected');
        setError(socketError?.message || 'The live fleet connection is unavailable. Showing the last authorized snapshot.');
      }
    });
    socketRef.current = socket;
    return () => {
      mounted = false;
      mountedRef.current = false;
      clearInterval(healthTimer);
      socket.disconnect();
    };
  }, [refreshSnapshot]);

  const selectedVehicle = fleet.find((vehicle) => Number(vehicle.ambulance_id) === Number(selected?.ambulance_id)) || null;

  const mapCenter = useMemo(() => {
    const positioned = hasFleetCoordinates(selectedVehicle) ? selectedVehicle : fleet.find(hasFleetCoordinates);
    return positioned ? { lat: Number(positioned.latitude), lng: Number(positioned.longitude) } : { lat: 12.9716, lng: 77.5946 };
  }, [fleet, selectedVehicle]);

  return (
    <section className="bg-[#131B2E] border border-[#1F2E4D] rounded-xl overflow-hidden" aria-labelledby="live-fleet-heading">
      <div className="px-5 py-4 border-b border-[#1F2E4D] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="live-fleet-heading" className="text-base font-semibold text-white flex items-center gap-2"><Radio className="w-4 h-4 text-sky-400" />Live fleet digital twin</h2>
          <p className="text-xs text-slate-400 mt-1">Accepted GPS telemetry only. Current location, heartbeat, and dispatch state are independently tracked.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-mono ${connection === 'connected' ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' : 'text-amber-300 bg-amber-500/10 border-amber-500/30'}`}>
            {connection === 'connected' ? <Activity className="w-3.5 h-3.5" /> : <CloudOff className="w-3.5 h-3.5" />}
            {connection === 'connected' ? 'LIVE CONNECTED' : connection === 'connecting' ? 'CONNECTING' : 'LAST SNAPSHOT'}
          </span>
          <button onClick={refreshSnapshot} disabled={loading} className="p-2 rounded-md text-slate-300 border border-[#1F2E4D] hover:bg-[#1B253D] focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-50" aria-label="Refresh fleet snapshot">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <div role="alert" className="mx-5 mt-4 p-3 flex items-start gap-2 border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs rounded-md"><TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span></div>}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.8fr)]">
        <div className="p-4 border-b xl:border-b-0 xl:border-r border-[#1F2E4D]">
          <GoogleMapView center={mapCenter} ambulance={fleet.length ? null : selectedVehicle} fleet={fleet} onSelectAmbulance={selectAmbulance} radiusMeters={5000} isDemoFallback={fleet.length === 0} originType={fleet.length ? 'AMBULANCE_LIVE_GPS' : 'DEMO_FALLBACK'} />
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-slate-300" aria-label="Fleet map legend">
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-emerald-400" />Fresh location</span>
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-sky-400" />Active response</span>
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-amber-400" />Stale / unavailable</span>
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-slate-400" />Offline</span>
          </div>
        </div>

        <div className="max-h-[560px] overflow-y-auto divide-y divide-[#1F2E4D]">
          {loading && !fleet.length && <div className="p-6 text-xs text-slate-400 font-mono">Loading authorized fleet snapshot…</div>}
          {!loading && !fleet.length && <div className="p-7 text-center text-slate-400"><Ambulance className="w-7 h-7 mx-auto mb-2 text-slate-600" /><p className="text-xs">No fleet telemetry is available yet.</p><p className="text-[11px] mt-1">Start the opt-in simulator or connect an authorized telemetry device.</p></div>}
          {fleet.map((vehicle) => {
            const selectedId = Number(selectedVehicle?.ambulance_id) === Number(vehicle.ambulance_id);
            return <button key={vehicle.ambulance_id} onClick={() => selectAmbulance(vehicle)} className={`w-full text-left p-4 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-400 ${selectedId ? 'bg-[#1B253D]' : 'hover:bg-[#1B253D]/60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div><div className="font-mono text-sm font-semibold text-white">{vehicle.fleet_code || `AMB-${vehicle.ambulance_id}`}</div><div className="text-[11px] text-slate-400 mt-1">{String(vehicle.operational_status || 'AVAILABLE').replace(/_/g, ' ')}</div>{vehicle.is_simulated && <div className="text-[11px] text-sky-300 mt-1">Simulated vehicle</div>}{vehicle.restored_from_database && <div className="text-[11px] text-amber-300 mt-1">Historical position, not live GPS</div>}</div>
                <span className={`px-2 py-0.5 rounded border text-[10px] font-medium ${healthClass(vehicle.health)}`}>{HEALTH_LABELS[vehicle.health] || 'Unknown'}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-400"><span>{vehicle.speed_kph == null ? 'Speed —' : `${vehicle.speed_kph} km/h`}</span><span className="text-right">GPS {formatTime(vehicle.last_gps_at)}</span></div>
              {vehicle.assignment_id && <div className="mt-2 text-[10px] text-sky-300 flex items-center gap-1"><LocateFixed className="w-3 h-3" />Incident #{vehicle.assignment_id}</div>}
            </button>;
          })}
        </div>
      </div>
    </section>
  );
};

export default FleetDigitalTwinPanel;
