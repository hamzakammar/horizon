# Deployment Steps for D2L Auth Refactor

## Prerequisites

1. **AWS Authentication**
   ```bash
   aws login  # or your preferred AWS auth method
   ```

2. **Verify AWS Access**
   ```bash
   aws sts get-caller-identity
   ```

3. **Verify Docker is Running**
   ```bash
   docker ps
   ```

## Deployment

### Step 1: Build TypeScript (Already Done ✅)
```bash
cd d2l-mcp
npm run build
```

### Step 2: Deploy to ECS
```bash
cd d2l-mcp
./scripts/deploy-to-ecs.sh
```

This script will:
- Build TypeScript
- Login to ECR
- Build Docker image for linux/amd64
- Push to ECR
- Force new ECS deployment

### Step 3: Monitor Deployment

**Check Service Status:**
```bash
aws ecs describe-services \
  --cluster study-mcp-cluster \
  --services study-mcp-backend \
  --region us-east-1 \
  --query 'services[0].{status:status,running:runningCount,desired:desiredCount,deployments:deployments[*].{status:status,createdAt:createdAt}}'
```

**Watch Logs:**
```bash
aws logs tail /ecs/study-mcp-backend --follow --region us-east-1
```

**Check Task Status:**
```bash
aws ecs list-tasks \
  --cluster study-mcp-cluster \
  --service-name study-mcp-backend \
  --region us-east-1
```

### Step 4: Verify Deployment

Wait for the new task to be running (usually 2-5 minutes), then:

1. **Check Health Endpoint** (if available):
   ```bash
   curl https://api.hamzaammar.ca/health
   ```

2. **Check Logs for Errors:**
   ```bash
   aws logs tail /ecs/study-mcp-backend --since 5m --region us-east-1
   ```

3. **Look for these log messages:**
   - `[AUTH] Production mode: ...` (should appear when no token exists)
   - `[AUTH] Browser launched (headless: true, ...)` (should always be headless)
   - No errors about browser launch failures

## Testing After Deployment

See `TESTING_CHECKLIST.md` for comprehensive testing steps.

### Quick Smoke Test

1. **Mobile App:**
   - Open app → Settings → Connect D2L
   - Verify only WebView option is shown
   - Complete login flow
   - Verify automatic connection

2. **API Test:**
   ```bash
   # Get auth token from mobile app or Cognito
   TOKEN="your-jwt-token"
   
   # Test status endpoint
   curl -H "Authorization: Bearer $TOKEN" \
     https://api.hamzaammar.ca/api/d2l/status
   
   # Should return: {"connected": true, "reauthRequired": false, ...}
   ```

## Troubleshooting

### Deployment Fails

1. **Check ECR Access:**
   ```bash
   aws ecr describe-repositories --region us-east-1
   ```

2. **Check ECS Service:**
   ```bash
   aws ecs describe-services \
     --cluster study-mcp-cluster \
     --services study-mcp-backend \
     --region us-east-1
   ```

3. **Check Task Definition:**
   ```bash
   aws ecs describe-task-definition \
     --task-definition study-mcp-backend \
     --region us-east-1
   ```

### Service Won't Start

1. **Check Task Logs:**
   ```bash
   # Get task ID
   TASK_ID=$(aws ecs list-tasks --cluster study-mcp-cluster --service-name study-mcp-backend --region us-east-1 --query 'taskArns[0]' --output text | cut -d'/' -f3)
   
   # Get logs
   aws logs get-log-events \
     --log-group-name /ecs/study-mcp-backend \
     --log-stream-name ecs/study-mcp-backend/$TASK_ID \
     --region us-east-1
   ```

2. **Check Task Stopped Reason:**
   ```bash
   aws ecs describe-tasks \
     --cluster study-mcp-cluster \
     --tasks $TASK_ID \
     --region us-east-1 \
     --query 'tasks[0].stoppedReason'
   ```

### Rollback

If you need to rollback to a previous version:

```bash
# Option 1: Use previous image tag
aws ecs update-service \
  --cluster study-mcp-cluster \
  --service study-mcp-backend \
  --force-new-deployment \
  --region us-east-1

# Option 2: Update task definition to use previous image
# (Edit task definition in AWS Console or via CLI)
```

## Next Steps After Successful Deployment

1. ✅ Monitor logs for first few hours
2. ✅ Test mobile app authentication flow
3. ✅ Verify API endpoints work correctly
4. ✅ Check that no headed browsers are launched
5. ✅ Verify REAUTH_REQUIRED errors are handled properly
