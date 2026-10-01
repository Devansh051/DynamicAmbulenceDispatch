import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import GoogleSignInButton from '../components/GoogleSignInButton';
import {
  User,
  Shield,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Link as LinkIcon,
  Unlink,
  Radio,
  Lock,
  Mail,
  ShieldAlert
} from 'lucide-react';

export const ProfilePage = () => {
  const { user, linkGoogle, unlinkGoogle, changePassword } = useAuth();

  const [linkError, setLinkError] = useState(null);
  const [linkSuccess, setLinkSuccess] = useState(null);

  // Change password modal / state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState(null);
  const [passwordSuccess, setPasswordSuccess] = useState(null);
  const [isChangingPass, setIsChangingPass] = useState(false);

  const googleIdentity = user?.linked_providers?.find(p => p.provider === 'google');
  const hasLocalPassword = Boolean(user?.has_local_password);

  const handleLinkGoogle = async (credential) => {
    setLinkError(null);
    setLinkSuccess(null);
    try {
      await linkGoogle(credential);
      setLinkSuccess('Google identity linked successfully!');
    } catch (err) {
      setLinkError(err.message || 'Failed to link Google account');
    }
  };

  const handleUnlinkGoogle = async () => {
    if (!window.confirm('Are you sure you want to unlink your Google account?')) return;
    setLinkError(null);
    setLinkSuccess(null);
    try {
      await unlinkGoogle();
      setLinkSuccess('Google account unlinked successfully.');
    } catch (err) {
      setLinkError(err.message || 'Failed to unlink Google account');
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setIsChangingPass(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordSuccess('Password successfully updated!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err.message || 'Failed to update password');
    } finally {
      setIsChangingPass(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <User className="w-5 h-5 text-blue-400" />
          Operator Profile & Security Settings
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Manage your EMS identity, federated credentials, and authentication methods.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* User Identity Overview */}
        <div className="md:col-span-1 bg-[#0F172A] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-2xl mx-auto shadow-lg shadow-blue-600/20">
            {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>

          <div className="text-center">
            <h2 className="text-base font-bold text-white">{user?.name}</h2>
            <p className="text-xs text-slate-400 font-mono">{user?.email}</p>
          </div>

          <div className="pt-4 border-t border-slate-800 space-y-2.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Application Role:</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-900/60 text-blue-300 font-mono text-[11px] font-semibold border border-blue-700/50">
                {user?.role}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">Account Status:</span>
              <span className={`px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold border ${
                user?.status === 'ACTIVE'
                  ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50'
                  : 'bg-amber-900/40 text-amber-300 border-amber-700/50'
              }`}>
                {user?.status}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">Email Verified:</span>
              <span className="font-mono text-emerald-400 font-medium">
                {user?.email_verified ? 'YES' : 'NO'}
              </span>
            </div>
          </div>
        </div>

        {/* Federated & Local Authentication Methods */}
        <div className="md:col-span-2 space-y-6">
          {/* Google Account Linking Card */}
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-rose-400" />
                  Google Federated Identity
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Link your verified Google credential for one-click access.
                </p>
              </div>

              {googleIdentity ? (
                <span className="px-2.5 py-1 rounded-full bg-emerald-900/40 border border-emerald-700/50 text-emerald-300 text-xs font-mono flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  LINKED
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-xs font-mono">
                  NOT LINKED
                </span>
              )}
            </div>

            {linkError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{linkError}</span>
              </div>
            )}

            {linkSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{linkSuccess}</span>
              </div>
            )}

            {googleIdentity ? (
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-white">Google Identity Connected</p>
                  <p className="text-xs text-slate-400 font-mono">{googleIdentity.provider_email}</p>
                </div>
                <button
                  onClick={handleUnlinkGoogle}
                  className="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 text-xs font-medium transition-all flex items-center gap-1.5"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  Unlink
                </button>
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                <p className="text-xs text-slate-400">
                  Authenticate with Google to connect your identity to this profile:
                </p>
                <div className="max-w-xs">
                  <GoogleSignInButton
                    onCredentialSuccess={handleLinkGoogle}
                    onError={(err) => setLinkError(err.message)}
                    text="continue_with"
                  />
                </div>
              </div>
            )}

            {!hasLocalPassword && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span className="text-[11px] leading-relaxed">
                  Notice: Your account is currently authenticated solely via Google. To ensure you can always access your account, we recommend setting a local password below.
                </span>
              </div>
            )}
          </div>

          {/* Local Password Management Card */}
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-blue-400" />
                {hasLocalPassword ? 'Change Local Password' : 'Set Local Password'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {hasLocalPassword
                  ? 'Update your access password for direct email/password login.'
                  : 'Establish a local password so you can sign in directly without Google.'}
              </p>
            </div>

            {passwordError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            {passwordSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3 pt-2">
              {hasLocalPassword && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    required
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    required
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    required
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isChangingPass}
                className="py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-all shadow-md shadow-blue-600/20 disabled:opacity-50"
              >
                {isChangingPass ? 'Saving...' : 'Save Password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
