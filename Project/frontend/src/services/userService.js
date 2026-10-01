import api from './api';

export const userService = {
  /**
   * List users with pagination and search
   */
  async getUsers({ page = 1, limit = 20, search = '', role = '', status = '' } = {}) {
    const params = { page, limit };
    if (search) params.search = search;
    if (role) params.role = role;
    if (status) params.status = status;

    const res = await api.get('/users', { params });
    return {
      users: res.data,
      pagination: res.meta?.pagination || { total: res.data.length, page, limit, totalPages: 1 }
    };
  },

  /**
   * Get specific user profile
   */
  async getUser(id) {
    const res = await api.get(`/users/${id}`);
    return res.data;
  },

  /**
   * Provision a new user account (Admin only)
   */
  async provisionUser({ email, name, role, temporaryPassword }) {
    const res = await api.post('/users', { email, name, role, temporaryPassword });
    return res.data;
  },

  /**
   * Update user details
   */
  async updateUser(id, data) {
    const res = await api.patch(`/users/${id}`, data);
    return res.data;
  },

  /**
   * Update user status (ACTIVE, INACTIVE, SUSPENDED)
   */
  async updateStatus(id, status) {
    const res = await api.patch(`/users/${id}/status`, { status });
    return res.data;
  },

  /**
   * Update user role
   */
  async updateRole(id, role) {
    const res = await api.patch(`/users/${id}/role`, { role });
    return res.data;
  },

  /**
   * Approve a pending user account
   */
  async approveUser(id) {
    const res = await api.post(`/users/${id}/approve`);
    return res.data;
  },

  /**
   * Reject a pending user account
   */
  async rejectUser(id) {
    const res = await api.post(`/users/${id}/reject`);
    return res.data;
  }
};

export default userService;
