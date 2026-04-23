import axios from 'axios';
import { getStoredCredentials, clearStoredCredentials } from '../auth/AuthProvider';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const creds = getStoredCredentials();
  if (creds) {
    config.headers.Authorization = `Basic ${creds}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearStoredCredentials();
      window.location.href = '/';
    }
    return Promise.reject(error);
  },
);

export default apiClient;
