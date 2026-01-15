# StudyMCP - D2L Brightspace & Piazza MCP Server

An MCP (Model Context Protocol) server that gives AI assistants access to your university's D2L Brightspace LMS and Piazza discussion forums.

> ⚠️ **Academic Integrity Notice**: This tool is for personal productivity only. Do not use it for any activities that violate your university's Academic Code of Conduct.

## Features

### D2L Brightspace Tools
- **Assignments** - List assignments, view details, check submissions & feedback
- **Grades** - View all grades with scores and instructor feedback  
- **Calendar** - Get upcoming due dates and events
- **Course Content** - Browse syllabus, modules, topics, and lectures
- **Announcements** - Read instructor announcements
- **File Downloads** - Download and extract content from course files (docx, pdf, etc.)

### Piazza Tools
- **Sync Posts** - Fetch recent posts from your Piazza classes to local database
- **Semantic Search** - AI-powered search across all your Piazza posts
- **Get Classes** - List all enrolled Piazza classes

### Study Tools
- **Task Management** - Track assignments and deadlines across courses
- **Notes Sync** - Sync and search your course notes
- **Weekly Planning** - Generate study plans based on upcoming deadlines

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/joshuasoup/d2l-mcp.git
cd d2l-mcp
npm install
npm run build
```

### 2. Configure Environment

```bash
cp .env.template .env
```

Edit `.env` with your credentials:

```env
# Required for D2L
D2L_HOST=learn.yourschool.edu
D2L_USERNAME=your-username
D2L_PASSWORD=your-password

# Required for Piazza & Study tools
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-key
OPENAI_API_KEY=sk-your-key

# Optional: Piazza integration
PIAZZA_USERNAME=your-email@school.edu
PIAZZA_PASSWORD=your-piazza-password
```

### 3. Set Up Database (for Study Tools)

Create a Supabase project and run the schema in `src/study/db/schema.sql`.

### 4. Run the Server

```bash
npm start
```

Server runs on `http://localhost:3000/mcp`

## Connecting to MCP Clients

### VS Code (Copilot)

Add to your VS Code settings:

```json
{
  "mcp": {
    "servers": {
      "studymcp": {
        "url": "http://localhost:3000/mcp"
      }
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "studymcp": {
      "command": "node",
      "args": ["/path/to/dist/index.js"],
      "env": {
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

### Poke (MCP Client)

To connect your MCP server to Poke:

1. Start your MCP server locally:
   ```bash
   npm start
   ```
2. (Optional) Expose your server with ngrok:
   ```bash
   ngrok http 3000
   ```
3. In Poke, go to **Settings > Connections > Integrations > Add MCP Server**
4. Enter your MCP server URL:
   - For local: `http://localhost:3000/mcp`
   - For remote: use your ngrok URL (e.g., `https://abc123.ngrok.io/mcp`)
5. Save and test the connection.

You can now use all MCP tools from within Poke.

### Remote Access (ngrok)

To allow external MCP clients to connect to your local server, use ngrok:

```bash
npm start
ngrok http 3000
```

Use the ngrok URL (e.g., `https://abc123.ngrok.io/mcp`) in any MCP client.

## Available Tools

### D2L Tools

| Tool | Description |
|------|-------------|
| `get_assignments` | List all assignments with due dates |
| `get_assignment` | Get full details for a specific assignment |
| `get_assignment_submissions` | Get your submissions and feedback |
| `get_my_grades` | Get all grades with scores |
| `get_upcoming_due_dates` | Get calendar events and deadlines |
| `get_course_content` | Get complete course syllabus |
| `get_course_modules` | Get main course sections |
| `get_course_module` | Get contents of a specific module |
| `get_course_topic` | Get details for a specific topic |
| `get_announcements` | Get course announcements |
| `get_my_courses` | List enrolled courses |
| `download_file` | Download course files |

### Piazza Tools

| Tool | Description |
|------|-------------|
| `piazza_get_classes` | List all enrolled Piazza classes |
| `piazza_get_posts` | Get posts from a class |
| `piazza_get_post` | Get a specific post with answers |
| `piazza_search` | Text search in a class |
| `piazza_sync` | Sync posts to database |
| `piazza_embed_missing` | Generate embeddings for search |
| `piazza_semantic_search` | AI-powered semantic search |
| `piazza_suggest_for_item` | Find relevant posts for an assignment |

### Study Tools

| Tool | Description |
|------|-------------|
| `sync_all` | Sync all assignments as tasks |
| `tasks_list` | List tasks by course/status |
| `tasks_add` | Add a manual task |
| `tasks_complete` | Mark task as done |
| `plan_week` | Generate weekly study plan |
| `notes_sync` | Sync notes from repository |
| `notes_search` | Search through notes |
| `notes_suggest_for_item` | Find relevant notes for assignment |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `D2L_HOST` | Yes | Your Brightspace hostname (e.g., `learn.uwaterloo.ca`) |
| `D2L_USERNAME` | No | For automated login |
| `D2L_PASSWORD` | No | For automated login |
| `D2L_COURSE_ID` | No | Default course ID |
| `SUPABASE_URL` | For study tools | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | For study tools | Supabase service key |
| `OPENAI_API_KEY` | For search | OpenAI API key for embeddings |
| `PIAZZA_USERNAME` | For Piazza | Piazza login email |
| `PIAZZA_PASSWORD` | For Piazza | Piazza password |
| `MCP_TRANSPORT` | No | `http` (default) or `stdio` |
| `MCP_PORT` | No | Server port (default: 3000) |

## Important: Private Mapping Files

You must create and maintain two private mapping files (not tracked in git):

- `src/study/db/notes_map.json`: Maps course IDs to the absolute paths of your notes PDFs. Required for notes sync.
- `src/study/db/piazza_map.json`: Maps course IDs to Piazza class IDs (nids). Required for Piazza tools.

**These files are in .gitignore for your privacy.**

Example `notes_map.json`:
```json
{
  "MATH119": ["/Users/yourname/Documents/MATH119/Notes.pdf"],
  "ECE140": ["/Users/yourname/Documents/ECE140/ECE140Notes.pdf"]
}
```

Example `piazza_map.json`:
```json
{
  "ECE124": "mj0op591mef2vl",
  "ECE140": "mjhga7avfwz39z"
}
```

## Session Management

- **D2L tokens** expire after ~1 hour but auto-refresh
- **Browser sessions** persist in `~/.d2l-session/`
- **Piazza sessions** persist in `~/.piazza-session/`
- Run `npm run auth` to manually re-authenticate

## Development

```bash
# Run tests
npm test

# Integration tests (requires auth)
npm run test:integration

# Build
npm run build
```

## Project Structure

```
src/
├── index.ts          # MCP server entry point
├── auth.ts           # D2L authentication
├── client.ts         # D2L API client
├── tools/            # D2L tool implementations
│   ├── calendar.ts
│   ├── content.ts
│   ├── grades.ts
│   ├── news.ts
│   └── piazza.ts
└── study/            # Study tools (tasks, notes, piazza)
    ├── piazzaAuth.ts
    ├── db/
    │   ├── schema.sql
    │   └── piazza_map.json
    └── src/
        ├── notes.ts
        ├── piazza.ts
        ├── planning.ts
        └── sync.ts
```

## License

MIT

## Credits

Based on [d2l-mcp-server](https://github.com/General-Mudkip/d2l-mcp-server) by General-Mudkip.
