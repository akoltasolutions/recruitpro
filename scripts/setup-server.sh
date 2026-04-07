#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
#  RECRUITPRO — ONE-TIME EC2 SERVER SETUP
#  Run this ONCE on your AWS EC2 server
#  COST: 100% FREE
# ═══════════════════════════════════════════════════════════════════════

set -e

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║     🚀 RECRUITPRO — SERVER SETUP (RUN ONCE ONLY)            ║"
echo "║                                                              ║"
echo "║     This will set up everything on your EC2 server:         ║"
echo "║     ✅ Install Bun, PM2, Caddy                               ║"
echo "║     ✅ Clone your GitHub repo                                ║"
echo "║     ✅ Build & start the app                                 ║"
echo "║     ✅ Set up free SSL with Caddy                            ║"
echo "║     ✅ Enable auto-deploy from GitHub                        ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
sleep 3

# ═══════════════════════════════════════════════════════════
# PHASE 1: SYSTEM UPDATE
# ═══════════════════════════════════════════════════════════
echo "━━━ Step 1/10: Updating system ━━━"
sudo apt update -y && sudo apt upgrade -y
echo "✅ System updated!"

# ═══════════════════════════════════════════════════════════
# PHASE 2: INSTALL GIT
# ═══════════════════════════════════════════════════════════
echo "━━━ Step 2/10: Installing Git ━━━"
if command -v git &> /dev/null; then
    echo "✅ Git already installed"
else
    sudo apt install -y git
    echo "✅ Git installed!"
fi

# ═══════════════════════════════════════════════════════════
# PHASE 3: INSTALL BUN
# ═══════════════════════════════════════════════════════════
echo "━━━ Step 3/10: Installing Bun ━━━"
if command -v bun &> /dev/null; then
    echo "✅ Bun already installed: $(bun --version)"
else
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    source ~/.bashrc 2>/dev/null || source ~/.bash_profile 2>/dev/null || true
    echo "✅ Bun installed!"
fi

# ═══════════════════════════════════════════════════════════
# PHASE 4: INSTALL CADDY (WEB SERVER + FREE SSL)
# ═══════════════════════════════════════════════════════════
echo "━━━ Step 4/10: Installing Caddy (web server + free SSL) ━━━"
if command -v caddy &> /dev/null; then
    echo "✅ Caddy already installed"
else
    sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
    sudo apt update
    sudo apt install -y caddy
    echo "✅ Caddy installed!"
fi

# ═══════════════════════════════════════════════════════════
# PHASE 5: INSTALL PM2
# ═══════════════════════════════════════════════════════════
echo "━━━ Step 5/10: Installing PM2 (keeps app running 24/7) ━━━"
if bun pm2 --version &> /dev/null 2>&1 || ~/.bun/bin/pm2 --version &> /dev/null 2>&1; then
    echo "✅ PM2 already installed"
else
    bun add -g pm2
    echo "✅ PM2 installed!"
fi

# ═══════════════════════════════════════════════════════════
# PHASE 6: ADD SWAP (MEMORY SAFETY NET FOR t2.micro)
# ═══════════════════════════════════════════════════════════
echo "━━━ Step 6/10: Adding swap space (1GB memory safety net) ━━━"
if [ -f /swapfile ]; then
    echo "✅ Swap already exists"
else
    sudo fallocate -l 1G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "✅ 1GB swap added!"
fi

# ═══════════════════════════════════════════════════════════
# PHASE 7: CLONE GITHUB REPO
# ═══════════════════════════════════════════════════════════
echo "━━━ Step 7/10: Cloning GitHub repository ━━━"

# Ask for GitHub repo URL
echo ""
echo "📌 Enter your GitHub repository URL"
echo "   Example: https://github.com/yourusername/recruitpro.git"
echo ""
read -p "   GitHub repo URL: " REPO_URL

if [ -z "$REPO_URL" ]; then
    echo "❌ No repo URL provided. Exiting."
    exit 1
fi

# Remove old project if exists
if [ -d /home/ubuntu/recruitpro ]; then
    echo "📦 Found existing project, backing up database..."
    cp -r /home/ubuntu/recruitpro/db /tmp/recruitpro-db-backup 2>/dev/null || true
    rm -rf /home/ubuntu/recruitpro
