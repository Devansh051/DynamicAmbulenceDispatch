import api from './api';

export const ambulanceService = {
  async getAmbulances({ page = 1, limit = 20, search = '', status = '', vehicle_type = '', is_active = '', hospital_id = '' } = {}) {
    const params = { page, limit };
    if (search) params.search = search;
    if (status) params.status = status;
    if (vehicle_type) params.vehicle_type = vehicle_type;
    if (is_active !== '') params.is_active = is_active;
    if (hospital_id) params.hospital_id = hospital_id;

    const res = await api.get('/ambulances', { params });
    return {
      ambulances: res.data || [],
      pagination: res.meta || { total: res.data?.length || 0, page, limit, totalPages: 1 }
    };
  },

  async getAmbulance(id) {
    const res = await api.get(`/ambulances/${id}`);
    return res.data;
  },

  async createAmbulance(data) {
    const res = await api.post('/ambulances', data);
    return res.data;
  },

  async updateAmbulance(id, data) {
    const res = await api.patch(`/ambulances/${id}`, data);
    return res.data;
  },

  async updateStatus(id, { status, fuel_level, current_hospital_id, message }) {
    const res = await api.patch(`/ambulances/${id}/status`, {
      status,
      fuel_level,
      current_hospital_id,
      message
    });
    return res.data;
  }
};

export default ambulanceService;
