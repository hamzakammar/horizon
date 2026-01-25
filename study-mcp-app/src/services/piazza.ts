import { apiClient } from '../config/api';

export interface PiazzaStatus {
  connected: boolean;
  syncing: boolean;
  lastSync?: string;
}

export class PiazzaService {
  /**
   * Get Piazza connection status
   */
  async getStatus(): Promise<PiazzaStatus> {
    try {
      // TODO: Implement API endpoint: GET /api/piazza/status
      const response = await apiClient.get<PiazzaStatus>('/api/piazza/status');
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
   * Connect to Piazza (credentials or OAuth)
   */
  async connect(credentials?: { email?: string; password?: string }): Promise<void> {
    // TODO: Implement API endpoint: POST /api/piazza/connect
    throw new Error('Piazza connection not yet implemented');
  }

  /**
   * Sync all Piazza data
   */
  async syncAll(): Promise<void> {
    // TODO: Implement API endpoint: POST /api/piazza/sync
    // This should trigger the piazza_sync MCP tool
    const response = await apiClient.post('/api/piazza/sync');
    if (response.status !== 200) {
      throw new Error('Failed to sync Piazza data');
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
}

export const piazzaService = new PiazzaService();
