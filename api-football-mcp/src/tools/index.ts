import { ApiFootballClient } from '../client.js';
import {
  GetFixturesSchema,
  GetStandingsSchema,
  GetTeamsSchema,
  GetPlayersSchema,
  GetLeaguesSchema,
  GetTeamStatisticsSchema,
  GetFixtureDetailsSchema,
  GetTopPlayersSchema
} from './schemas.js';

export const tools = [
  {
    name: 'get_fixtures',
    description: 'Get football fixtures (matches) by date, league, team, or get live scores. Can retrieve past, upcoming, or live fixtures.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        league: { type: 'number', description: 'League ID' },
        season: { type: 'number', description: 'Season year (e.g., 2023)' },
        team: { type: 'number', description: 'Team ID' },
        last: { type: 'number', description: 'Last N fixtures' },
        next: { type: 'number', description: 'Next N fixtures' },
        live: { type: 'string', description: '"all" for all live matches, or "id-id-id" for specific leagues' },
        id: { type: 'number', description: 'Specific fixture ID' }
      }
    }
  },
  {
    name: 'get_standings',
    description: 'Get league standings/table for a specific league and season',
    inputSchema: {
      type: 'object',
      properties: {
        league: { type: 'number', description: 'League ID (required)' },
        season: { type: 'number', description: 'Season year (e.g., 2023) (required)' },
        team: { type: 'number', description: 'Team ID for specific team standing' }
      },
      required: ['league', 'season']
    }
  },
  {
    name: 'get_teams',
    description: 'Search for teams by name, league, country, or get team information',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Team ID' },
        name: { type: 'string', description: 'Team name' },
        league: { type: 'number', description: 'League ID' },
        season: { type: 'number', description: 'Season year' },
        country: { type: 'string', description: 'Country name' },
        search: { type: 'string', description: 'Search term' }
      }
    }
  },
  {
    name: 'get_players',
    description: 'Get player information and statistics',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Player ID' },
        team: { type: 'number', description: 'Team ID' },
        league: { type: 'number', description: 'League ID' },
        season: { type: 'number', description: 'Season year (e.g., 2023) (required)' },
        search: { type: 'string', description: 'Player name search' }
      },
      required: ['season']
    }
  },
  {
    name: 'get_leagues',
    description: 'Get list of available leagues and competitions',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'League ID' },
        name: { type: 'string', description: 'League name' },
        country: { type: 'string', description: 'Country name' },
        code: { type: 'string', description: 'Country code' },
        season: { type: 'number', description: 'Season year' },
        team: { type: 'number', description: 'Team ID' },
        type: { type: 'string', description: 'League type: league, cup' },
        current: { type: 'boolean', description: 'Current season only' },
        search: { type: 'string', description: 'Search term' }
      }
    }
  },
  {
    name: 'get_team_statistics',
    description: 'Get detailed statistics for a team in a specific league and season',
    inputSchema: {
      type: 'object',
      properties: {
        league: { type: 'number', description: 'League ID (required)' },
        season: { type: 'number', description: 'Season year (required)' },
        team: { type: 'number', description: 'Team ID (required)' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' }
      },
      required: ['league', 'season', 'team']
    }
  },
  {
    name: 'get_fixture_statistics',
    description: 'Get match statistics for a specific fixture (shots, possession, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        fixtureId: { type: 'number', description: 'Fixture ID (required)' }
      },
      required: ['fixtureId']
    }
  },
  {
    name: 'get_fixture_events',
    description: 'Get match events (goals, cards, substitutions) for a specific fixture',
    inputSchema: {
      type: 'object',
      properties: {
        fixtureId: { type: 'number', description: 'Fixture ID (required)' }
      },
      required: ['fixtureId']
    }
  },
  {
    name: 'get_fixture_lineups',
    description: 'Get team lineups and formations for a specific fixture',
    inputSchema: {
      type: 'object',
      properties: {
        fixtureId: { type: 'number', description: 'Fixture ID (required)' }
      },
      required: ['fixtureId']
    }
  },
  {
    name: 'get_top_scorers',
    description: 'Get top goal scorers for a league and season',
    inputSchema: {
      type: 'object',
      properties: {
        league: { type: 'number', description: 'League ID (required)' },
        season: { type: 'number', description: 'Season year (required)' }
      },
      required: ['league', 'season']
    }
  },
  {
    name: 'get_top_assists',
    description: 'Get top assist providers for a league and season',
    inputSchema: {
      type: 'object',
      properties: {
        league: { type: 'number', description: 'League ID (required)' },
        season: { type: 'number', description: 'Season year (required)' }
      },
      required: ['league', 'season']
    }
  }
];

export async function handleToolCall(name: string, args: any, client: ApiFootballClient) {
  switch (name) {
    case 'get_fixtures': {
      const params = GetFixturesSchema.parse(args);
      const result = await client.getFixtures(params);
      return JSON.stringify(result, null, 2);
    }
    
    case 'get_standings': {
      const params = GetStandingsSchema.parse(args);
      const result = await client.getStandings(params);
      return JSON.stringify(result, null, 2);
    }
    
    case 'get_teams': {
      const params = GetTeamsSchema.parse(args);
      const result = await client.getTeams(params);
      return JSON.stringify(result, null, 2);
    }
    
    case 'get_players': {
      const params = GetPlayersSchema.parse(args);
      const result = await client.getPlayers(params);
      return JSON.stringify(result, null, 2);
    }
    
    case 'get_leagues': {
      const params = GetLeaguesSchema.parse(args);
      const result = await client.getLeagues(params);
      return JSON.stringify(result, null, 2);
    }
    
    case 'get_team_statistics': {
      const params = GetTeamStatisticsSchema.parse(args);
      const result = await client.getTeamStatistics(params);
      return JSON.stringify(result, null, 2);
    }
    
    case 'get_fixture_statistics': {
      const params = GetFixtureDetailsSchema.parse(args);
      const result = await client.getFixtureStatistics(params.fixtureId);
      return JSON.stringify(result, null, 2);
    }
    
    case 'get_fixture_events': {
      const params = GetFixtureDetailsSchema.parse(args);
      const result = await client.getFixtureEvents(params.fixtureId);
      return JSON.stringify(result, null, 2);
    }
    
    case 'get_fixture_lineups': {
      const params = GetFixtureDetailsSchema.parse(args);
      const result = await client.getFixtureLineups(params.fixtureId);
      return JSON.stringify(result, null, 2);
    }
    
    case 'get_top_scorers': {
      const params = GetTopPlayersSchema.parse(args);
      const result = await client.getTopScorers(params);
      return JSON.stringify(result, null, 2);
    }
    
    case 'get_top_assists': {
      const params = GetTopPlayersSchema.parse(args);
      const result = await client.getTopAssists(params);
      return JSON.stringify(result, null, 2);
    }
    
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
