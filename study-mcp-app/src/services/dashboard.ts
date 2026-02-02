import { apiClient } from '../config/api';
import { DashboardResponse } from '../types';

export class DashboardService {
  async getDashboard(): Promise<DashboardResponse> {
    const response = await apiClient.get<DashboardResponse>('/dashboard');
    return response.data;
  }
}

export const dashboardService = new DashboardService();
