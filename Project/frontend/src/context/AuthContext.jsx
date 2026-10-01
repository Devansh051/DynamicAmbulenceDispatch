import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import authService from '../services/authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  /**
   * Refreshes the current authenticated user profile
   */
  const refreshUser = useCallback(async () => {
    try {
      const userData = await authService.getMe();
      setUser(userData);
      setAuthError(null);
      return userData;
    } catch (err) {
      setUser(null);
      return null;
    }
  }, []);

  // Initial session restoration on mount
  useEffect(() => {
    let isMounted = true;
    async function restoreSession() {
      try {
        const userData = await authService.getMe();
        if (isMounted) {
          setUser(userData);
        }
      } catch (err) {
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    restoreSession();
    return () => {
      isMounted = false;
    };
  }, []);

  /**
   * Local login with email & password
   */
  const login = async (email, password) => {
    setAuthError(null);
    try {
      const data = await authService.login({ email, password });
      setUser(data.user);
      return data;
    } catch (err) {
      setAuthError(err.message || 'Login failed');
      throw err;
    }
  };

  /**
   * Google Sign-In with GIS ID token
   */
  const loginWithGoogle = async (credential) => {
    setAuthError(null);
    try {
      const data = await authService.googleLogin(credential);
      setUser(data.user);
      return data;
    } catch (err) {
      setAuthError(err.message || 'Google authentication failed');
      throw err;
    }
  };

  /**
   * Logout and clear local session
   */
  const logout = async () => {
    try {
      await authService.logout();
    } catch (err) {
      // Continue cleanup regardless of network error
    } finally {
      setUser(null);
      setAuthError(null);
    }
  };

  /**
   * Change local account password
   */
  const changePassword = async (currentPassword, newPassword) => {
    try {
      const updated = await authService.changePassword({ currentPassword, newPassword });
      setUser(updated);
      return updated;
    } catch (err) {
      throw err;
    }
  };

  /**
   * Link Google identity
   */
  const linkGoogle = async (credential) => {
    try {
      const updated = await authService.linkGoogle(credential);
      setUser(updated);
      return updated;
    } catch (err) {
      throw err;
    }
  };

  /**
   * Unlink Google identity
   */
  const unlinkGoogle = async () => {
    try {
      const updated = await authService.unlinkGoogle();
      setUser(updated);
      return updated;
    } catch (err) {
      throw err;
    }
  };

  const value = {
    user,
    role: user?.role || null,
    status: user?.status || null,
    isAuthenticated: Boolean(user && user.status === 'ACTIVE'),
    isPending: Boolean(user && user.status === 'PENDING'),
    mustChangePassword: Boolean(user && user.must_change_password),
    isAdmin: user?.role === 'ADMIN',
    isDispatcher: user?.role === 'DISPATCHER',
    isCrew: user?.role === 'AMBULANCE_CREW',
    isHospital: user?.role === 'HOSPITAL_OPERATOR',
    isLoading,
    authError,
    login,
    loginWithGoogle,
    logout,
    changePassword,
    linkGoogle,
    unlinkGoogle,
    refreshUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
