#!/bin/bash
# Deploy d2l-mcp backend to ECS Fargate

set -e

ECR_REPO="051140201449.dkr.ecr.us-east-1.amazonaws.com/study-mcp-backend"
CLUSTER="study-mcp-cluster"
SERVICE="study-mcp-backend"
REGION="us-east-1"

echo "🚀 Building and deploying backend to ECS..."

# Step 1: Build TypeScript
echo "📦 Building TypeScript..."
cd "$(dirname "$0")/.."
npm run build

# Step 2: Login to ECR
echo "🔐 Logging into ECR..."
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin $ECR_REPO

# Step 3: Build and push Docker image for linux/amd64 (ECS Fargate requirement)
echo "🐳 Building Docker image for linux/amd64..."
# Create buildx builder if it doesn't exist, reuse if it does
docker buildx inspect multiarch-builder &>/dev/null \
  && docker buildx use multiarch-builder \
  || docker buildx create --use --name multiarch-builder

# Build directly for linux/amd64 and push to ECR (more efficient)
echo "📤 Building and pushing to ECR..."
docker buildx build \
  --platform linux/amd64 \
  --tag $ECR_REPO:latest \
  --push \
  .

# Step 5: Register updated task definition
echo "📋 Registering task definition..."
aws ecs register-task-definition \
  --cli-input-json file://task-definition.json \
  --region $REGION

# Step 6: Force new deployment with latest task definition
echo "🔄 Forcing new ECS deployment..."
aws ecs update-service \
  --cluster $CLUSTER \
  --service $SERVICE \
  --task-definition study-mcp-backend \
  --force-new-deployment \
  --region $REGION

echo ""
echo "✅ Deployment initiated!"
echo ""
echo "Watch the deployment:"
echo "  aws ecs describe-services --cluster $CLUSTER --services $SERVICE --region $REGION"
echo ""
echo "View logs:"
echo "  aws logs tail /ecs/study-mcp-backend --follow --region $REGION"
