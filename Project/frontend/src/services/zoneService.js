import api from './api';

export const zoneService = {
  async getZones({ page = 1, limit = 20, search = '', is_active = '' } = {}) {
    const params = { page, limit };
    if (search) params.search = search;
    if (is_active !== '') params.is_active = is_active;

    const res = await api.get('/zones', { params });
    return {
      zones: res.data || [],
      pagination: res.meta || { total: res.data?.length || 0, page, limit, totalPages: 1 }
    };
  },

  async getZone(id) {
    const res = await api.get(`/zones/${id}`);
    return res.data;
  },

  async createZone(data) {
    const res = await api.post('/zones', data);
    return res.data;
  },

  async updateZone(id, data) {
    const res = await api.patch(`/zones/${id}`, data);
    return res.data;
  },

  async updateStatus(id, isActive) {
    const res = await api.patch(`/zones/${id}/status`, { is_active: isActive });
    return res.data;
  }
};

export default zoneService;
