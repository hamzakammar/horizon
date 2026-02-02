import { apiClient } from '../config/api';
import { SearchResponse, SearchHit } from '../types';

export interface SearchParams {
  q: string;
  courseId?: string;
  limit?: number;
}

export class SearchService {
  async search(params: SearchParams): Promise<SearchHit[]> {
    const response = await apiClient.get<SearchResponse>('/search', {
      params: {
        q: params.q,
        courseId: params.courseId,
        limit: params.limit || 10,
      },
    });
    return response.data.hits;
  }
}

export const searchService = new SearchService();
