import axios from 'axios';
import { getStoredCredentials, clearStoredCredentials } from '../auth/AuthProvider';

// Same-origin — CloudFront routes /api/* to the ALB, so a relative baseURL
// keeps the browser sending requests to sutton5050.com (no CORS).
const apiClient = axios.create({
  baseURL: '/api',
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
