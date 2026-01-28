import { apiClient } from '../config/api';

export interface PiazzaStatus {
  connected: boolean;
  syncing: boolean;
  lastSync?: string;
  classesCount?: number;
}

export class PiazzaService {
  /**
   * Check if backend is reachable
   */
  private async checkBackendHealth(): Promise<boolean> {
    try {
      const response = await apiClient.get('/health', { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      console.error('[Piazza] Backend health check failed:', error);
      return false;
    }
  }

  /**
   * Get Piazza connection status
   */
  async getStatus(): Promise<PiazzaStatus> {
    try {
      const response = await apiClient.get<any>('/api/piazza/status');
      return {
        connected: response.data.connected || false,
        syncing: false,
        lastSync: response.data.lastSync || undefined,
        classesCount: response.data.classesCount || 0,
      };
    } catch (error: any) {
      console.error('Error getting Piazza status:', error);
      // Return default status on error
      return {
        connected: false,
        syncing: false,
        classesCount: 0,
      };
    }
  }

  /**
   * Connect to Piazza (store credentials or trigger browser login)
   */
  async connect(credentials: { email: string; password: string }): Promise<void> {
    try {
      console.log('[Piazza] Attempting to connect...');
      
      // Check if backend is reachable first
      const isHealthy = await this.checkBackendHealth();
      if (!isHealthy) {
        throw new Error('Cannot reach backend server. Please make sure the backend is running on ' + 
          (process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.hamzaammar.ca'));
      }
      
      const response = await apiClient.post('/api/piazza/connect', credentials);
      if (response.status !== 200) {
        throw new Error(response.data?.error || 'Failed to connect to Piazza');
      }
      console.log('[Piazza] Connection successful');
    } catch (error: any) {
      console.error('[Piazza] Connection error:', error);
      if (error.code === 'ECONNREFUSED' || error.message?.includes('Cannot reach backend')) {
        throw error; // Re-throw our custom error
      }
      if (error.response?.status === 404) {
        throw new Error('API endpoint not found. Make sure the backend server is running and the API base URL is correct.');
      }
      if (error.response?.status === 401) {
        throw new Error('Authentication failed. Please log out and log back in.');
      }
      const errorMessage = error.response?.data?.error || error.message || 'Failed to connect to Piazza';
      throw new Error(errorMessage);
    }
  }

  /**
   * Connect to Piazza using cookies (from WebView capture)
   */
  async connectWithCookies(payload: { cookies: string }): Promise<void> {
    try {
      console.log('[Piazza] Storing cookies...');

      const isHealthy = await this.checkBackendHealth();
      if (!isHealthy) {
        throw new Error('Cannot reach backend server. Please make sure the backend is running on ' +
          (process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.hamzaammar.ca'));
      }

      const response = await apiClient.post('/api/piazza/connect-cookie', payload, {
        timeout: 30000,
      });
      if (response.status !== 200) {
        throw new Error(response.data?.error || 'Failed to store cookies');
      }
      console.log('[Piazza] Cookies stored successfully');
    } catch (error: any) {
      console.error('[Piazza] Cookie storage error:', error);
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
   * Sync all Piazza data
   */
  async syncAll(): Promise<void> {
    try {
      const response = await apiClient.post('/api/piazza/sync');
      if (response.status !== 200) {
        throw new Error(response.data?.message || response.data?.error || 'Failed to sync Piazza data');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || 'Failed to sync Piazza data';
      throw new Error(errorMessage);
    }
  }

  /**
   * Embed missing Piazza posts
   */
  async embedMissing(): Promise<void> {
    // TODO: Implement API endpoint: POST /api/piazza/embed-missing
    const response = await apiClient.post('/api/piazza/embed-missing');
    if (response.status !== 200) {
      throw new Error('Failed to embed Piazza posts');
    }
  }

  /**
   * Search Piazza posts
   */
  async search(query: string, courseId?: string): Promise<any[]> {
    // TODO: Implement API endpoint: GET /api/piazza/search?q=...
    const response = await apiClient.get('/api/piazza/search', {
      params: { q: query, courseId },
    });
    return response.data.hits || [];
  }

  /**
   * Disconnect Piazza (remove credentials)
   */
  async disconnect(): Promise<void> {
    try {
      const response = await apiClient.delete('/api/piazza/disconnect');
      if (response.status !== 200) {
        throw new Error(response.data?.error || 'Failed to disconnect Piazza');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to disconnect Piazza';
      throw new Error(errorMessage);
    }
  }
}

export const piazzaService = new PiazzaService();
