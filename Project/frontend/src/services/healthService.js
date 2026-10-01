import api from './api';

export const healthService = {
  async getHealth() {
    return api.get('/health');
  },

  async getOverview() {
    return api.get('/overview');
  }
};

export default healthService;
