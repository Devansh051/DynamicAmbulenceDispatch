import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Radio } from 'lucide-react';

export const ProtectedRoute = ({ children }) => {
  const { user, isAuthenticated, isLoading, isPending, mustChangePassword } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0B0F19] flex flex-col items-center justify-center text-slate-300">
        <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center mb-4 animate-pulse">
          <Radio className="w-6 h-6 text-blue-400 animate-spin" />
        </div>
        <p className="text-sm font-mono text-slate-400 tracking-wider">CONNECTING TO EMS COMMAND CENTER...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isPending) {
    return <Navigate to="/pending-approval" replace />;
  }

  if (mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;
