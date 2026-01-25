import axios from 'axios';
import { authService } from '../services/auth';

// Get API URL from environment or use defaults
const API_BASE_URL = 
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (__DEV__ ? 'http://localhost:3000' : 'https://api.hamzaammar.ca');

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
apiClient.interceptors.request.use(async (config) => {
  const token = await authService.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid, logout user
      await authService.logout();
    }
    return Promise.reject(error);
  }
);

export default apiClient;
