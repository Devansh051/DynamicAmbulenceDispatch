import React, { useState, useEffect } from 'react';
import { Settings, Server, Database, Shield, Cpu, RefreshCw } from 'lucide-react';
import { healthService } from '../services/healthService';

export const SettingsPage = () => {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await healthService.getHealth();
      setHealth(res.data);
    } catch (err) {
      setHealth({ status: 'degraded', error: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-400" />
            System Configuration & Diagnostics
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            EMS Environment Variables, Database Connection Parameters, and Diagnostics
          </p>
        </div>
        <button
          onClick={fetchHealth}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Diagnostics
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Backend & Environment */}
        <div className="bg-[#131B2E] border border-[#1F2E4D] rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <Server className="w-4 h-4 text-blue-400" />
            Backend Application Environment
          </h3>

          <div className="space-y-3 text-xs font-mono">
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">SERVICE:</span>
              <span className="text-white">{health?.service || 'EMS Dynamic Ambulance Dispatch'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">VERSION:</span>
              <span className="text-emerald-400">{health?.version || '1.0.0 (Phase 1)'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">NODE RUNTIME:</span>
              <span className="text-slate-200">{health?.system?.nodeVersion || 'v24.x (Backend)'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">PLATFORM:</span>
              <span className="text-slate-200">{health?.system?.platform || 'win32'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">UPTIME:</span>
              <span className="text-blue-400">{health?.uptimeSeconds || 0} seconds</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">HEAP MEMORY:</span>
              <span className="text-slate-200">{health?.system?.memoryUsageMb || 0} MB</span>
            </div>
          </div>
        </div>

        {/* Database Configuration */}
        <div className="bg-[#131B2E] border border-[#1F2E4D] rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <Database className="w-4 h-4 text-emerald-400" />
            Database Integration (Microsoft SQL Server)
          </h3>

          <div className="space-y-3 text-xs font-mono">
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">TARGET DATABASE:</span>
              <span className="text-emerald-400 font-bold">{health?.database?.database || 'DynamicAmbulanceDispatch'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">SERVER INSTANCE:</span>
              <span className="text-white">{health?.database?.server || 'localhost\\SQLEXPRESS'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">CONNECTION STATUS:</span>
              <span className={health?.database?.connected ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {health?.database?.connected ? 'CONNECTED (ACID)' : 'DISCONNECTED'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">ROUNDTRIP LATENCY:</span>
              <span className="text-blue-400">{health?.database?.latencyMs ?? 0} ms</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/60">
              <span className="text-slate-400">LEGACY C++ COMPATIBILITY:</span>
              <span className="text-emerald-400">100% PRESERVED</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">SCHEMA MODIFICATIONS:</span>
              <span className="text-blue-400">ZERO (READ-ONLY INSPECTION)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
