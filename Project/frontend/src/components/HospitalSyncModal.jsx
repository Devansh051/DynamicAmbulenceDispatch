import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Database,
  ArrowRight,
  ShieldAlert,
  X,
  Calendar,
  Layers,
  Sparkles,
  Info
} from 'lucide-react';
import hospitalService from '../services/hospitalService';

export const HospitalSyncModal = ({ isOpen, onClose, onSyncComplete }) => {
  const [statusData, setStatusData] = useState(null);
  const [history, setHistory] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 5, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const fetchStatusAndHistory = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const [statusRes, histRes] = await Promise.all([
        hospitalService.getSyncStatus(),
        hospitalService.getSyncHistory({ page, limit: 5 })
      ]);
      setStatusData(statusRes);
      setHistory(histRes.history || []);
      setPagination(histRes.pagination || { page: 1, limit: 5, total: 0, totalPages: 1 });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to fetch synchronization telemetry.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchStatusAndHistory(1);
      setFeedback(null);
    }
  }, [isOpen, fetchStatusAndHistory]);

  const handleManualSync = async () => {
    if (syncing || statusData?.is_running) return;
    setSyncing(true);
    setFeedback({ type: 'info', message: 'Synchronization triggered. Processing batches from data.gov.in...' });

    try {
      const res = await hospitalService.triggerSync();
      setFeedback({
        type: 'success',
        message: `Sync finished: ${res.syncJob?.records_inserted || 0} inserted, ${res.syncJob?.records_updated || 0} updated.`
      });
      await fetchStatusAndHistory(1);
      if (onSyncComplete) onSyncComplete();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Synchronization encountered a transient failure.'
      });
    } finally {
      setSyncing(false);
    }
  };

  if (!isOpen) return null;

  const lastSync = statusData?.last_sync;
  const lastSuccess = statusData?.last_successful_sync;
  const nextScheduled = statusData?.next_scheduled_sync ? new Date(statusData.next_scheduled_sync) : null;
  const isRunning = statusData?.is_running || syncing;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-800/80 flex items-center justify-between bg-gradient-to-r from-slate-900 to-[#0F172A]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-inner">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Government Directory Synchronization
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  data.gov.in NIN API
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Automated 72-hour batch ingestion, deduplication, and local spatial registry updates
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Feedback Banner */}
          {feedback && (
            <div
              className={`p-3.5 rounded-xl border flex items-center gap-3 animate-fade-in ${
                feedback.type === 'error'
                  ? 'bg-red-500/10 border-red-500/30 text-red-300'
                  : feedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
              }`}
            >
              {feedback.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              ) : feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <Info className="w-4 h-4 shrink-0 text-blue-400" />
              )}
              <div className="flex-1 text-xs">{feedback.message}</div>
              <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Sync Status Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Status Card */}
            <div className="bg-[#131B2E] border border-slate-800 rounded-xl p-4">
              <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
                <span>Scheduler Status</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    isRunning ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'
                  }`}
                />
              </div>
              <div className="mt-2 text-base font-bold text-white flex items-center gap-2">
                {isRunning ? (
                  <span className="text-amber-400 flex items-center gap-1.5">
                    <RefreshCw className="w-4 h-4 animate-spin" /> In Progress
                  </span>
                ) : (
                  <span className="text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Ready (Active)
                  </span>
                )}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                Interval: every {statusData?.sync_interval_days || 3} days (72h)
              </div>
            </div>

            {/* Last Sync Card */}
            <div className="bg-[#131B2E] border border-slate-800 rounded-xl p-4">
              <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
                <span>Last Synchronized</span>
                <Clock className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="mt-2 text-sm font-bold text-white">
                {lastSuccess?.completed_at ? (
                  new Date(lastSuccess.completed_at).toLocaleString()
                ) : lastSync?.started_at ? (
                  new Date(lastSync.started_at).toLocaleString()
                ) : (
                  <span className="text-slate-400">No prior sync record</span>
                )}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                Duration: {lastSuccess?.duration_ms ? `${(lastSuccess.duration_ms / 1000).toFixed(1)}s` : 'N/A'}
              </div>
            </div>

            {/* Next Scheduled Card */}
            <div className="bg-[#131B2E] border border-slate-800 rounded-xl p-4">
              <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
                <span>Next Scheduled Cycle</span>
                <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="mt-2 text-sm font-bold text-emerald-400">
                {nextScheduled ? nextScheduled.toLocaleString() : 'Immediate / Pending'}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                Runs automatically in background
              </div>
            </div>
          </div>

          {/* Telemetry Numbers from Last Sync */}
          {lastSuccess && (
            <div className="bg-[#131B2E] border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-white mb-3 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Latest Ingestion Telemetry (Job #{lastSuccess.sync_id})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                  <div className="text-xs text-slate-400">Total Fetched</div>
                  <div className="text-base font-bold text-white mt-0.5">{lastSuccess.total_fetched || 0}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                  <div className="text-xs text-emerald-400">Inserted</div>
                  <div className="text-base font-bold text-emerald-400 mt-0.5">{lastSuccess.records_inserted || 0}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                  <div className="text-xs text-blue-400">Updated</div>
                  <div className="text-base font-bold text-blue-400 mt-0.5">{lastSuccess.records_updated || 0}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                  <div className="text-xs text-amber-400">Skipped</div>
                  <div className="text-base font-bold text-amber-400 mt-0.5">{lastSuccess.records_skipped || 0}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                  <div className="text-xs text-red-400">Failed</div>
                  <div className="text-base font-bold text-red-400 mt-0.5">{lastSuccess.records_failed || 0}</div>
                </div>
              </div>
            </div>
          )}

          {/* Action Area */}
          <div className="bg-gradient-to-r from-emerald-950/20 via-slate-900/60 to-blue-950/20 border border-emerald-500/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-xs font-semibold text-white">Manual Administrative Synchronization</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Forces immediate query of the data.gov.in NIN Health Facilities dataset with conservative deduplication.
              </p>
            </div>
            <button
              onClick={handleManualSync}
              disabled={isRunning}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold transition-all shadow-lg shadow-emerald-900/20 shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
              <span>{isRunning ? 'Synchronizing...' : 'Trigger Sync Now'}</span>
            </button>
          </div>

          {/* Audit History Log */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-white flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Synchronization History Audit
              </h3>
              <button
                onClick={() => fetchStatusAndHistory(pagination.page)}
                disabled={loading}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>

            {history.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-800 rounded-xl text-slate-400">
                No synchronization runs recorded yet. Click "Trigger Sync Now" to initiate the first run.
              </div>
            ) : (
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900/80 border-b border-slate-800 text-[10px] text-slate-400 uppercase tracking-wider">
                        <th className="py-2.5 px-3">Sync ID</th>
                        <th className="py-2.5 px-3">Trigger</th>
                        <th className="py-2.5 px-3">Started</th>
                        <th className="py-2.5 px-3">Duration</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Inserted / Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-[11px]">
                      {history.map((item) => {
                        let statusBadge = (
                          <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full text-[10px] font-medium">
                            <CheckCircle2 className="w-3 h-3" /> Completed
                          </span>
                        );
                        if (item.status === 'RUNNING') {
                          statusBadge = (
                            <span className="inline-flex items-center gap-1 text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full text-[10px] font-medium">
                              <RefreshCw className="w-3 h-3 animate-spin" /> Running
                            </span>
                          );
                        } else if (item.status === 'FAILED') {
                          statusBadge = (
                            <span className="inline-flex items-center gap-1 text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full text-[10px] font-medium">
                              <XCircle className="w-3 h-3" /> Failed
                            </span>
                          );
                        } else if (item.status === 'PARTIALLY_COMPLETED') {
                          statusBadge = (
                            <span className="inline-flex items-center gap-1 text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full text-[10px] font-medium">
                              <CheckCircle2 className="w-3 h-3" /> Partial
                            </span>
                          );
                        }

                        return (
                          <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-2.5 px-3 font-mono text-[10px] text-slate-300">
                              {item.sync_id?.slice(0, 18)}...
                            </td>
                            <td className="py-2.5 px-3 text-slate-400 font-medium">
                              {item.trigger_type || 'SCHEDULED'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-300">
                              {item.started_at ? new Date(item.started_at).toLocaleTimeString() : 'N/A'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-400">
                              {item.duration_ms ? `${(item.duration_ms / 1000).toFixed(1)}s` : '-'}
                            </td>
                            <td className="py-2.5 px-3">{statusBadge}</td>
                            <td className="py-2.5 px-3 text-right font-medium text-white">
                              +{item.records_inserted || 0} / ~{item.records_updated || 0}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* History Pagination */}
                {pagination.totalPages > 1 && (
                  <div className="p-3 bg-slate-900/50 border-t border-slate-800 flex items-center justify-between text-slate-400 text-[11px]">
                    <div>Page {pagination.page} of {pagination.totalPages}</div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => fetchStatusAndHistory(pagination.page - 1)}
                        disabled={pagination.page <= 1}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white"
                      >
                        Prev
                      </button>
                      <button
                        onClick={() => fetchStatusAndHistory(pagination.page + 1)}
                        disabled={pagination.page >= pagination.totalPages}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/60 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
            <span>Admin-authenticated operation. All sync cycles logged to audit ledger.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default HospitalSyncModal;
