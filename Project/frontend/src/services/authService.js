import api, { setAuthToken } from './api';

export const authService = {
  /**
   * Email and password login
   */
  async login({ email, password }) {
    const res = await api.post('/auth/login', { email, password });
    if (res.data?.token) {
      setAuthToken(res.data.token);
    }
    return res.data;
  },

  /**
   * Google Sign-In with GIS credential ID token
   */
  async googleLogin(credential) {
    const res = await api.post('/auth/google', { credential });
    if (res.data?.token) {
      setAuthToken(res.data.token);
    }
    return res.data;
  },

  /**
   * Invalidate session and logout
   */
  async logout() {
    try {
      await api.post('/auth/logout');
    } finally {
      setAuthToken(null);
    }
  },

  /**
   * Get current authenticated user profile
   */
  async getMe() {
    const res = await api.get('/auth/me');
    return res.data;
  },

  /**
   * Change local account password
   */
  async changePassword({ currentPassword, newPassword }) {
    const res = await api.post('/auth/change-password', { currentPassword, newPassword });
    return res.data;
  },

  /**
   * Link Google identity to authenticated account
   */
  async linkGoogle(credential) {
    const res = await api.post('/auth/google/link', { credential });
    return res.data;
  },

  /**
   * Unlink Google identity from authenticated account
   */
  async unlinkGoogle() {
    const res = await api.delete('/auth/google/link');
    return res.data;
  }
};

export default authService;
