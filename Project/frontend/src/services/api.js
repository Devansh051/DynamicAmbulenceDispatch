import axios from 'axios';

let authToken = localStorage.getItem('ems_auth_token') || null;

export const setAuthToken = (token) => {
  authToken = token;
  if (token) {
    localStorage.setItem('ems_auth_token', token);
  } else {
    localStorage.removeItem('ems_auth_token');
  }
};

export const getAuthToken = () => authToken;

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1',
  timeout: 10000,
  withCredentials: true, // Enables sending and receiving HttpOnly cookies
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  }
});

// Request interceptor to attach Bearer token if present
api.interceptors.request.use(
  (config) => {
    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for consistent data extraction
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const errorData = error.response?.data?.error;
    const customError = {
      message: errorData?.message || error.response?.data?.message || error.message || 'Network communication error',
      code: errorData?.code || error.response?.data?.code || 'NETWORK_ERROR',
      status: error.response?.status,
      timestamp: error.response?.data?.timestamp || new Date().toISOString()
    };

    // If 401 unauthenticated, clear local token
    if (error.response?.status === 401) {
      setAuthToken(null);
    }

    return Promise.reject(customError);
  }
);

export default api;
