import api from './api';

export const hospitalService = {
  async getHospitals({ page = 1, limit = 20, search = '', facility_type = '', ownership = '', is_active = '', city = '' } = {}) {
    const params = { page, limit };
    if (search) params.search = search;
    if (facility_type) params.facility_type = facility_type;
    if (ownership) params.ownership = ownership;
    if (is_active !== '') params.is_active = is_active;
    if (city) params.city = city;

    const res = await api.get('/hospitals', { params });
    return {
      hospitals: res.data || [],
      pagination: res.meta || { total: res.data?.length || 0, page, limit, totalPages: 1 }
    };
  },

  async getHospital(id) {
    const res = await api.get(`/hospitals/${id}`);
    return res.data;
  },

  async createHospital(data) {
    const res = await api.post('/hospitals', data);
    return res.data;
  },

  async updateHospital(id, data) {
    const res = await api.patch(`/hospitals/${id}`, data);
    return res.data;
  },

  async updateStatus(id, isActive) {
    const res = await api.patch(`/hospitals/${id}/status`, { is_active: isActive });
    return res.data;
  },

  // Phase 4: Dynamic nearby hospital discovery
  async getNearbyHospitals({ lat, latitude, lng, longitude, radius, ambulance_id } = {}) {
    const params = {};
    const resolvedLat = lat ?? latitude;
    const resolvedLng = lng ?? longitude;
    if (resolvedLat !== undefined && resolvedLat !== '') params.lat = resolvedLat;
    if (resolvedLng !== undefined && resolvedLng !== '') params.lng = resolvedLng;
    if (radius !== undefined && radius !== '') params.radius = radius;
    if (ambulance_id) params.ambulance_id = ambulance_id;

    const res = await api.get('/hospitals/nearby', { params });
    return res.data;
  },

  // Phase 4: Government Directory 3-day sync admin controls
  async triggerSync() {
    const res = await api.post('/admin/hospitals/sync');
    return res.data;
  },

  async getSyncStatus() {
    const res = await api.get('/admin/hospitals/sync/status');
    return res.data;
  },

  async getSyncHistory({ page = 1, limit = 10 } = {}) {
    const res = await api.get('/admin/hospitals/sync/history', { params: { page, limit } });
    return {
      history: res.data || [],
      pagination: res.meta || { total: res.data?.length || 0, page, limit, totalPages: 1 }
    };
  }
};

export default hospitalService;
