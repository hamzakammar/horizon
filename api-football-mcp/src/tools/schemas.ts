import { z } from 'zod';

export const GetFixturesSchema = z.object({
  date: z.string().optional().describe('Date in YYYY-MM-DD format'),
  league: z.number().optional().describe('League ID'),
  season: z.number().optional().describe('Season year (e.g., 2023)'),
  team: z.number().optional().describe('Team ID'),
  last: z.number().optional().describe('Last N fixtures'),
  next: z.number().optional().describe('Next N fixtures'),
  live: z.string().optional().describe('all, id-id-id for specific leagues'),
  id: z.number().optional().describe('Specific fixture ID')
});

export const GetStandingsSchema = z.object({
  league: z.number().describe('League ID'),
  season: z.number().describe('Season year (e.g., 2023)'),
  team: z.number().optional().describe('Team ID for specific team standing')
});

export const GetTeamsSchema = z.object({
  id: z.number().optional().describe('Team ID'),
  name: z.string().optional().describe('Team name'),
  league: z.number().optional().describe('League ID'),
  season: z.number().optional().describe('Season year'),
  country: z.string().optional().describe('Country name'),
  search: z.string().optional().describe('Search term')
});

export const GetPlayersSchema = z.object({
  id: z.number().optional().describe('Player ID'),
  team: z.number().optional().describe('Team ID'),
  league: z.number().optional().describe('League ID'),
  season: z.number().describe('Season year (e.g., 2023)'),
  search: z.string().optional().describe('Player name search')
});

export const GetLeaguesSchema = z.object({
  id: z.number().optional().describe('League ID'),
  name: z.string().optional().describe('League name'),
  country: z.string().optional().describe('Country name'),
  code: z.string().optional().describe('Country code'),
  season: z.number().optional().describe('Season year'),
  team: z.number().optional().describe('Team ID'),
  type: z.string().optional().describe('League type: league, cup'),
  current: z.boolean().optional().describe('Current season only'),
  search: z.string().optional().describe('Search term')
});

export const GetTeamStatisticsSchema = z.object({
  league: z.number().describe('League ID'),
  season: z.number().describe('Season year'),
  team: z.number().describe('Team ID'),
  date: z.string().optional().describe('Date in YYYY-MM-DD format')
});

export const GetFixtureDetailsSchema = z.object({
  fixtureId: z.number().describe('Fixture ID')
});

export const GetTopPlayersSchema = z.object({
  league: z.number().describe('League ID'),
  season: z.number().describe('Season year')
});
