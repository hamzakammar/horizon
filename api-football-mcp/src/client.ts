import { ApiResponse } from './types/index.js';

const API_BASE = 'https://v3.football.api-sports.io';

export class ApiFootballClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async makeRequest<T>(endpoint: string, params: Record<string, any> = {}): Promise<ApiResponse<T>> {
    const url = new URL(`${API_BASE}${endpoint}`);
    
    // Add query parameters
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-rapidapi-key': this.apiKey,
        'x-rapidapi-host': 'v3.football.api-sports.io'
      }
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async getFixtures(params: {
    date?: string;
    league?: number;
    season?: number;
    team?: number;
    last?: number;
    next?: number;
    live?: string;
    id?: number;
  }) {
    return this.makeRequest('/fixtures', params);
  }

  async getStandings(params: {
    league: number;
    season: number;
    team?: number;
  }) {
    return this.makeRequest('/standings', params);
  }

  async getTeams(params: {
    id?: number;
    name?: string;
    league?: number;
    season?: number;
    country?: string;
    search?: string;
  }) {
    return this.makeRequest('/teams', params);
  }

  async getPlayers(params: {
    id?: number;
    team?: number;
    league?: number;
    season: number;
    search?: string;
  }) {
    return this.makeRequest('/players', params);
  }

  async getLeagues(params?: {
    id?: number;
    name?: string;
    country?: string;
    code?: string;
    season?: number;
    team?: number;
    type?: string;
    current?: boolean;
    search?: string;
  }) {
    return this.makeRequest('/leagues', params || {});
  }

  async getTeamStatistics(params: {
    league: number;
    season: number;
    team: number;
    date?: string;
  }) {
    return this.makeRequest('/teams/statistics', params);
  }

  async getFixtureStatistics(fixtureId: number) {
    return this.makeRequest('/fixtures/statistics', { fixture: fixtureId });
  }

  async getFixtureEvents(fixtureId: number) {
    return this.makeRequest('/fixtures/events', { fixture: fixtureId });
  }

  async getFixtureLineups(fixtureId: number) {
    return this.makeRequest('/fixtures/lineups', { fixture: fixtureId });
  }

  async getTopScorers(params: {
    league: number;
    season: number;
  }) {
    return this.makeRequest('/players/topscorers', params);
  }

  async getTopAssists(params: {
    league: number;
    season: number;
  }) {
    return this.makeRequest('/players/topassists', params);
  }
}
