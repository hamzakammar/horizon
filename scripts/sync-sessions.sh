#!/bin/bash
# Sync browser sessions from local to EC2

set -e

EC2_HOST="ec2-user@3.93.185.101"
KEY_PATH="~/.ssh/PokeIntegrations"

echo "🔐 Syncing browser sessions to EC2..."

# Sync D2L session if it exists
if [ -d ~/.d2l-session ]; then
  echo "📦 Packaging D2L session..."
  tar --exclude='.DS_Store' -czf /tmp/d2l-session.tar.gz -C ~ .d2l-session/
  
  echo "⬆️  Uploading to EC2..."
  rsync -avz -e "ssh -i $KEY_PATH" /tmp/d2l-session.tar.gz $EC2_HOST:~/
  
  echo "📂 Extracting on EC2..."
  ssh -i $KEY_PATH $EC2_HOST "cd ~ && tar -xzf d2l-session.tar.gz && rm d2l-session.tar.gz"
  
  rm /tmp/d2l-session.tar.gz
  echo "✅ D2L session synced!"
else
  echo "⚠️  No D2L session found. Run: npm run auth-d2l"
fi

# Add more session syncs here for other MCPs
# Example:
# if [ -d ~/.another-mcp-session ]; then
#   tar -czf /tmp/another-session.tar.gz -C ~ .another-mcp-session/
#   rsync -avz -e "ssh -i $KEY_PATH" /tmp/another-session.tar.gz $EC2_HOST:~/
#   ssh -i $KEY_PATH $EC2_HOST "cd ~ && tar -xzf another-session.tar.gz"
#   rm /tmp/another-session.tar.gz
# fi

echo ""
echo "✅ All sessions synced!"
