import api from './api';

export const emergencyService = {
  async getEmergencies({ page = 1, limit = 20, search = '', status = '', emergency_type = '', severity = '' } = {}) {
    const params = { page, limit };
    if (search) params.search = search;
    if (status) params.status = status;
    if (emergency_type) params.emergency_type = emergency_type;
    if (severity) params.severity = severity;

    const res = await api.get('/emergencies', { params });
    return {
      emergencies: res.data || [],
      pagination: res.meta || { total: res.data?.length || 0, page, limit, totalPages: 1 }
    };
  },

  async getEmergency(id) {
    const res = await api.get(`/emergencies/${id}`);
    return res.data;
  },

  async createEmergency(data) {
    const res = await api.post('/emergencies', data);
    return res.data;
  },

  async updateEmergency(id, data) {
    const res = await api.patch(`/emergencies/${id}`, data);
    return res.data;
  },

  async updateStatus(id, { status, resolution_notes }) {
    const res = await api.patch(`/emergencies/${id}/status`, {
      status,
      resolution_notes
    });
    return res.data;
  },

  async getRecommendations(id) {
    const res = await api.get(`/emergencies/${id}/recommendations`);
    return res.data;
  },

  async generateRecommendations(id) {
    const res = await api.post(`/emergencies/${id}/recommendations`);
    return res.data;
  },

  async recalculateRecommendations(id) {
    const res = await api.post(`/emergencies/${id}/recalculate`);
    return res.data;
  },

  async getEligibleAmbulances(id) {
    const res = await api.get(`/emergencies/${id}/eligible-ambulances`);
    return res.data;
  },

  async assignAmbulance(id, { ambulance_id, hospital_id, recommendation_id, override_reason, idempotency_key }) {
    const headers = {};
    if (idempotency_key) {
      headers['Idempotency-Key'] = idempotency_key;
    }
    const res = await api.post(`/emergencies/${id}/assign`, {
      ambulance_id,
      hospital_id,
      recommendation_id,
      override_reason,
      idempotency_key
    }, { headers });
    return res.data;
  },

  async reassignAmbulance(id, { new_ambulance_id, reason, notes, idempotency_key }) {
    const headers = {};
    if (idempotency_key) {
      headers['Idempotency-Key'] = idempotency_key;
    }
    const res = await api.post(`/emergencies/${id}/reassign`, {
      new_ambulance_id,
      reason,
      notes,
      idempotency_key
    }, { headers });
    return res.data;
  },

  async escalateEmergency(id, { reason, notes }) {
    const res = await api.post(`/emergencies/${id}/escalate`, {
      reason,
      notes
    });
    return res.data;
  },

  async getHistory(id, { page = 1, limit = 50 } = {}) {
    const res = await api.get(`/emergencies/${id}/history`, {
      params: { page, limit }
    });
    return {
      events: res.data || [],
      pagination: res.meta || { total: res.data?.length || 0, page, limit, totalPages: 1 }
    };
  },

  async getHospitals(id) {
    const res = await api.get(`/emergencies/${id}/hospitals`);
    return res.data;
  },

  async updateLifecycleStatus(id, { status, notes, resolution_notes, cancellation_reason, hospital_id, idempotency_key }) {
    const headers = {};
    if (idempotency_key) {
      headers['Idempotency-Key'] = idempotency_key;
    }
    const res = await api.patch(`/emergencies/${id}/status`, {
      status,
      notes: notes || resolution_notes || cancellation_reason,
      resolution_notes,
      cancellation_reason,
      hospital_id
    }, { headers });
    return res.data;
  },

  async getActiveAssignments() {
    const res = await api.get('/dispatch/active-assignments');
    return res.data;
  },

  async getDispatchConfig() {
    const res = await api.get('/dispatch/config');
    return res.data;
  },

  async requestOtp(id) {
    const res = await api.post(`/emergencies/${id}/otp`);
    return res.data;
  },

  async dispatchAmbulance(id, { ambulance_id, hospital_id, otp }) {
    const res = await api.post(`/emergencies/${id}/dispatch`, {
      ambulance_id,
      hospital_id,
      otp
    });
    return res.data;
  }
};

export default emergencyService;

