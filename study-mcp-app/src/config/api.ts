import axios from 'axios';
import { authService } from '../services/auth';

// Get API URL from environment or use defaults
// Default to production AWS backend
const API_BASE_URL = 
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.hamzaammar.ca';

// Always log the API URL for debugging
console.log('[API] Base URL:', API_BASE_URL);
console.log('[API] __DEV__:', __DEV__);
console.log('[API] EXPO_PUBLIC_API_BASE_URL:', process.env.EXPO_PUBLIC_API_BASE_URL || 'not set');

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
  console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`, {
    baseURL: config.baseURL,
    hasToken: !!token,
  });
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
