#!/bin/bash
# Sync all MCPs to EC2

set -e

EC2_HOST="ec2-user@3.93.185.101"
KEY_PATH="~/.ssh/PokeIntegrations"

echo "🚀 Syncing MCP workspace to EC2..."

# Create workspace directory on EC2 if it doesn't exist
ssh -i $KEY_PATH $EC2_HOST "mkdir -p ~/mcp-workspace"

# Sync entire workspace (excluding node_modules and sessions)
rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.d2l-session' \
  --exclude '*.log' \
  --exclude '.git' \
  -e "ssh -i $KEY_PATH" \
  ../ $EC2_HOST:~/mcp-workspace/

echo ""
echo "✅ Workspace synced successfully!"
echo ""
echo "Next steps on EC2:"
echo "  ssh -i $KEY_PATH $EC2_HOST"
echo "  cd ~/mcp-workspace"
echo "  npm run install-all"
echo "  npm run build-all"
echo "  npm run start-all"
