import { apiClient } from '../config/api';

export interface D2LStatus {
  connected: boolean;
  syncing: boolean;
  lastSync?: string;
}

export class D2LService {
  /**
   * Check if backend is reachable
   */
  private async checkBackendHealth(): Promise<boolean> {
    try {
      const response = await fetch('https://api.hamzaammar.ca/health');
      return response.ok;
    } catch (error) {
      console.error('[D2L] Backend health check failed:', error);
      return false;
    }
  }

  /**
   * Get D2L connection status
   */
  async getStatus(): Promise<D2LStatus> {
    try {
      const response = await apiClient.get<D2LStatus>('/d2l/status');
      return {
        connected: response.data.connected || false,
        syncing: false,
        lastSync: response.data.lastSync || undefined,
      };
    } catch (error: any) {
      console.error('Error getting D2L status:', error);
      // Return default status on error
      return {
        connected: false,
        syncing: false,
      };
    }
  }

  /**
   * Connect to D2L using a token (from WebView login)
   */
  async connectWithToken(credentials: { host: string; token: string }): Promise<void> {
    try {
      if (__DEV__) console.log('[D2L] Storing token...');

      const isHealthy = await this.checkBackendHealth();
      if (!isHealthy) {
        throw new Error('Cannot reach backend server. Please check your internet connection.');
      }

      await apiClient.post('/d2l/token', credentials);
      if (__DEV__) console.log('[D2L] Token stored successfully');
    } catch (error: any) {
      console.error('[D2L] Token storage error:', error);
      if (error.code === 'ECONNREFUSED' || error.message?.includes('Cannot reach backend')) {
        throw error;
      }
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        throw new Error('Connection timeout. Please try again.');
      }
      if (error.response?.status === 400) {
        throw new Error(error.response.data?.error || 'Invalid or expired token');
      }
      const errorMessage = error.response?.data?.error || error.message || 'Failed to store token';
      throw new Error(errorMessage);
    }
  }

  /**
   * Connect to D2L using cookies (from WebView capture)
   */
  async connectWithCookies(payload: { host: string; cookies: string }): Promise<void> {
    try {
      if (__DEV__) console.log('[D2L] Storing cookies...');

      const isHealthy = await this.checkBackendHealth();
      if (!isHealthy) {
        throw new Error('Cannot reach backend server. Please check your internet connection.');
      }

      await apiClient.post('/d2l/connect-cookie', payload);
      if (__DEV__) console.log('[D2L] Cookies stored successfully');
    } catch (error: any) {
      console.error('[D2L] Cookie storage error:', error);
      if (error.code === 'ECONNREFUSED' || error.message?.includes('Cannot reach backend')) {
        throw error;
      }
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        throw new Error('Connection timeout. Please try again.');
      }
      if (error.response?.status === 400) {
        throw new Error(error.response.data?.error || 'Invalid or expired cookies');
      }
      const errorMessage = error.response?.data?.error || error.message || 'Failed to store cookies';
      throw new Error(errorMessage);
    }
  }

  /**
   * Connect to D2L (store credentials) - Legacy method
   */
  async connect(credentials: { host: string; username: string; password: string }): Promise<void> {
    try {
      if (__DEV__) console.log('[D2L] Attempting to connect...');

      // Check if backend is reachable first
      const isHealthy = await this.checkBackendHealth();
      if (!isHealthy) {
        throw new Error('Cannot reach backend server. Please make sure the backend is running on ' +
          (process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.hamzaammar.ca'));
      }

      // Set a longer timeout for authentication (90 seconds - Playwright can take a while)
      await apiClient.post('/d2l/connect', credentials, {
        timeout: 90000, // 90 seconds
      });
      if (__DEV__) console.log('[D2L] Connection successful');
    } catch (error: any) {
      console.error('[D2L] Connection error:', error);
      if (error.code === 'ECONNREFUSED' || error.message?.includes('Cannot reach backend')) {
        throw error; // Re-throw our custom error
      }
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        throw new Error('Connection timeout. The authentication process took too long. Please try again.');
      }
      if (error.response?.status === 404) {
        throw new Error('API endpoint not found. Make sure the backend server is running and the API base URL is correct.');
      }
      if (error.response?.status === 401) {
        throw new Error('Invalid D2L credentials. Please check your username and password.');
      }
      const errorMessage = error.response?.data?.error || error.message || 'Failed to connect to D2L';
      throw new Error(errorMessage);
    }
  }

  /**
   * Sync all D2L data (courses, assignments, content, etc.)
   */
  async syncAll(): Promise<void> {
    try {
      await apiClient.post('/d2l/sync');
    } catch (error: any) {
      console.error('[D2L] Sync error:', error);
      console.error('[D2L] Sync error response:', error.response?.data);
      console.error('[D2L] Sync error status:', error.response?.status);

      // Get detailed error message
      const errorMessage = error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        'Failed to sync D2L data';

      // Include status code and check for specific error types
      if (error.response?.status === 401) {
        if (error.response?.data?.error === 'REAUTH_REQUIRED' || error.response?.data?.error === 'AUTH_REQUIRED') {
          throw new Error('Your D2L session has expired. Please sign in again using the WebView.');
        }
        throw new Error(`Authentication failed: ${errorMessage}`);
      }

      if (error.response?.status === 403) {
        throw new Error(`Access forbidden: ${errorMessage}. Please check your D2L connection.`);
      }

      const fullErrorMessage = error.response?.status
        ? `[${error.response.status}] ${errorMessage}`
        : errorMessage;

      throw new Error(fullErrorMessage);
    }
  }

  /**
   * Get courses
   */
   async getCourses(): Promise<any[]> {
    try {
      const response = await apiClient.get('/d2l/courses');
      return response.data.courses || [];
    } catch (error: any) {
      console.error('Error fetching courses:', error);
      throw new Error(error.response?.data?.error || 'Failed to fetch courses');
    }
  }

  /**
   * Get announcements for a course
   */
  async getAnnouncements(courseId: string): Promise<any[]> {
    try {
      const response = await apiClient.get(`/d2l/courses/${courseId}/announcements`);
      return response.data.announcements || [];
    } catch (error: any) {
      console.error('Error fetching announcements:', error);
      throw new Error(error.response?.data?.error || 'Failed to fetch announcements');
    }
  }

  /**
   * Get assignments for a course
   */
  async getAssignments(courseId: string): Promise<any[]> {
    try {
      const response = await apiClient.get(`/d2l/courses/${courseId}/assignments`);
      return response.data.assignments || [];
    } catch (error: any) {
      console.error('Error fetching assignments:', error);
      throw new Error(error.response?.data?.error || 'Failed to fetch assignments');
    }
  }

  /**
   * Get grades for a course
   */
  async getGrades(courseId: string): Promise<any[]> {
    try {
      const response = await apiClient.get(`/d2l/courses/${courseId}/grades`);
      return response.data.grades || [];
    } catch (error: any) {
      console.error('Error fetching grades:', error);
      throw new Error(error.response?.data?.error || 'Failed to fetch grades');
    }
  }


  /**
   * Get content modules for a course
   */
  async getContent(courseId: string): Promise<any[]> {
    try {
      const response = await apiClient.get(`/d2l/courses/${courseId}/content`);
      return response.data.modules || [];
    } catch (error: any) {
      console.error('Error fetching content:', error);
      throw new Error(error.response?.data?.error || 'Failed to fetch course content');
    }
  }

  /**
   * Disconnect D2L (remove stored credentials)
   */
  async disconnect(): Promise<void> {
    try {
      await apiClient.delete('/d2l/disconnect');
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to disconnect D2L';
      throw new Error(errorMessage);
    }
  }
}

export const d2lService = new D2LService();

export const connectD2LCookie = async (host: string, cookies: string) => {
  const { data } = await apiClient.post('/d2l/connect-cookie', { host, cookies });
  return data;
};

export const syncD2L = async () => {
  const { data } = await apiClient.post('/d2l/sync');
  return data;
};
