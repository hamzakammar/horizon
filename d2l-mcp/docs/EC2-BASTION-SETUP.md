# EC2 Bastion Setup (for RDS Access)

Use an EC2 instance as a secure jump host to connect to your private RDS database.

---

## Step 1: Create EC2 Instance

### Via AWS Console:

1. **EC2** → **Launch Instance**

2. **Name**: `study-mcp-bastion`

3. **AMI**: Amazon Linux 2023 (or Ubuntu 22.04)

4. **Instance type**: `t2.micro` (free tier eligible)

5. **Key pair**: 
   - Create new key pair
   - Name: `study-mcp-bastion-key`
   - Key pair type: RSA
   - Private key file format: `.pem`
   - **Download and save the `.pem` file** (you'll need it!)

6. **Network settings**:
   - VPC: Same VPC as your RDS instance
   - Subnet: Any public subnet (for SSH access)
   - Auto-assign public IP: **Enable**
   - Security group: Create new
     - Name: `study-mcp-bastion-sg`
     - Inbound rules:
       - SSH (22) from **My IP** (or your IP)
     - Outbound: All traffic (default)

7. **Storage**: 8 GB gp3 (default)

8. **Launch instance**

---

## Step 2: Update RDS Security Group

Allow EC2 → RDS connection:

1. **RDS** → `study-mcp-db` → **Connectivity & security**
2. Click the **VPC security group** link
3. **Inbound rules** → **Edit inbound rules** → **Add rule**:
   - Type: PostgreSQL
   - Source: Select the **EC2 security group** (`study-mcp-bastion-sg`)
   - Description: "Allow from bastion"
   - **Save rules**

---

## Step 3: Connect to EC2

### On Mac/Linux:

```bash
# 1. Set permissions on key file
chmod 400 ~/Downloads/study-mcp-bastion-key.pem

# 2. Get your EC2 public IP
# AWS Console → EC2 → Instances → study-mcp-bastion → Copy Public IPv4 address

# 3. SSH into EC2
ssh -i ~/Downloads/study-mcp-bastion-key.pem ec2-user@<EC2_PUBLIC_IP>
# For Ubuntu, use: ubuntu@<EC2_PUBLIC_IP>
```

### On Windows:

Use **PuTTY** or **WSL**:
- Convert `.pem` to `.ppk` with PuTTYgen
- Or use WSL and follow Mac/Linux steps

---

## Step 4: Install PostgreSQL Client on EC2

Once connected to EC2:

### For Amazon Linux 2023:
```bash
sudo dnf install -y postgresql15
```

### For Ubuntu:
```bash
sudo apt update
sudo apt install -y postgresql-client
```

---

## Step 5: Connect to RDS from EC2

```bash
# Get RDS endpoint from RDS console
# Format: study-mcp-db.xxxxx.us-east-1.rds.amazonaws.com

# Connect to RDS (RDS requires SSL)
# Option 1: Use connection string
psql "postgresql://postgres@<RDS_ENDPOINT>:5432/postgres?sslmode=require"
# Enter your RDS password when prompted

# Option 2: Use environment variable
export PGSSLMODE=require
psql -h <RDS_ENDPOINT> -U postgres -d postgres
```

---

## Step 6: Run Schema on RDS

### Option A: Copy files to EC2

**Replace these values:**
- `~/Downloads/study-mcp-bastion-key.pem` → Path to your downloaded `.pem` key file
- `<EC2_PUBLIC_IP>` → Your EC2 instance's public IP (from EC2 console)
- `ec2-user` → Use `ubuntu` if you chose Ubuntu AMI instead of Amazon Linux

**Example command (run from your project root):**

```bash
# From: /Users/hamzaammar/Documents/Code/mcp-workspace/d2l-mcp/
# Replace with your actual key path and EC2 IP

scp -i ~/Downloads/study-mcp-bastion-key.pem \
  src/study/db/schema.sql \
  ec2-user@54.123.45.67:~/

# If using Ubuntu AMI:
# scp -i ~/Downloads/study-mcp-bastion-key.pem \
#   src/study/db/schema.sql \
#   ubuntu@54.123.45.67:~/
```

**Then SSH to EC2 and run schema:**

```bash
# SSH to EC2
ssh -i ~/Downloads/study-mcp-bastion-key.pem ec2-user@<EC2_PUBLIC_IP>

# On EC2, run schema
export PGSSLMODE=require
export PGPASSWORD='<YOUR_RDS_PASSWORD>'
psql -h <RDS_ENDPOINT> -U postgres -d postgres -f schema.sql
```

### Option B: Run commands directly

```bash
# SSH into EC2
ssh -i ~/Downloads/study-mcp-bastion-key.pem ec2-user@<EC2_PUBLIC_IP>

# Connect to RDS (with SSL)
export PGSSLMODE=require
psql -h <RDS_ENDPOINT> -U postgres -d postgres

# Inside psql, run:
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
\q

# Then run schema (if you copied it)
export PGPASSWORD=<YOUR_PASSWORD>
psql -h <RDS_ENDPOINT> -U postgres -d postgres -f schema.sql
```

### Option C: Pipe from local (one-liner)

**Run from your project root directory:**

```bash
# From: /Users/hamzaammar/Documents/Code/mcp-workspace/d2l-mcp/
# Replace: key path, EC2 IP, RDS password, RDS endpoint

cat src/study/db/schema.sql | \
  ssh -i ~/Downloads/study-mcp-bastion-key.pem ec2-user@<EC2_PUBLIC_IP> \
  "export PGSSLMODE=require && export PGPASSWORD='<YOUR_PASSWORD>' && psql -h <RDS_ENDPOINT> -U postgres -d postgres"
```

**Example with real values:**
```bash
cat src/study/db/schema.sql | \
  ssh -i ~/Downloads/study-mcp-bastion-key.pem ec2-user@54.123.45.67 \
  "export PGSSLMODE=require && export PGPASSWORD='MySecurePass123!' && psql -h study-mcp-db.cunwmoma690l.us-east-1.rds.amazonaws.com -U postgres -d postgres"
```

---

## Step 7: Enable Extensions & Run Schema

Once connected to RDS:

```sql
-- Enable pgvector and pgcrypto
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Verify extensions
\dx

-- Should show: pgcrypto, vector
```

Then run the full schema (if you copied it to EC2):

```bash
export PGSSLMODE=require
export PGPASSWORD=<YOUR_PASSWORD>
psql -h <RDS_ENDPOINT> -U postgres -d postgres -f schema.sql
```

---

## Step 8: Clean Up (Optional)

After setup, you can:

1. **Stop the EC2 instance** (not terminate) - saves money, can restart later
2. **Or terminate** if you won't need it again
3. **Keep it running** if you'll need ongoing DB access

**Note**: EC2 t2.micro is free tier eligible (750 hours/month for first year), so keeping it running is fine.

---

## Troubleshooting

### Can't SSH to EC2:
- Check security group allows SSH (22) from your IP
- Verify key file permissions: `chmod 400 key.pem`
- Check EC2 has public IP assigned

### Can't connect to RDS from EC2:
- **Use SSL**: Set `export PGSSLMODE=require` before psql, or use connection string `postgresql://user@host/db?sslmode=require`
- Verify RDS security group allows PostgreSQL (5432) from EC2 security group
- Check RDS and EC2 are in same VPC
- Verify RDS endpoint is correct
- Check password is correct (reset in RDS console if needed)

### psql command not found:
- Install PostgreSQL client (see Step 4)

---

## Quick Reference

```bash
# SSH to EC2
ssh -i ~/path/to/key.pem ec2-user@<EC2_IP>

# Connect to RDS from EC2 (with SSL)
export PGSSLMODE=require
psql -h <RDS_ENDPOINT> -U postgres -d postgres

# Copy file to EC2
scp -i ~/path/to/key.pem file.sql ec2-user@<EC2_IP>:~/

# Run SQL file on RDS (with SSL and password)
export PGSSLMODE=require
export PGPASSWORD=<YOUR_PASSWORD>
psql -h <RDS_ENDPOINT> -U postgres -d postgres -f file.sql
```
