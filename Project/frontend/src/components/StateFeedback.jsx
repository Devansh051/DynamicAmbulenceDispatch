import React from 'react';
import { Loader2, AlertCircle, Inbox, RefreshCw } from 'lucide-react';

export const LoadingState = ({ message = 'Loading emergency dispatch data...' }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
    <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
    <p className="text-slate-300 font-medium text-sm">{message}</p>
    <p className="text-slate-500 text-xs mt-1">Connecting to EMS telemetric data source...</p>
  </div>
);

export const ErrorState = ({
  title = 'System Communication Error',
  message = 'Failed to load data from the dispatch server.',
  onRetry
}) => (
  <div className="bg-rose-950/30 border border-rose-900/50 rounded-xl p-6 text-center max-w-lg mx-auto my-8">
    <div className="w-12 h-12 rounded-full bg-rose-900/40 text-rose-400 flex items-center justify-center mx-auto mb-3">
      <AlertCircle className="w-6 h-6" />
    </div>
    <h3 className="text-rose-200 font-semibold text-base mb-1">{title}</h3>
    <p className="text-rose-300/80 text-sm mb-5">{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-4 py-2 bg-rose-700 hover:bg-rose-600 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
      >
        <RefreshCw className="w-4 h-4" />
        Retry Operation
      </button>
    )}
  </div>
);

export const EmptyState = ({
  icon: Icon = Inbox,
  title = 'No Records Found',
  description = 'There are no active records in this dispatch queue.',
  action
}) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center border border-dashed border-slate-800 rounded-xl bg-slate-900/20">
    <div className="w-12 h-12 rounded-full bg-slate-800/60 text-slate-400 flex items-center justify-center mb-3">
      <Icon className="w-6 h-6" />
    </div>
    <h3 className="text-slate-200 font-semibold text-sm mb-1">{title}</h3>
    <p className="text-slate-400 text-xs max-w-sm mb-4">{description}</p>
    {action}
  </div>
);

export default { LoadingState, ErrorState, EmptyState };
