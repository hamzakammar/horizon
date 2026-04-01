# Horizon

AI-powered access to your D2L courses via MCP.

## Structure

- `d2l-mcp/` — Backend: Node.js MCP server + Go gateway, Docker, ECS deployment
- `study-mcp-app/` — React Native mobile app (Expo)
- `supabase/` — Database migrations

## Setup

Go to [horizon.hamzaammar.ca/onboard](https://horizon.hamzaammar.ca/onboard) to connect your account.

## Deploy

```bash
bash d2l-mcp/scripts/deploy-to-ecs.sh
```
