import React, { useState, useEffect, useCallback } from 'react';
import userService from '../services/userService';
import {
  UserCheck,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  RefreshCw,
  Mail,
  Shield,
  Check,
  X
} from 'lucide-react';

export const AdminApprovalsPage = () => {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState({ type: null, text: null });
  const [processingId, setProcessingId] = useState(null);

  const fetchPendingUsers = useCallback(async () => {
    setIsLoading(true);
    setFeedback({ type: null, text: null });
    try {
      const data = await userService.getUsers({ status: 'PENDING', limit: 50 });
      setPendingUsers(data.users || []);
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Failed to fetch pending requests' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPendingUsers();
  }, [fetchPendingUsers]);

  const handleApprove = async (user) => {
    if (!window.confirm(`Approve operational access for ${user.name} (${user.email})?`)) return;
    setProcessingId(user.id);
    try {
      await userService.approveUser(user.id);
      setFeedback({ type: 'success', text: `Account for ${user.email} successfully approved and activated.` });
      fetchPendingUsers();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Failed to approve account' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (user) => {
    if (!window.confirm(`Reject registration request for ${user.name} (${user.email})?`)) return;
    setProcessingId(user.id);
    try {
      await userService.rejectUser(user.id);
      setFeedback({ type: 'success', text: `Account request for ${user.email} rejected.` });
      fetchPendingUsers();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Failed to reject account' });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-blue-400" />
            Account Approvals Queue
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Review federated Google registrations and requested accounts awaiting operational access.
          </p>
        </div>

        <button
          onClick={fetchPendingUsers}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Queue
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback.text && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback({ type: null, text: null })}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pending List */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-500 bg-[#0F172A] border border-slate-800 rounded-2xl">
          <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs">Loading pending accounts...</p>
        </div>
      ) : pendingUsers.length === 0 ? (
        <div className="p-12 text-center bg-[#0F172A] border border-slate-800 rounded-2xl space-y-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h2 className="text-sm font-bold text-white">Approvals Queue is Clear</h2>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            All registered users have been reviewed. There are no accounts currently pending administrator authorization.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pendingUsers.map((u) => (
            <div
              key={u.id}
              className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-4 hover:border-slate-700 transition-all shadow-lg"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center font-bold text-sm">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-sm">{u.name}</h3>
                    <p className="text-xs text-slate-400 font-mono">{u.email}</p>
                  </div>
                </div>

                <span className="px-2 py-0.5 rounded-full bg-amber-950/60 border border-amber-700/60 text-amber-300 font-mono text-[11px] font-semibold">
                  PENDING
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Proposed Role:</span>
                  <span className="text-blue-400 font-semibold">{u.role}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Auth Method:</span>
                  <span className="text-slate-300">
                    {u.linked_providers?.length > 0
                      ? u.linked_providers.map((p) => p.provider).join(', ')
                      : 'Local Email/Password'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Submitted:</span>
                  <span className="text-slate-400">{new Date(u.created_at).toLocaleString()}</span>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  disabled={processingId === u.id}
                  onClick={() => handleApprove(u)}
                  className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Approve & Activate</span>
                </button>

                <button
                  disabled={processingId === u.id}
                  onClick={() => handleReject(u)}
                  className="py-2 px-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 text-xs font-medium transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Reject</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminApprovalsPage;
