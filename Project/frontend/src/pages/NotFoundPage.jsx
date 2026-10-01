import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';

export const NotFoundPage = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 mb-4">
      <AlertCircle className="w-8 h-8 text-amber-500" />
    </div>
    <h2 className="text-2xl font-bold text-white mb-2">404 — Tactical Sector Not Found</h2>
    <p className="text-sm text-slate-400 max-w-md mb-6">
      The requested EMS tactical route does not exist or has been relocated.
    </p>
    <Link
      to="/"
      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
    >
      <ArrowLeft className="w-4 h-4" />
      Return to Operations Dashboard
    </Link>
  </div>
);

export default NotFoundPage;
