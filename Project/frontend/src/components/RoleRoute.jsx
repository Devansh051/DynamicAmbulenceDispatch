import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export const RoleRoute = ({ allowedRoles = [], children }) => {
  const { user } = useAuth();

  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <div className="p-8 max-w-xl mx-auto my-12 bg-slate-900/80 border border-rose-500/40 rounded-2xl shadow-2xl text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-500 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Access Restricted</h2>
        <p className="text-sm text-slate-400 mb-4">
          Your current application role (<span className="font-mono text-amber-400 font-semibold">{user?.role || 'GUEST'}</span>) does not have authorization to view this area.
        </p>
        <p className="text-xs text-slate-500 mb-6 font-mono">
          Required roles: {allowedRoles.join(', ')}
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all shadow-lg shadow-blue-600/30"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return children;
};

export default RoleRoute;
