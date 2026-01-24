# AWS Deployment Guide

## Overview

Deploy the app-first backend to AWS:
- **RDS Postgres** (pgvector) for embeddings + metadata
- **S3** for PDF storage
- **Cognito** for auth
- **ECS Fargate** (or Lambda) for the backend service

## Quick Start Options

### Option A: Already using Supabase?
If you have Supabase, skip RDS setup:
1. Run migration on your Supabase: `psql $DATABASE_URL -f src/study/db/migrations/001_add_user_id.sql`
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Secrets Manager
3. Continue with S3 + Cognito + ECS steps below

### Option B: Full AWS Setup
Follow steps 1-6 below (RDS → S3 → Cognito → ECS)

### Option C: Test Locally First
```bash
# Skip AWS for now, test with local env
export SKIP_JWT_AUTH=1
export MCP_USER_ID=test-user
export SUPABASE_URL=...
export SUPABASE_ANON_KEY=...
npm run build && npm start
```

---

## Step 1: Database (RDS Postgres + pgvector)

### Create RDS Instance

**⚠️ Recommended: Use AWS Console** (handles subnet groups automatically):

1. Go to **RDS** → **Create database**
2. **Engine**: PostgreSQL (latest 15.x)
3. **Template**: Free tier (or Production for non-dev)
4. **DB instance identifier**: `study-mcp-db`
5. **Master username**: `postgres`
6. **Master password**: Set a secure password (save it!)
7. **DB instance class**: `db.t3.micro` (or `db.t4g.micro` for ARM)
8. **Storage**: 20 GB gp3
9. **VPC**: Default VPC (or your VPC)
10. **Subnet group**: Default (Console creates if needed)
11. **Public access**: **No** (private)
12. **Security group**: Create new
   - Name: `study-mcp-db-sg`
   - Inbound rule: PostgreSQL (5432) from your IP or VPC CIDR
13. **Database name**: `postgres` (or leave default)
14. **Backup**: Enable (7 days retention)
15. **Create database**

**Or via CLI** (requires subnet group setup first):

```bash
# 1. Get your default VPC ID
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text)

# 2. Get subnets in that VPC (need at least 2 in different AZs)
SUBNETS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query "Subnets[*].SubnetId" --output text)
SUBNET_1=$(echo $SUBNETS | cut -d' ' -f1)
SUBNET_2=$(echo $SUBNETS | cut -d' ' -f2)

# 3. Create DB subnet group
aws rds create-db-subnet-group \
  --db-subnet-group-name study-mcp-subnet-group \
  --db-subnet-group-description "Subnet group for study-mcp RDS" \
  --subnet-ids $SUBNET_1 $SUBNET_2

# 4. Create security group (if needed)
SG_ID=$(aws ec2 create-security-group \
  --group-name study-mcp-db-sg \
  --description "Security group for study-mcp RDS" \
  --vpc-id $VPC_ID \
  --query 'GroupId' --output text)

# 5. Allow your IP (replace with your IP or VPC CIDR)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 5432 \
  --cidr 0.0.0.0/0  # ⚠️ Change to your IP/VPC for security

# 6. Create RDS instance
aws rds create-db-instance \
  --db-instance-identifier study-mcp-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 15.4 \
  --master-username postgres \
  --master-user-password <SECURE_PASSWORD> \
  --allocated-storage 20 \
  --storage-type gp3 \
  --vpc-security-group-ids $SG_ID \
  --db-subnet-group-name study-mcp-subnet-group \
  --backup-retention-period 7
```

### Enable pgvector Extension

1. Connect to RDS (via bastion or VPN):
```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

2. Run schema:
```bash
psql -h <RDS_ENDPOINT> -U postgres -d postgres -f src/study/db/schema.sql
```

3. If migrating existing DB, run:
```bash
psql -h <RDS_ENDPOINT> -U postgres -d postgres -f src/study/db/migrations/001_add_user_id.sql
```

### Connection String

```
DATABASE_URL=postgresql://postgres:<PASSWORD>@<RDS_ENDPOINT>:5432/postgres
```

**Note**: For Supabase users, you can keep using Supabase (it's Postgres + pgvector). Just update `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

---

## Step 2: S3 Bucket

### Create Bucket

```bash
aws s3 mb s3://study-mcp-notes-<YOUR-ACCOUNT-ID> --region us-east-1
```

