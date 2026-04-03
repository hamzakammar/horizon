# Horizon

AI-powered access to your D2L Brightspace courses, Piazza discussions, and study notes via [Model Context Protocol (MCP)](https://modelcontextprotocol.io).

## Setup

1. Go to **https://api.hamzaammar.ca** and sign in (or create an account)
2. Connect your D2L account via the browser login flow
3. Optionally connect Piazza
4. Use one of the methods below to connect your AI assistant

## Connecting to AI

### Claude Desktop

1. Open Claude Desktop > Settings (gear icon) > Developer > Edit Config
2. Paste the following and save, then restart Claude Desktop:

```json
{
  "mcpServers": {
    "horizon": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://api.hamzaammar.ca/mcp",
        "--header",
        "x-api-key: YOUR_API_KEY"
      ]
    }
  }
}
```

Replace `YOUR_API_KEY` with the key shown on your dashboard (or use `Authorization: Bearer <token>` with your bearer token).

### Claude Code (CLI)

```bash
claude mcp add horizon -- npx mcp-remote https://api.hamzaammar.ca/mcp --header "x-api-key: YOUR_API_KEY"
```

### Poke by Interaction

1. Open Poke > Settings > MCP Servers > Add
2. Set the URL to `https://api.hamzaammar.ca/mcp`
3. Add a request header: `Authorization: Bearer <token>` (use the token from your dashboard)
4. Save — tools appear automatically

## Tools

Horizon exposes 32 MCP tools:

**D2L / Brightspace**
- `get_my_courses` — list enrolled courses
- `get_assignments` / `get_assignment` — view assignments and details
- `get_assignment_submissions` — check submission status
- `get_my_grades` — view grades across courses
- `get_upcoming_due_dates` — upcoming deadlines
- `get_course_content` / `get_course_modules` / `get_course_module` / `get_course_topic` — browse course content
- `get_announcements` — course announcements
- `read_file` / `download_file` / `delete_file` — manage D2L files

**Piazza**
- `piazza_get_classes` / `piazza_get_posts` / `piazza_get_post` — browse Piazza
- `piazza_search` / `piazza_semantic_search` — search posts
- `piazza_sync` / `piazza_embed_missing` — sync and embed posts
- `piazza_suggest_for_item` — get relevant posts for an assignment

**Notes**
- `notes_search` / `semantic_search_notes` — search uploaded PDFs
- `notes_sync` / `notes_embed_missing` — sync and embed notes
- `notes_suggest_for_item` — get relevant notes for an assignment

**Study**
- `plan_week` — AI-generated weekly study plan
- `sync_all` — sync all data sources at once
- `tasks_list` / `tasks_add` / `tasks_complete` — personal task management

## Architecture

- **Backend**: Node.js + Express + MCP SDK (Streamable HTTP transport)
- **Gateway**: Go (chi router) with JWT + API key auth
- **Database**: Supabase (PostgreSQL + pgvector)
- **Storage**: S3 for PDF notes and browser session state
- **Hosting**: AWS ECS Fargate behind the gateway
- **Auth**: Supabase Auth with token refresh, D2L via VNC browser session + Duo MFA
