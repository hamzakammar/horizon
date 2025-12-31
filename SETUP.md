# Quick Setup Guide

## Local Setup (First Time)

```bash
cd /Users/hamzaammar/Documents/Code/mcp-workspace

# 1. Copy environment template to D2L MCP
cp .env.template d2l-mcp/.env

# 2. Edit D2L credentials
nano d2l-mcp/.env

# 3. Authenticate D2L (complete 2FA locally)
npm run auth-d2l

# 4. Build all MCPs
npm run build-all
```

## Deploy to EC2

```bash
# 1. Sync code to EC2
bash scripts/sync-to-ec2.sh

# 2. Sync authenticated sessions
npm run sync-sessions

# 3. SSH into EC2
ssh -i ~/.ssh/PokeIntegrations ec2-user@3.93.185.101

# 4. On EC2: Install dependencies
cd ~/mcp-workspace
npm run install-all

# 5. On EC2: Build all MCPs
npm run build-all

# 6. On EC2: Start all MCPs with PM2
npm run start-all

# 7. Save PM2 process list
pm2 save

# 8. Enable PM2 auto-start on reboot
pm2 startup
# Run the command PM2 outputs
```

## Daily Maintenance

When sessions expire (~24 hours), just run locally:

```bash
cd /Users/hamzaammar/Documents/Code/mcp-workspace
npm run auth-d2l           # Complete 2FA locally
npm run sync-sessions      # Upload to EC2
```

Then restart on EC2:
```bash
ssh -i ~/.ssh/PokeIntegrations ec2-user@3.93.185.101 "cd ~/mcp-workspace && npm run restart-all"
```

## Managing Multiple MCPs

### Add a New MCP

```bash
cd /Users/hamzaammar/Documents/Code/mcp-workspace

# Create new MCP directory
mkdir my-new-mcp
cd my-new-mcp

# Initialize
npm init -y

# Add to ecosystem.config.cjs
# Edit: ../ecosystem.config.cjs
# Add new app config similar to mcp-d2l

# Build and deploy
cd ..
npm run build-all
bash scripts/sync-to-ec2.sh
```

### View Status

```bash
# Local
npm run status

# Remote (on EC2)
npm run logs      # View all logs
pm2 logs mcp-d2l  # View specific MCP logs
npm run status    # List all processes
```

### Stop/Restart

```bash
# All MCPs
npm run stop-all
npm run restart-all

# Single MCP
pm2 stop mcp-d2l
pm2 restart mcp-d2l
```

## Ports

Each MCP should use a different port. Edit in each MCP's code:

- D2L MCP: Port 3000 (default)
- Next MCP: Port 3001
- Another: Port 3002

Configure in each MCP's `.env` or source code.

## Troubleshooting

**Sessions expire quickly?**
- Check "Trust this device" during 2FA
- Sessions typically last 24 hours

**MCP won't start?**
- Check logs: `pm2 logs mcp-d2l`
- Verify .env file exists in MCP directory
- Run `npm run build-all` after code changes

**Can't connect from Poke?**
- Ensure EC2 security group allows your IP on required ports
- Verify MCP is running: `npm run status`
- Check firewall rules on EC2