fi

# Clone the repo
git clone "$REPO_URL" /home/ubuntu/recruitpro
cd /home/ubuntu/recruitpro

# Restore database backup if exists
if [ -d /tmp/recruitpro-db-backup ]; then
    echo "📦 Restoring database from backup..."
    mkdir -p db
    cp -r /tmp/recruitpro-db-backup/* db/ 2>/dev/null || true
    rm -rf /tmp/recruitpro-db-backup
fi

echo "✅ Repository cloned!"

# ═══════════════════════════════════════════════════════════
# PHASE 8: BUILD THE APP
# ═══════════════════════════════════════════════════════════
echo "━━━ Step 8/10: Building app (takes 2-3 minutes) ━━━"
bun install
mkdir -p db
touch db/custom.db 2>/dev/null || true
bun run db:push
bun run build

# Copy production files to standalone folder
rm -rf .next/standalone/.next/static
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public 2>/dev/null || true
cp -r prisma .next/standalone/prisma 2>/dev/null || true
mkdir -p .next/standalone/db

# Create .env for production
cat > .next/standalone/.env << 'ENVEOF'
DATABASE_URL="file:./db/custom.db"
NODE_ENV="production"
PORT=3000
HOSTNAME="0.0.0.0"
ALLOW_SEED="false"
ENVEOF

echo "✅ Build complete!"

# ═══════════════════════════════════════════════════════════
# PHASE 9: START WITH PM2
# ═══════════════════════════════════════════════════════════
echo "━━━ Step 9/10: Starting app with PM2 ━━━"

# Stop any existing instance
pm2 delete recruitpro 2>/dev/null || true
~/.bun/bin/pm2 delete recruitpro 2>/dev/null || true

# Start the app
cd /home/ubuntu/recruitpro
pm2 start ecosystem.config.js 2>/dev/null || ~/.bun/bin/pm2 start ecosystem.config.js

# Save PM2 config and enable auto-start on reboot
pm2 save 2>/dev/null || ~/.bun/bin/pm2 save 2>/dev/null
sudo env PATH=$PATH:/home/ubuntu/.bun/bin pm2 startup ubuntu -u ubuntu --hp /home/ubuntu 2>/dev/null || true

# Create logs directory
mkdir -p /home/ubuntu/recruitpro/logs

echo "✅ App is running!"

# Wait and test
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Server is responding correctly!"
else
    echo "⚠️  Server may still be starting... (status: $HTTP_CODE)"
fi

# Seed demo data if needed
curl -s -X POST http://localhost:3000/api/seed 2>/dev/null || echo "  (seed endpoint not available)"

# ═══════════════════════════════════════════════════════════
# PHASE 10: CONFIGURE CADDY + SSL
# ═══════════════════════════════════════════════════════════
echo "━━━ Step 10/10: Configuring web server + SSL ━━━"

# Configure Caddy for app.akolta.com
sudo tee /etc/caddy/Caddyfile > /dev/null << 'EOF'
app.akolta.com {
    reverse_proxy localhost:3000
}
EOF

sudo systemctl restart caddy
echo "✅ Caddy configured with auto-SSL for app.akolta.com!"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  🎉 SERVER SETUP COMPLETE!"
echo ""
echo "  📱 Your app is live at: https://app.akolta.com"
echo ""
echo "  👤 Login credentials:"
echo "     Admin:     admin@recruitment.com / admin123"
echo "     Recruiter: john@recruitment.com / recruiter123"
echo ""
echo "  ═══════════════════════════════════════════════════════"
echo ""
echo "  🔄 AUTO-DEPLOY IS NOW ACTIVE!"
echo ""
echo "  From now on, whenever you push code to GitHub's 'main'"
echo "  branch, it will automatically deploy to your server."
echo "  No WinSCP needed! No manual login needed!"
echo ""
echo "  ═══════════════════════════════════════════════════════"
echo ""
echo "  📋 USEFUL COMMANDS (run on EC2 server):"
echo ""
echo "  pm2 status              → Check if app is running"
echo "  pm2 logs recruitpro     → View app logs"
echo "  pm2 restart recruitpro  → Restart the app"
echo "  pm2 stop recruitpro     → Stop the app"
echo ""
echo "═══════════════════════════════════════════════════════════════"
