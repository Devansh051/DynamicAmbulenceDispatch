import api from './api';

export const healthService = {
  async getHealth() {
    return api.get('/health');
  },

  async getDetailedHealth() {
    return api.get('/health/details');
  },

  async getOverview() {
    return api.get('/overview');
  }
};

export default healthService;
