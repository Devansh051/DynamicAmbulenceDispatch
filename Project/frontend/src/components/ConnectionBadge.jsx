import React, { useState, useEffect } from 'react';
import { Activity, Database, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { healthService } from '../services/healthService';

export const ConnectionBadge = () => {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);

  const checkHealth = async () => {
    setLoading(true);
    try {
      const response = await healthService.getHealth();
      setHealth(response.data);
      setError(null);
      setLastChecked(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.message || 'Backend unreachable');
      setHealth(null);
      setLastChecked(new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const isDbConnected = health?.database?.connected;
  const isHealthy = health?.status === 'healthy' && isDbConnected;

  return (
    <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-1.5 text-xs shadow-inner">
      {/* Backend API Status */}
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          {isHealthy ? (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </>
          ) : loading ? (
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          ) : (
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
          )}
        </span>
        <span className="font-medium text-slate-300">
          API: {isHealthy ? 'ONLINE' : loading ? 'CHECKING...' : 'OFFLINE'}
        </span>
      </div>

      <div className="h-3 w-px bg-slate-700" />

      {/* SQL Server Database Status */}
      <div className="flex items-center gap-1.5">
        <Database className={`w-3.5 h-3.5 ${isDbConnected ? 'text-emerald-400' : 'text-rose-400'}`} />
        <span className={`font-mono ${isDbConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
          SQL: {isDbConnected ? 'CONNECTED' : 'DISCONNECTED'}
        </span>
        {isDbConnected && health?.database?.latencyMs !== undefined && (
          <span className="text-slate-500 font-mono">({health.database.latencyMs}ms)</span>
        )}
      </div>

      <div className="h-3 w-px bg-slate-700" />

      {/* Refresh trigger */}
      <button
        onClick={checkHealth}
        disabled={loading}
        title={`Last checked: ${lastChecked || 'Never'}. Click to refresh status.`}
        className="text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50 p-0.5 rounded focus:outline-none"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
      </button>
    </div>
  );
};

export default ConnectionBadge;
