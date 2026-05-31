# RecruitPro — Mumbai Server Setup Guide
## Complete Migration & Deployment Instructions

---

## ⚠️ IMPORTANT: Data Recovery from OLD Server (EU)

Before setting up the new Mumbai server, you **MUST** recover critical files from the old EU instance. These files are **NOT in GitHub**:

### Files to Recover:
| File | Location | Why Critical |
|------|----------|-------------|
| `db/custom.db` | `/home/ubuntu/recruitpro/db/custom.db` | **ALL user data, organizations, plans, call records** |
| `.env` | `/home/ubuntu/recruitpro/.env` | Production secrets (DB URL, Token Secret, Webhook Secret) |
| `Caddyfile` | `/etc/caddy/Caddyfile` | Reverse proxy config for app.akolta.com |
| `upload/` folder | `/home/ubuntu/recruitpro/upload/` | Any uploaded files |

### Recovery Options:

#### Option A: If old EU instance becomes reachable again
```bash
ssh -i "your-key.pem" ubuntu@51.21.37.18

# Download database
scp -i "your-key.pem" ubuntu@51.21.37.18:/home/ubuntu/recruitpro/db/custom.db ./custom.db

# Download .env
scp -i "your-key.pem" ubuntu@51.21.37.18:/home/ubuntu/recruitpro/.env ./env-backup

# Download uploads
scp -r -i "your-key.pem" ubuntu@51.21.37.18:/home/ubuntu/recruitpro/upload/ ./upload-backup
```

#### Option B: Use AWS Console (if SSH never works)
1. Stop the old EU instance
2. Go to **EBS Volumes** → Detach root volume
3. Attach root volume to Mumbai instance as `/dev/sdf`
4. Mount and copy data:
```bash
sudo mkdir -p /mnt/old-server
sudo mount /dev/xvdf /mnt/old-server  # or /dev/nvme1n1 on newer instances
cp -a /mnt/old-server/home/ubuntu/recruitpro/db/ /home/ubuntu/recruitpro/db/
cp /mnt/old-server/home/ubuntu/recruitpro/.env /home/ubuntu/recruitpro/.env
```

---

## 🖥️ Mumbai Server Setup (From Scratch)

### Step 1: Launch EC2 Instance
- **Region**: ap-south-1 (Mumbai)
- **AMI**: Ubuntu 24.04 LTS
- **Instance Type**: t3.small (2GB RAM, 1 vCPU) — **RECOMMENDED** over t2.micro
- **Storage**: 20GB gp3
- **Security Group**: Open ports 22 (SSH), 80 (HTTP), 443 (HTTPS)

> ⚠️ **WHY t3.small?** Your current t2.micro (911MB RAM) caused repeated OOM crashes during builds. t3.small has 2GB RAM and can build without swap.

### Step 2: Assign Elastic IP
1. Allocate new Elastic IP in ap-south-1
2. Associate with Mumbai instance
3. **Update DNS**: Point `app.akolta.com` to the new Mumbai Elastic IP

### Step 3: Connect via SSH
```bash
ssh -i "your-key.pem" ubuntu@<MUMBAI-ELASTIC-IP>
```

### Step 4: Full Server Setup (Copy-Paste Everything)

