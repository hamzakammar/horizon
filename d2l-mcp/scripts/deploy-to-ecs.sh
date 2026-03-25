#!/bin/bash
# Deploy Horizon MCP to ECS Fargate — builds BOTH gateway (Go) + backend (Node)

set -e

ECR_REGISTRY="051140201449.dkr.ecr.us-east-1.amazonaws.com"
ECR_BACKEND="${ECR_REGISTRY}/study-mcp-backend"
ECR_GATEWAY="${ECR_REGISTRY}/study-mcp-gateway"
CLUSTER="study-mcp-cluster"
SERVICE="study-mcp-backend"
REGION="us-east-1"
AWS="/workspace/aws-bin/aws"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="${SCRIPT_DIR}/.."

echo "🚀 Horizon MCP — full stack deploy"
echo "   Backend ECR : ${ECR_BACKEND}"
echo "   Gateway ECR : ${ECR_GATEWAY}"
echo ""

# ── Step 1: Build TypeScript backend ─────────────────────────────────────────
echo "📦 Building TypeScript backend..."
cd "${REPO_DIR}"
npm install
npm run build

# ── Step 2: Login to ECR ──────────────────────────────────────────────────────
echo "🔐 Logging into ECR..."
${AWS} ecr get-login-password --region "${REGION}" | \
  docker login --username AWS --password-stdin "${ECR_REGISTRY}"

# ── Step 3: Ensure ECR repos exist ───────────────────────────────────────────
echo "📦 Ensuring ECR repositories exist..."
${AWS} ecr describe-repositories --repository-names study-mcp-backend --region "${REGION}" > /dev/null 2>&1 || \
  ${AWS} ecr create-repository --repository-name study-mcp-backend --region "${REGION}"

${AWS} ecr describe-repositories --repository-names study-mcp-gateway --region "${REGION}" > /dev/null 2>&1 || {
  echo "   Creating study-mcp-gateway ECR repo..."
  ${AWS} ecr create-repository --repository-name study-mcp-gateway --region "${REGION}"
}

# ── Step 4: Build + push backend image ───────────────────────────────────────
echo "🐳 Building backend Docker image (linux/amd64)..."
docker build \
  --platform linux/amd64 \
  --tag "${ECR_BACKEND}:latest" \
  "${REPO_DIR}"

echo "📤 Pushing backend image..."
docker push "${ECR_BACKEND}:latest"

# ── Step 5: Build + push gateway image ───────────────────────────────────────
echo "🐳 Building gateway Docker image (linux/amd64)..."
docker build \
  --platform linux/amd64 \
  --tag "${ECR_GATEWAY}:latest" \
  "${REPO_DIR}/gateway"

echo "📤 Pushing gateway image..."
docker push "${ECR_GATEWAY}:latest"

# ── Step 6: Register updated task definition ─────────────────────────────────
echo "📋 Registering task definition (two containers: gateway + backend)..."
${AWS} ecs register-task-definition \
  --cli-input-json "file://${REPO_DIR}/task-definition.json" \
  --region "${REGION}"

# ── Step 7: Force new ECS deployment ─────────────────────────────────────────
echo "🔄 Forcing new ECS deployment..."
${AWS} ecs update-service \
  --cluster "${CLUSTER}" \
  --service "${SERVICE}" \
  --task-definition study-mcp-backend \
  --force-new-deployment \
  --region "${REGION}"

echo ""
echo "✅ Deployment initiated!"
echo ""
echo "Monitor deployment:"
echo "  ${AWS} ecs describe-services --cluster ${CLUSTER} --services ${SERVICE} --region ${REGION}"
echo ""
echo "View logs:"
echo "  Backend : ${AWS} logs tail /ecs/study-mcp-backend --follow --region ${REGION}"
echo "  Gateway : ${AWS} logs tail /ecs/study-mcp-gateway --follow --region ${REGION}"
