import { apiClient } from '../config/api';

export interface D2LStatus {
  connected: boolean;
  syncing: boolean;
  lastSync?: string;
}

export class D2LService {
  /**
   * Get D2L connection status
   */
  async getStatus(): Promise<D2LStatus> {
    try {
      // TODO: Implement API endpoint: GET /api/d2l/status
      const response = await apiClient.get<D2LStatus>('/api/d2l/status');
      return response.data;
    } catch (error) {
      // If endpoint doesn't exist, return default status
      return {
        connected: false,
        syncing: false,
      };
    }
  }

  /**
   * Connect to D2L (OAuth flow or credentials)
   */
  async connect(credentials?: { username?: string; password?: string }): Promise<void> {
    // TODO: Implement API endpoint: POST /api/d2l/connect
    // This might trigger OAuth flow or store credentials
    throw new Error('D2L connection not yet implemented');
  }

  /**
   * Sync all D2L data (courses, assignments, content, etc.)
   */
  async syncAll(): Promise<void> {
    // TODO: Implement API endpoint: POST /api/d2l/sync
    // This should trigger the sync_all MCP tool
    const response = await apiClient.post('/api/d2l/sync');
    if (response.status !== 200) {
      throw new Error('Failed to sync D2L data');
    }
  }

  /**
   * Get courses
   */
  async getCourses(): Promise<any[]> {
    // TODO: Implement API endpoint: GET /api/d2l/courses
    const response = await apiClient.get('/api/d2l/courses');
    return response.data.courses || [];
  }

  /**
   * Get assignments for a course
   */
  async getAssignments(courseId: string): Promise<any[]> {
    // TODO: Implement API endpoint: GET /api/d2l/courses/:courseId/assignments
    const response = await apiClient.get(`/api/d2l/courses/${courseId}/assignments`);
    return response.data.assignments || [];
  }
}

export const d2lService = new D2LService();