```bash
# ══════════════════════════════════════════════
# 1. System Update
# ══════════════════════════════════════════════
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git unzip nginx certbot python3-certbot-nginx

# Set timezone to India
sudo timedatectl set-timezone Asia/Kolkata

# ══════════════════════════════════════════════
# 2. Install Node.js 22 LTS
# ══════════════════════════════════════════════
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Should show v22.x
npm --version

# ══════════════════════════════════════════════
# 3. Install Bun
# ══════════════════════════════════════════════
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun --version

# ══════════════════════════════════════════════
# 4. Install PM2
# ══════════════════════════════════════════════
bun add -g pm2
pm2 startup
pm2 save

# ══════════════════════════════════════════════
# 5. Install Caddy (Reverse Proxy with Auto HTTPS)
# ══════════════════════════════════════════════
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# ══════════════════════════════════════════════
# 6. Clone the Code
# ══════════════════════════════════════════════
cd /home/ubuntu
git clone https://github.com/akoltasolutions/recruitpro.git
cd recruitpro

# ══════════════════════════════════════════════
# 7. Setup Environment
# ══════════════════════════════════════════════
# If you recovered .env from old server:
#   cp /path/to/recovered-env .env
# Otherwise create new:
cat > .env << 'ENVEOF'
DATABASE_URL="file:/home/ubuntu/recruitpro/db/custom.db"
TOKEN_SECRET="<GENERATE-A-LONG-RANDOM-STRING>"
NODE_ENV="production"
ALLOW_SEED="true"
WEBHOOK_SECRET="<GENERATE-ANOTHER-RANDOM-STRING>"
NEXTAUTH_SECRET="<GENERATE-ANOTHER-RANDOM-STRING>"
NEXTAUTH_URL="https://app.akolta.com"
ENVEOF

# Generate random secrets:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Use this output for TOKEN_SECRET, WEBHOOK_SECRET, NEXTAUTH_SECRET

# ══════════════════════════════════════════════
# 8. Restore Database (if recovered from old server)
# ══════════════════════════════════════════════
mkdir -p db logs upload
# Copy recovered database:
# cp /path/to/recovered-custom.db db/custom.db

# If NO backup available, fresh start:
# (Database will be created by Prisma on first run)

# ══════════════════════════════════════════════
# 9. Install Dependencies & Build
# ══════════════════════════════════════════════
bun install

# Sync database schema
bunx prisma db push

# Build the app
NODE_OPTIONS="--max-old-space-size=512" npx next build

# ══════════════════════════════════════════════
# 10. Start with PM2
# ══════════════════════════════════════════════
pm2 start ecosystem.config.cjs
pm2 save

# Verify it's running
sleep 10
curl http://localhost:3000

# ══════════════════════════════════════════════
# 11. Configure Caddy (Reverse Proxy + Auto SSL)
# ══════════════════════════════════════════════
sudo tee /etc/caddy/Caddyfile << 'CADDYEOF'
{
    email admin@akolta.com
}

app.akolta.com {
    reverse_proxy localhost:3000

    # Handle WebSocket connections
    @websockets {
        header Connection *Upgrade*
        header Upgrade websocket
    }
    reverse_proxy @websockets localhost:3000

    # Security headers
    header {
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }
}
CADDYEOF

# Restart Caddy to apply
sudo systemctl restart caddy
sudo systemctl enable caddy

# ══════════════════════════════════════════════
# 12. Update GitHub Actions Secret
# ══════════════════════════════════════════════
# Go to: https://github.com/akoltasolutions/recruitpro/settings/secrets/actions
# Update these secrets for Mumbai server:
#   EC2_HOST = <Mumbai Elastic IP>
#   EC2_USER = ubuntu
#   EC2_SSH_KEY = <Contents of your Mumbai SSH private key>
```

---

## 🔑 GitHub Secrets to Update

After Mumbai server is running, update your GitHub repo secrets:

1. Go to **https://github.com/akoltasolutions/recruitpro/settings/secrets/actions**
2. **Update** (or create):
   - `EC2_HOST` → Mumbai Elastic IP
   - `EC2_USER` → `ubuntu`
   - `EC2_SSH_KEY` → Paste full private key (including `-----BEGIN` lines)

---

## 📋 DNS Migration Checklist

| Step | Action |
|------|--------|
| 1 | Get Mumbai Elastic IP |
| 2 | Update `app.akolta.com` A record to Mumbai IP |
| 3 | Wait for DNS propagation (5-30 min) |
| 4 | Verify Caddy auto-issues SSL certificate |
| 5 | Test `https://app.akolta.com` |

---

## 🔍 Post-Setup Verification

```bash
# Check all services
pm2 list                          # Should show recruitpro: online
sudo systemctl status caddy        # Should show active (running)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000  # Should return 200

# Check memory (t3.small should have ~2GB)
free -h

# Check logs
pm2 logs recruitpro --lines 20
tail -f /home/ubuntu/recruitpro/logs/deploy.log
```

---

## 🆘 Troubleshooting

### Build fails on Mumbai
```bash
# t3.small has 2GB RAM — should NOT need swap
# But if needed:
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Caddy SSL not working
```bash
# Make sure DNS points to Mumbai IP first, then:
sudo systemctl restart caddy
sudo journalctl -u caddy --since "5 minutes ago"
```

### PM2 auto-start on reboot
```bash
pm2 startup
pm2 save
```
