import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Clock, RefreshCw, LogOut, ShieldAlert, CheckCircle2 } from 'lucide-react';

export const PendingApprovalPage = () => {
  const { user, refreshUser, logout } = useAuth();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState(null);
  const navigate = useNavigate();

  const handleCheckStatus = async () => {
    setChecking(true);
    setMessage(null);
    try {
      const refreshed = await refreshUser();
      if (refreshed?.status === 'ACTIVE') {
        navigate('/', { replace: true });
      } else {
        setMessage('Your account is still awaiting administrator review.');
      }
    } catch (err) {
      setMessage('Failed to check status. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#080C15] flex flex-col justify-center items-center p-4">
      <div className="relative w-full max-w-lg bg-[#0F172A] border border-amber-500/30 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto animate-pulse">
          <Clock className="w-8 h-8" />
        </div>

        <div>
          <h1 className="text-xl font-bold text-white mb-2">Account Pending Administrator Approval</h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Your identity has been verified, but operational access to the Dynamic Ambulance Dispatch system requires authorization from an EMS platform administrator.
          </p>
        </div>

        {user && (
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-left text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Registered Email:</span>
              <span className="font-mono text-slate-200">{user.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Assigned Role:</span>
              <span className="font-mono text-blue-400">{user.role}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Approval Status:</span>
              <span className="font-mono text-amber-400 font-semibold uppercase">{user.status}</span>
            </div>
          </div>
        )}

        {message && (
          <div className="p-3 rounded-xl bg-slate-800 text-xs text-slate-300 font-mono">
            {message}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={handleCheckStatus}
            disabled={checking}
            className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
          >
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            <span>Check Approval Status</span>
          </button>

          <button
            onClick={handleLogout}
            className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-sm transition-all flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PendingApprovalPage;
