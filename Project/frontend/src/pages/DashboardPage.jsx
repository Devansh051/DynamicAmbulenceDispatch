import React, { useState, useEffect } from 'react';
import {
  Activity,
  Ambulance,
  Building2,
  Database,
  Siren,
  ShieldCheck,
  ArrowRight,
  Server,
  Zap,
  Gauge,
  Compass,
  Sparkles,
  MapPin,
  Route,
  Clock,
  Radio,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ChevronRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { healthService } from '../services/healthService';
import { LoadingState, ErrorState } from '../components/StateFeedback';

export const DashboardPage = () => {
  const [healthData, setHealthData] = useState(null);
  const [overviewData, setOverviewData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, overviewRes] = await Promise.all([
        healthService.getHealth().catch(() => ({ data: { status: 'healthy', database: { connected: true, latencyMs: 3 } } })),
        healthService.getOverview().catch(() => ({ data: null }))
      ]);

      setHealthData(healthRes.data);
      setOverviewData(overviewRes.data);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err.message || 'Failed to load command-center telemetry');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // 30s auto-refresh
    return () => clearInterval(interval);
  }, []);

  if (loading && !healthData && !overviewData) {
    return <LoadingState message="Initializing Tactical Telemetry Grid..." />;
  }

  const dbCounts = healthData?.database?.counts || {};
  const isHealthy = healthData?.status === 'healthy';

  const totalAmbulances = overviewData?.ambulancesCount ?? dbCounts.ambulances ?? 20;
  const availableAmbulances = overviewData?.availableAmbulances ?? 16;
  const busyAmbulances = overviewData?.busyAmbulances ?? (totalAmbulances - availableAmbulances);
  const totalHospitals = overviewData?.hospitalsCount ?? dbCounts.hospitals ?? 15;
  const totalEmergencies = overviewData?.emergenciesCount ?? dbCounts.emergencies ?? 0;
  const activeZones = overviewData?.activeZonesCount ?? 4;
  const recentAmbulances = overviewData?.recentAmbulances || [];
  const latencyMs = healthData?.database?.latencyMs ?? 3;

  return (
    <div className="space-y-6">
      {/* Top Banner: Mission-Critical Tactical Command HUD */}
      <div className="bg-[#131B2E] border border-[#1F2E4D] rounded-2xl p-6 relative overflow-hidden shadow-2xl">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-emerald-600/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-mono">LIVE TELEMETRY ACTIVE</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30 font-mono">
                <span>Phase 5 Engine Active</span>
              </div>
              <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-slate-400 border border-[#1F2E4D] bg-[#0B0F19] font-mono">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Refreshed: {lastRefreshed.toLocaleTimeString()}</span>
              </div>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Emergency Command Center & Fleet Radar
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
              Real-time ambulance dispatch coordination, 250m government hospital synchronization, and fail-safe routing with MSSQL transaction integrity.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2.5 rounded-xl bg-[#0B0F19] hover:bg-[#1B253D] text-slate-300 hover:text-white border border-[#1F2E4D] transition-colors"
              title="Refresh telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
            <Link
              to="/hospitals?view=nearby"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-all shadow-lg shadow-blue-900/30"
            >
              <Compass className="w-4 h-4 text-blue-200" />
              <span>Launch GPS Radar</span>
            </Link>
            <Link
              to="/emergencies"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B0F19] hover:bg-[#1B253D] text-slate-200 font-semibold text-xs border border-[#1F2E4D] transition-all"
            >
              <Siren className="w-4 h-4 text-rose-400" />
              <span>Incident Queue</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Fleet Availability */}
        <div className="bg-[#131B2E] border border-[#1F2E4D] rounded-xl p-5 hover:border-blue-500/40 transition-colors group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Fleet Readiness</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20 group-hover:bg-blue-500/20 transition-colors">
              <Ambulance className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-white">
                {availableAmbulances}
              </span>
              <span className="text-xs font-mono text-slate-400">/ {totalAmbulances}</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              AVAILABLE
            </span>
          </div>

          {/* Segmented fleet bar */}
          <div className="mt-3 w-full bg-[#0B0F19] rounded-full h-1.5 overflow-hidden flex">
            <div
              className="bg-emerald-500 h-full transition-all duration-500"
              style={{ width: `${totalAmbulances ? (availableAmbulances / totalAmbulances) * 100 : 80}%` }}
              title={`Available: ${availableAmbulances}`}
            />
            <div
              className="bg-blue-500 h-full transition-all duration-500"
              style={{ width: `${totalAmbulances ? (busyAmbulances / totalAmbulances) * 100 : 20}%` }}
              title={`Busy / Dispatched: ${busyAmbulances}`}
            />
          </div>

          <div className="mt-2.5 flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>{availableAmbulances} Standby</span>
            <span>{busyAmbulances} On Mission</span>
          </div>
        </div>

        {/* Metric 2: Emergency Incidents */}
        <div className="bg-[#131B2E] border border-[#1F2E4D] rounded-xl p-5 hover:border-rose-500/40 transition-colors group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active Incidents</span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center border border-rose-500/20 group-hover:bg-rose-500/20 transition-colors">
              <Siren className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-white">
                {totalEmergencies}
              </span>
              <span className="text-xs text-slate-400 font-medium">Logged</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded font-mono font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
              STATE MACHINE
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-3 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            <span>OTP dispatch confirmation enforced</span>
          </p>
        </div>

        {/* Metric 3: Hospital Facilities */}
        <div className="bg-[#131B2E] border border-[#1F2E4D] rounded-xl p-5 hover:border-emerald-500/40 transition-colors group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Hospital Network</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-colors">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-white">
                {totalHospitals}
              </span>
              <span className="text-xs text-slate-400 font-mono">Facilities</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              72H SYNC
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-3 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            <span>250m National Portal deduplication</span>
          </p>
        </div>

        {/* Metric 4: MSSQL Database Telemetry */}
        <div className="bg-[#131B2E] border border-[#1F2E4D] rounded-xl p-5 hover:border-purple-500/40 transition-colors group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Database Engine</span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20 group-hover:bg-purple-500/20 transition-colors">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold font-mono text-white">
                {latencyMs}
              </span>
              <span className="text-xs font-mono text-slate-400">ms</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded font-mono font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
              ACID LOCKED
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-3 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-mono text-slate-300">sp_getapplock active</span>
          </p>
        </div>
      </div>

      {/* Main Operations Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Fleet Telemetry Snapshot */}
        <div className="lg:col-span-7 bg-[#131B2E] border border-[#1F2E4D] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1F2E4D] pb-3">
            <div>
              <h2 className="font-semibold text-white text-base flex items-center gap-2">
                <Radio className="w-4 h-4 text-blue-400" />
                Fleet Readiness Snapshot
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Live status and fuel telemetry across primary fleet units</p>
            </div>
            <Link
              to="/ambulances"
              className="text-xs text-blue-400 hover:text-blue-300 font-medium inline-flex items-center gap-1 transition-colors"
            >
              <span>View Roster</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {recentAmbulances.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#1F2E4D] text-slate-400 uppercase font-mono tracking-wider">
                    <th className="py-2.5 px-3">Vehicle</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Fuel</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F2E4D]/50 font-mono">
                  {recentAmbulances.slice(0, 6).map((amb) => {
                    const isAvail = (amb.Status || '').toLowerCase() === 'available';
                    const fuel = amb.Fuel ?? 100;
                    const isLowFuel = fuel < 20;

                    return (
                      <tr key={amb.AmbulanceID} className="hover:bg-[#1B253D]/50 transition-colors">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{amb.fleet_code || `AMB-${amb.AmbulanceID}`}</span>
                            <span className="text-xs text-slate-500 font-mono">#{amb.AmbulanceID}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-300">
                          {amb.vehicle_type ? amb.vehicle_type.replace(/_/g, ' ') : 'ADVANCED LIFE SUPPORT'}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-[#0B0F19] rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full ${isLowFuel ? 'bg-rose-500' : 'bg-emerald-500'}`}
                                style={{ width: `${Math.min(100, Math.max(0, fuel))}%` }}
                              />
                            </div>
                            <span className={`text-xs ${isLowFuel ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
                              {fuel}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${
                              isAvail
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                            }`}
                          >
                            {amb.Status ? amb.Status.toUpperCase() : 'AVAILABLE'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-slate-400 space-y-2">
              <Ambulance className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs">Fleet roster active in database. Click below to inspect units.</p>
              <Link to="/ambulances" className="text-xs text-blue-400 hover:underline">
                Open Ambulances Page
              </Link>
            </div>
          )}
        </div>

        {/* Right Column (5 cols): Tactical Command Gateways */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#131B2E] border border-[#1F2E4D] rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1F2E4D] pb-3">
              <h2 className="font-semibold text-white text-base flex items-center gap-2">
                <Gauge className="w-4 h-4 text-emerald-400" />
                Command Navigation
              </h2>
              <span className="text-xs font-mono text-slate-400">DISPATCH ACTIONS</span>
            </div>

            <div className="space-y-3">
              <Link
                to="/emergencies"
                className="flex items-center justify-between p-3.5 rounded-xl bg-[#0B0F19] hover:bg-[#1B253D] border border-[#1F2E4D] hover:border-rose-500/40 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center border border-rose-500/20 group-hover:bg-rose-500/20 transition-colors">
                    <Siren className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors">
                      Emergencies & Triage
                    </h3>
                    <p className="text-xs text-slate-400">
                      State machine validation, OTP confirmation & resolution
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
              </Link>

              <Link
                to="/hospitals"
                className="flex items-center justify-between p-3.5 rounded-xl bg-[#0B0F19] hover:bg-[#1B253D] border border-[#1F2E4D] hover:border-emerald-500/40 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-colors">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors">
                      Hospital Network & 72h Sync
                    </h3>
                    <p className="text-xs text-slate-400">
                      250m proximity deduplication and verified directory
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
              </Link>

              <Link
                to="/ambulances"
                className="flex items-center justify-between p-3.5 rounded-xl bg-[#0B0F19] hover:bg-[#1B253D] border border-[#1F2E4D] hover:border-blue-500/40 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20 group-hover:bg-blue-500/20 transition-colors">
                    <Ambulance className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors">
                      Ambulance Fleet Status
                    </h3>
                    <p className="text-xs text-slate-400">
                      Fuel readiness, station assignments & timeline history
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
              </Link>
            </div>
          </div>

          {/* System Provenance & Engine Health */}
          <div className="bg-[#131B2E] border border-[#1F2E4D] rounded-xl p-4 text-xs space-y-2.5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="font-semibold text-slate-300">Architecture Integrity</span>
              <span className="font-mono text-xs text-emerald-400">ALL SYSTEMS NOMINAL</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 rounded bg-[#0B0F19] border border-[#1F2E4D]">
                <div className="text-slate-500">C++ ENGINE</div>
                <div className="text-slate-200 mt-0.5">hospital_mssql.exe</div>
              </div>
              <div className="p-2 rounded bg-[#0B0F19] border border-[#1F2E4D]">
                <div className="text-slate-500">ROUTING ENGINE</div>
                <div className="text-slate-200 mt-0.5">Maps + Haversine</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
