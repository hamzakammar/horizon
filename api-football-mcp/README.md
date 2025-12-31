# API-Football MCP Server

A Model Context Protocol (MCP) server for accessing football/soccer data from API-Football (api-football.com).

## Features

This MCP server provides comprehensive football data including:

- **Live Scores** - Get real-time match scores and updates
- **Fixtures** - Query past and upcoming matches by date, league, or team
- **Standings** - View league tables and team rankings
- **Teams** - Search and get detailed team information
- **Players** - Access player statistics and information
- **Leagues** - Browse available competitions and seasons
- **Statistics** - Detailed match and team statistics
- **Top Scorers/Assists** - Get leading players in leagues

## Installation

1. Clone or download this repository
2. Install dependencies:

```bash
cd api-football-mcp
npm install
```

3. Get your API key from [API-Football Dashboard](https://dashboard.api-football.com/)

4. Create a `.env` file:

```bash
cp .env.example .env
```

5. Add your API key to `.env`:

```
API_FOOTBALL_KEY=your_api_key_here
```

6. Build the server:

```bash
npm run build
```

## Usage with Claude Desktop

Add this to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "api-football": {
      "command": "node",
      "args": ["/absolute/path/to/api-football-mcp/dist/index.js"],
      "env": {
        "API_FOOTBALL_KEY": "your_api_key_here"
      }
    }
  }
}
```

Or if you have the .env file configured:

```json
{
  "mcpServers": {
    "api-football": {
      "command": "node",
      "args": ["/absolute/path/to/api-football-mcp/dist/index.js"]
    }
  }
}
```

## Available Tools

### get_fixtures
Get football matches by date, league, team, or live scores.

**Parameters:**
- `date` (optional): Date in YYYY-MM-DD format
- `league` (optional): League ID
- `season` (optional): Season year (e.g., 2023)
- `team` (optional): Team ID
- `last` (optional): Last N fixtures
- `next` (optional): Next N fixtures
- `live` (optional): "all" for all live matches
- `id` (optional): Specific fixture ID

**Example:**
```
Get today's fixtures for Premier League
Get live scores
Get Manchester United's next 5 matches
```

### get_standings
Get league standings/table.

**Parameters:**
- `league` (required): League ID
- `season` (required): Season year
- `team` (optional): Specific team

**Example:**
```
Get Premier League standings for 2023
```

### get_teams
Search for teams and get team information.

**Parameters:**
- `id` (optional): Team ID
- `name` (optional): Team name
- `league` (optional): League ID
- `season` (optional): Season year
- `country` (optional): Country name
- `search` (optional): Search term

**Example:**
```
Search for Barcelona
Get teams in Premier League
```

### get_players
Get player information and statistics.

**Parameters:**
- `season` (required): Season year
- `id` (optional): Player ID
- `team` (optional): Team ID
- `league` (optional): League ID
- `search` (optional): Player name

**Example:**
```
Search for Messi statistics in 2023
Get players from Manchester City
```

### get_leagues
Get available leagues and competitions.

**Parameters:**
- `id` (optional): League ID
- `name` (optional): League name
- `country` (optional): Country name
- `type` (optional): "league" or "cup"
- `current` (optional): Current season only
- `search` (optional): Search term

**Example:**
```
Get all leagues in England
Get current leagues
```

### get_team_statistics
Get detailed team statistics for a season.

**Parameters:**
- `league` (required): League ID
- `season` (required): Season year
- `team` (required): Team ID
- `date` (optional): Date filter

**Example:**
```
Get Manchester United statistics for Premier League 2023
```

### get_fixture_statistics
Get match statistics (shots, possession, etc.).

**Parameters:**
- `fixtureId` (required): Fixture ID

### get_fixture_events
Get match events (goals, cards, substitutions).

**Parameters:**
- `fixtureId` (required): Fixture ID

### get_fixture_lineups
Get team lineups and formations.

**Parameters:**
- `fixtureId` (required): Fixture ID

### get_top_scorers
Get top goal scorers for a league.

**Parameters:**
- `league` (required): League ID
- `season` (required): Season year

### get_top_assists
Get top assist providers for a league.

**Parameters:**
- `league` (required): League ID
- `season` (required): Season year

## Common League IDs

- Premier League (England): 39
- La Liga (Spain): 140
- Bundesliga (Germany): 78
- Serie A (Italy): 135
- Ligue 1 (France): 61
- Champions League: 2
- Europa League: 3
- World Cup: 1

For more league IDs, use the `get_leagues` tool.

## Development

```bash
# Watch mode
npm run dev

# Build
npm run build

# Run
npm start
```

## API Limits

API-Football has rate limits depending on your subscription plan. Check your dashboard at https://dashboard.api-football.com/ for your limits.

## License

MIT