### Bucket Policy (for presigned URLs)

The default bucket policy allows presigned URLs. Optionally restrict:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowPresignedUploads",
      "Effect": "Allow",
      "Principal": "*",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::study-mcp-notes-*/*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-server-side-encryption": "AES256"
        }
      }
    }
  ]
}
```

### CORS (if needed for direct browser uploads)

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

### Env

```
S3_BUCKET=study-mcp-notes-<YOUR-ACCOUNT-ID>
AWS_REGION=us-east-1
```

**IAM Role** (for ECS/Lambda): Needs `s3:PutObject`, `s3:GetObject` on the bucket.

---

## Step 3: Cognito User Pool

### Create User Pool

**Recommended: Use AWS Console** (easier):

1. Go to **Cognito** → **User Pools** → **Create user pool**
2. **Sign-in options**: Email
3. **Password policy**: Minimum 8 characters, require uppercase, lowercase, numbers
4. **MFA**: Optional (can enable later)
5. **App integration**:
   - Create app client
   - App client name: `study-mcp-app`
   - **No client secret** (for public mobile apps)
6. **Review and create**
7. **Save**: User Pool ID and App Client ID

**Or via CLI** (more complex, requires JSON file):

Create `cognito-pool.json`:
```json
{
  "PoolName": "study-mcp-users",
  "Policies": {
    "PasswordPolicy": {
      "MinimumLength": 8,
      "RequireUppercase": true,
      "RequireLowercase": true,
      "RequireNumbers": true,
      "RequireSymbols": false
    }
  },
  "AutoVerifiedAttributes": ["email"],
  "Schema": [
    {
      "Name": "email",
      "AttributeDataType": "String",
      "Required": true
    }
  ]
}
```

Then:
```bash
aws cognito-idp create-user-pool --cli-input-json file://cognito-pool.json
aws cognito-idp create-user-pool-client \
  --user-pool-id <POOL_ID> \
  --client-name study-mcp-app \
  --no-generate-secret
```

**Console is recommended**:
1. Cognito → User Pools → Create
2. Sign-in options: Email
3. Password policy: 8+ chars
4. MFA: Optional
5. App integration → Create app client (no secret for public clients)
6. Note: **User Pool ID** and **App Client ID**

### Env

```
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxx
```

### Test User (for dev)

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <POOL_ID> \
  --username test@example.com \
  --user-attributes Name=email,Value=test@example.com \
  --message-action SUPPRESS

aws cognito-idp admin-set-user-password \
  --user-pool-id <POOL_ID> \
  --username test@example.com \
  --password TempPass123! \
  --permanent
```

---

## Step 4: Deploy Backend (ECS Fargate)

### Dockerfile

Create `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY dist ./dist
COPY scripts ./scripts

ENV NODE_ENV=production
ENV MCP_TRANSPORT=http

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### Build & Push to ECR

```bash
# Create ECR repo
aws ecr create-repository --repository-name study-mcp-backend --region us-east-1

# Login
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Build
docker build -t study-mcp-backend .

# Tag & push
docker tag study-mcp-backend:latest <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/study-mcp-backend:latest
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/study-mcp-backend:latest
```

### ECS Task Definition

Create `task-definition.json`:

```json
{
  "family": "study-mcp-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::<ACCOUNT_ID>:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::<ACCOUNT_ID>:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "backend",
      "image": "<ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/study-mcp-backend:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        { "name": "MCP_TRANSPORT", "value": "http" },
        { "name": "MCP_PORT", "value": "3000" },
        { "name": "NODE_ENV", "value": "production" }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:study-mcp/db-url"
        },
        {
          "name": "COGNITO_USER_POOL_ID",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:study-mcp/cognito-pool-id"
        },
        {
          "name": "COGNITO_CLIENT_ID",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:study-mcp/cognito-client-id"
        },
        {
          "name": "S3_BUCKET",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:study-mcp/s3-bucket"
        },
        {
          "name": "AWS_REGION",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:study-mcp/aws-region"
        },
        {
          "name": "OPENAI_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:study-mcp/openai-key"
        },
        {
          "name": "SUPABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:study-mcp/supabase-url"
        },
        {
          "name": "SUPABASE_SERVICE_ROLE_KEY",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:study-mcp/supabase-key"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/study-mcp-backend",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### IAM Roles

**Task Execution Role** (`ecsTaskExecutionRole`):
- `ecr:GetAuthorizationToken`, `ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer`
- `logs:CreateLogStream`, `logs:PutLogEvents`
- `secretsmanager:GetSecretValue`

**Task Role** (`ecsTaskRole`):
- `s3:PutObject`, `s3:GetObject` on the notes bucket
- (No RDS permissions needed if using connection string in secret)

### ECS Service + ALB

1. **Create ECS Cluster**:
```bash
aws ecs create-cluster --cluster-name study-mcp-cluster
```

2. **Register Task Definition**:
```bash
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

3. **Create ALB** (Application Load Balancer):
   - Target group: port 3000, health check `/health`
   - Listener: HTTPS (443) → target group

4. **Create ECS Service**:
```bash
aws ecs create-service \
  --cluster study-mcp-cluster \
  --service-name study-mcp-backend \
  --task-definition study-mcp-backend \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...:targetgroup/...,containerName=backend,containerPort=3000"
```

---

## Step 5: Secrets Manager

Store sensitive values:

```bash
aws secretsmanager create-secret --name study-mcp/db-url --secret-string "postgresql://..."
aws secretsmanager create-secret --name study-mcp/cognito-pool-id --secret-string "us-east-1_XXX"
aws secretsmanager create-secret --name study-mcp/cognito-client-id --secret-string "xxx"
aws secretsmanager create-secret --name study-mcp/s3-bucket --secret-string "study-mcp-notes-xxx"
aws secretsmanager create-secret --name study-mcp/aws-region --secret-string "us-east-1"
aws secretsmanager create-secret --name study-mcp/openai-key --secret-string "sk-..."
aws secretsmanager create-secret --name study-mcp/supabase-url --secret-string "https://xxx.supabase.co"
aws secretsmanager create-secret --name study-mcp/supabase-key --secret-string "eyJ..."
```

---

## Step 6: Test Deployment

### Health Check

```bash
curl https://<ALB_DNS>/health
# Should return: {"ok":true}
```

### Test Auth (with Cognito token)

```bash
# Get ID token (from Cognito auth flow)
TOKEN="eyJraWQ..."

curl -H "Authorization: Bearer $TOKEN" \
  https://<ALB_DNS>/api/dashboard
```

### Test Presign

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.pdf","contentType":"application/pdf","size":1024}' \
  https://<ALB_DNS>/api/notes/presign-upload
```

---

## Alternative: Lambda + API Gateway

For serverless:

1. **Lambda function** (Node 20, ~512MB):
   - Handler: `dist/index.handler` (wrap Express with `@vendia/serverless-express`)
   - Timeout: 30s (for PDF processing)
   - Env vars: Same as ECS

2. **API Gateway** (HTTP API or REST):
   - Routes: `/*` → Lambda
   - Auth: Cognito authorizer (or pass through to Lambda)

3. **VPC** (if Lambda needs RDS):
   - Attach Lambda to VPC with RDS subnet
   - Security group allows Lambda → RDS

---

## Cost Estimate (MVP)

- **RDS t3.micro**: ~$15/month
- **S3** (100GB): ~$2.30/month
- **ECS Fargate** (0.25 vCPU, 0.5GB, 24/7): ~$7/month
- **ALB**: ~$16/month
- **Cognito**: Free tier (50k MAU)
- **Secrets Manager**: ~$0.40/month per secret

**Total**: ~$40-50/month for MVP

**Lambda alternative**: ~$5-10/month (pay per request)

---

## Next Steps After Deployment

1. **Run migration** on RDS (if not already done)
2. **Test full flow**: presign → upload → process → search
3. **Set up monitoring**: CloudWatch alarms for errors, latency
4. **Add CI/CD**: GitHub Actions → ECR → ECS update
5. **Build Expo app** against `https://<ALB_DNS>/api/*`

---

## Troubleshooting

- **502 Bad Gateway**: Check ECS task logs, health check path
- **401 Unauthorized**: Verify Cognito token, check `COGNITO_USER_POOL_ID`
- **503 S3 not configured**: Check `S3_BUCKET`, `AWS_REGION` env vars
- **DB connection errors**: Verify security groups, `DATABASE_URL` format
- **Embedding failures**: Check `OPENAI_API_KEY` is set
