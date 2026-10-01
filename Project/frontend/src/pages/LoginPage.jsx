import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GoogleSignInButton from '../components/GoogleSignInButton';
import {
  Radio,
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  Clock,
  ShieldCheck,
  ChevronRight,
  Info
} from 'lucide-react';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [infoMessage, setInfoMessage] = useState(null);

  const { login, loginWithGoogle, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  // If already authenticated, redirect
  React.useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const handleLocalSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    if (!email || !password) {
      setErrorMessage('Please provide both email address and password');
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await login(email, password);
      if (data.user?.must_change_password) {
        navigate('/change-password', { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      if (err.code === 'ACCOUNT_PENDING_APPROVAL') {
        setInfoMessage('Your EMS account has been registered and is pending administrator authorization. Once approved, you will be granted operational access.');
      } else if (err.code === 'ACCOUNT_INACTIVE') {
        setErrorMessage('Your account is currently deactivated or suspended. Please contact an EMS administrator.');
      } else {
        setErrorMessage(err.message || 'Invalid email or password');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSuccess = async (credential) => {
    setErrorMessage(null);
    setInfoMessage(null);
    setIsSubmitting(true);
    try {
      await loginWithGoogle(credential);
      navigate(from, { replace: true });
    } catch (err) {
      if (err.code === 'ACCOUNT_EXISTS_LINK_REQUIRED') {
        setInfoMessage(
          'An account with this email address already exists. Please sign in below using your password, then link your Google account in Profile Settings.'
        );
      } else if (err.code === 'ACCOUNT_PENDING_APPROVAL') {
        navigate('/pending-approval', { replace: true });
      } else if (err.code === 'SIGNUP_DISABLED') {
        setErrorMessage('Public Google registration is disabled for this EMS system. Please contact an administrator to provision your account.');
      } else {
        setErrorMessage(err.message || 'Google sign-in failed');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleError = (err) => {
    setErrorMessage(err.message || 'Google authentication encountered an error');
  };

  return (
    <div className="min-h-screen bg-[#080C15] flex flex-col justify-center items-center p-4 selection:bg-blue-600 selection:text-white">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 left-1/3 -translate-x-1/2 w-64 h-64 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-rose-600/30 to-blue-600/30 border border-slate-700/60 shadow-xl mb-4">
            <Radio className="w-7 h-7 text-rose-500 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center justify-center gap-2">
            EMS DISPATCH
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/60 text-blue-300 font-mono border border-blue-700/50">
              OPERATIONS
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-mono tracking-wider">
            SECURE COMMAND CENTER AUTHENTICATION
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#0F172A]/90 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* Info / Notice Banner */}
          {infoMessage && (
            <div className="p-3.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs flex items-start gap-2.5 animate-fadeIn">
              <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{infoMessage}</div>
            </div>
          )}

          {/* Google Sign-In Button */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider text-center">
              Fast Federated Access
            </label>
            <GoogleSignInButton
              onCredentialSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
              text="continue_with"
              disabled={isSubmitting}
            />
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="border-t border-slate-800 w-full" />
            <span className="bg-[#0F172A] px-3 text-[11px] font-mono text-slate-500 uppercase tracking-wider">
              Or Local Credentials
            </span>
            <div className="border-t border-slate-800 w-full" />
          </div>

          {/* Email / Password Form */}
          <form onSubmit={handleLocalSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Staff Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@ems-dispatch.local"
                  required
                  disabled={isSubmitting}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-sans"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Access Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  disabled={isSubmitting}
                  className="w-full pl-10 pr-11 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-sans"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-sm transition-all shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group mt-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Command Center</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Footer note */}
          <div className="pt-2 text-center border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>256-bit Encrypted Session · SQL Server RBAC Guarded</span>
          </div>
        </div>

        {/* Demo instructions hint */}
        <div className="mt-6 text-center text-xs text-slate-500 space-y-1">
          <p>EMS Staff: Contact dispatch administrator for account provisioning.</p>
          <p className="text-[11px] font-mono text-slate-600">
            Initial Admin: <span className="text-slate-400">admin@ems-dispatch.local</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
