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
      const response = await apiClient.get('/health', { timeout: 5000 });
      return response.status === 200;
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
      const response = await apiClient.get<D2LStatus>('/api/d2l/status');
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
   * Connect to D2L (store credentials)
   */
  async connect(credentials: { host: string; username: string; password: string }): Promise<void> {
    try {
      console.log('[D2L] Attempting to connect...');
      
      // Check if backend is reachable first
      const isHealthy = await this.checkBackendHealth();
      if (!isHealthy) {
        throw new Error('Cannot reach backend server. Please make sure the backend is running on ' + 
          (process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.hamzaammar.ca'));
      }
      
      // Set a longer timeout for authentication (90 seconds - Playwright can take a while)
      const response = await apiClient.post('/api/d2l/connect', credentials, {
        timeout: 90000, // 90 seconds
      });
      if (response.status !== 200) {
        throw new Error(response.data?.error || 'Failed to connect to D2L');
      }
      console.log('[D2L] Connection successful');
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
      const response = await apiClient.post('/api/d2l/sync');
      if (response.status !== 200) {
        throw new Error(response.data?.message || response.data?.error || 'Failed to sync D2L data');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || 'Failed to sync D2L data';
      throw new Error(errorMessage);
    }
  }

  /**
   * Get courses
   */
  async getCourses(): Promise<any[]> {
    try {
      const response = await apiClient.get('/api/d2l/courses');
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
      const response = await apiClient.get(`/api/d2l/courses/${courseId}/announcements`);
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
      const response = await apiClient.get(`/api/d2l/courses/${courseId}/assignments`);
      return response.data.assignments || [];
    } catch (error: any) {
      console.error('Error fetching assignments:', error);
      throw new Error(error.response?.data?.error || 'Failed to fetch assignments');
    }
  }
}

export const d2lService = new D2LService();
