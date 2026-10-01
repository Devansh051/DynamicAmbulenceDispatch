import React, { useEffect, useRef, useState } from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';

export const GoogleSignInButton = ({ onCredentialSuccess, onError, text = 'continue_with', disabled = false }) => {
  const buttonRef = useRef(null);
  const [gisLoaded, setGisLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  useEffect(() => {
    let checkInterval = null;
    let attempts = 0;

    const checkGisAvailable = () => {
      attempts++;
      if (window.google?.accounts?.id) {
        setGisLoaded(true);
        clearInterval(checkInterval);
      } else if (attempts > 30) {
        clearInterval(checkInterval);
        setLoadError('Google Identity Services SDK could not be loaded. Please check your network connection.');
      }
    };

    if (window.google?.accounts?.id) {
      setGisLoaded(true);
    } else {
      checkInterval = setInterval(checkGisAvailable, 200);
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
    };
  }, []);

  useEffect(() => {
    if (!gisLoaded || !buttonRef.current || !clientId) return;

    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response?.credential) {
            onCredentialSuccess(response.credential);
          } else {
            if (onError) onError(new Error('No Google credential returned'));
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true
      });

      // Render official Google button
      buttonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        text: text, // 'signin_with', 'signup_with', 'continue_with'
        shape: 'rectangular',
        logo_alignment: 'left',
        width: 320
      });
    } catch (err) {
      setLoadError(err.message);
      if (onError) onError(err);
    }
  }, [gisLoaded, clientId, onCredentialSuccess, onError, text]);

  if (!clientId) {
    return (
      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs text-center">
        <p className="font-semibold mb-0.5">Google Sign-In Unconfigured</p>
        <p className="text-[11px] text-amber-400/80">
          Set <code className="font-mono bg-black/30 px-1 py-0.5 rounded">VITE_GOOGLE_CLIENT_ID</code> in environment to activate.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>{loadError}</span>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="p-1 rounded bg-rose-600/30 hover:bg-rose-600/50 text-white"
          title="Reload"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className={`flex justify-center w-full min-h-[44px] ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div ref={buttonRef} className="w-full flex justify-center">
        {!gisLoaded && (
          <div className="h-10 w-full max-w-xs bg-slate-800 animate-pulse rounded-lg flex items-center justify-center text-xs text-slate-500">
            Initializing Google Sign-In...
          </div>
        )}
      </div>
    </div>
  );
};

export default GoogleSignInButton;
