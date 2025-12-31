# MCP Workspace

This workspace contains multiple Model Context Protocol (MCP) servers for easy management and deployment.

## Structure

```
mcp-workspace/
├── d2l-mcp/           # D2L Brightspace MCP server
├── another-mcp/       # Your next MCP server
├── package.json       # Shared scripts for all MCPs
├── .env.template      # Template for environment variables
└── scripts/           # Management scripts
    ├── sync-all.sh    # Sync all MCPs to EC2
    ├── start-all.sh   # Start all MCPs with PM2
    └── stop-all.sh    # Stop all MCPs
```

## Quick Start

### 1. Move your existing D2L MCP

```bash
mv ../d2l-mcp ./d2l-mcp
```

### 2. Install dependencies for all MCPs

```bash
npm run install-all
```

### 3. Build all MCPs

```bash
npm run build-all
```

### 4. Sync to EC2

```bash
npm run sync-ec2
```

### 5. Start on EC2

SSH into EC2 and run:
```bash
cd ~/mcp-workspace
npm run start-all
```

## Managing Individual MCPs

Each MCP is independent:

```bash
# Work on D2L MCP
cd d2l-mcp
npm install
npm run build
npm start

# Create a new MCP
cd ..
mkdir my-new-mcp
cd my-new-mcp
npm init -y
```

## Environment Variables

Copy `.env.template` to each MCP's directory and configure:

```bash
cp .env.template d2l-mcp/.env
# Edit d2l-mcp/.env with your credentials
```

## PM2 Process Names

All MCPs are prefixed with workspace name:
- `mcp-d2l`
- `mcp-another`

View all:
```bash
pm2 list
```

## Adding New MCPs

1. Create new directory in workspace
2. Initialize your MCP project
3. Add to `package.json` scripts
4. Sync and deploy
