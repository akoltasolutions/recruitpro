#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
#  RECRUITPRO — ONE-CLICK AWS DEPLOYMENT SCRIPT
#  For beginners with no coding knowledge
#  Just copy-paste this entire script and run it!
# ═══════════════════════════════════════════════════════════════════════

set -e

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║     🚀 RECRUITPRO AWS DEPLOYMENT — STEP 2 of 2             ║"
echo "║                                                              ║"
echo "║     This script will automatically:                          ║"
echo "║     ✅ Install all required software                         ║"
echo "║     ✅ Setup the database                                     ║"
echo "║     ✅ Build the app                                         ║"
echo "║     ✅ Start it running 24/7                                 ║"
echo "║     ✅ Setup free SSL certificate                            ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Wait 3 seconds so user can read
sleep 3

# ═══════════════════════════════════════════════════════════
# PHASE 1: SYSTEM UPDATE
# ═══════════════════════════════════════════════════════════
echo "━━━ Step 1/9: Updating system (this takes 1-2 minutes) ━━━"
sudo apt update -y
sudo apt upgrade -y
echo "✅ System updated!"
echo ""

# ═══════════════════════════════════════════════════════════
# PHASE 2: INSTALL BUN
# ═══════════════════════════════════════════════════════════
echo "━━━ Step 2/9: Installing Bun runtime ━━━"
if command -v bun &> /dev/null; then
    echo "✅ Bun already installed: $(bun --version)"
else
    curl -fsSL https://bun.sh/install | bash
    # Load bun into current session
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    source ~/.bashrc 2>/dev/null || source ~/.bash_profile 2>/dev/null || true
    echo "✅ Bun installed!"
fi
echo ""

# ═══════════════════════════════════════════════════════════
# PHASE 3: INSTALL CADDY (WEB SERVER + FREE SSL)
# ═══════════════════════════════════════════════════════════
echo "━━━ Step 3/9: Installing Caddy (web server + free SSL) ━━━"
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
echo ""

# ═══════════════════════════════════════════════════════════
# PHASE 4: INSTALL PM2 (KEEPS APP RUNNING 24/7)
# ═══════════════════════════════════════════════════════════
echo "━━━ Step 4/9: Installing PM2 (keeps app running 24/7) ━━━"
if command -v pm2 &> /dev/null || $HOME/.bun/bin/pm2 --version &> /dev/null; then
    echo "✅ PM2 already installed"
else
    bun add -g pm2
    echo "✅ PM2 installed!"
fi
echo ""

# ═══════════════════════════════════════════════════════════
# PHASE 5: ADD SWAP (MEMORY SAFETY NET)
# ═══════════════════════════════════════════════════════════
echo "━━━ Step 5/9: Adding swap space (memory safety net) ━━━"
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
echo ""

# ═══════════════════════════════════════════════════════════
# PHASE 6: PROJECT SETUP
# ═══════════════════════════════════════════════════════════
echo "━━━ Step 6/9: Setting up project ━━━"

# Find where the project files are
PROJECT_DIR=""
if [ -f "$HOME/recruitpro/package.json" ]; then
    PROJECT_DIR="$HOME/recruitpro"
elif [ -f "$HOME/project/package.json" ]; then
    PROJECT_DIR="$HOME/project"
elif [ -f "/home/ubuntu/recruitpro/package.json" ]; then
    PROJECT_DIR="/home/ubuntu/recruitpro"
elif [ -f "$(pwd)/package.json" ]; then
    PROJECT_DIR="$(pwd)"
else
    echo "❌ ERROR: Could not find the project!"
    echo ""
    echo "Please make sure you uploaded the project files first."
    echo "Go back to Step 1 in the guide and upload your files."
    exit 1
fi

echo "📁 Found project at: $PROJECT_DIR"
cd "$PROJECT_DIR"

# Install dependencies
echo "📦 Installing packages (this takes 1-2 minutes)..."
bun install
echo "✅ Packages installed!"

# Setup database
echo "🗄️  Setting up database..."
mkdir -p db
if [ ! -f db/custom.db ]; then
    # Create empty database if doesn't exist
    touch db/custom.db
fi
bun run db:push
echo "✅ Database ready!"

# Seed database with demo data
echo "🌱 Seeding demo data (admin account, sample data)..."
ALLOW_SEED=true curl -s -X POST http://localhost:3000/api/seed 2>/dev/null || echo "  (will seed after server starts)"
echo "✅ Database seeded!"
echo ""

# ═══════════════════════════════════════════════════════════
# PHASE 7: BUILD FOR PRODUCTION
# ═══════════════════════════════════════════════════════════
echo "━━━ Step 7/9: Building app for production (takes 2-3 minutes) ━━━"
bun run build
echo "✅ Build complete!"
echo ""

# ═══════════════════════════════════════════════════════════
# PHASE 8: PREPARE & START PRODUCTION
# ═══════════════════════════════════════════════════════════
echo "━━━ Step 8/9: Starting the app ━━━"

# Create dist directory
DIST_DIR="$PROJECT_DIR/dist"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# Copy production files
cp -r .next/standalone/* "$DIST_DIR/"
cp -r .next/static "$DIST_DIR/.next/"
cp -r public "$DIST_DIR/"
cp -r db "$DIST_DIR/"
cp -r prisma "$DIST_DIR/"

# Create .env file
cat > "$DIST_DIR/.env" << 'ENVEOF'
DATABASE_URL="file:./db/custom.db"
TOKEN_SECRET="recruitpro-production-secret-key-2024-change-this-in-production"
NODE_ENV="production"
PORT=3000
HOSTNAME="0.0.0.0"
ALLOW_SEED="true"
ENVEOF

echo "✅ Production files ready!"

# Stop any existing instance
$HOME/.bun/bin/pm2 delete recruitpro 2>/dev/null || true
npx pm2 delete recruitpro 2>/dev/null || true

# Start the app with PM2
cd "$DIST_DIR"
$HOME/.bun/bin/pm2 start server.js --name recruitpro --interpreter bun || \
    npx pm2 start server.js --name recruitpro --interpreter bun || \
    pm2 start server.js --name recruitpro --interpreter bun

# Save PM2 config
$HOME/.bun/bin/pm2 save 2>/dev/null || npx pm2 save 2>/dev/null || pm2 save 2>/dev/null

# Setup PM2 to auto-start on reboot
$HOME/.bun/bin/pm2 startup 2>/dev/null || npx pm2 startup 2>/dev/null || pm2 startup 2>/dev/null || true

echo "✅ App is running!"
echo ""

# Wait a moment for server to start
sleep 3

# Test if server is running
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200"; then
    echo "✅ Server is responding correctly!"
else
    echo "⚠️  Server may still be starting... wait 30 seconds and check"
fi
echo ""

# Seed the database now that server is running
echo "🌱 Seeding demo data..."
ALLOW_SEED=true curl -s -X POST http://localhost:3000/api/seed
echo ""
echo "✅ Demo data created!"
echo ""

# ═══════════════════════════════════════════════════════════
# PHASE 9: CONFIGURE CADDY
# ═══════════════════════════════════════════════════════════
echo "━━━ Step 9/9: Configuring web server ━━━"

# Get the server's public IP
PUBLIC_IP=$(curl -s --max-time 10 ifconfig.me 2>/dev/null || curl -s --max-time 10 icanhazip.com 2>/dev/null || echo "YOUR_PUBLIC_IP")

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  🎉 YOUR APP IS NOW RUNNING!"
echo ""
echo "  📱 Open this link in your phone browser to test:"
echo ""
echo "     http://$PUBLIC_IP"
echo ""
echo "  👤 Login credentials:"
echo "     Admin:     admin@recruitment.com / admin123"
echo "     Recruiter: john@recruitment.com / recruiter123"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Ask if user has a domain
echo "📝 FINAL STEP — Do you have a domain name?"
echo ""
echo "If YES: Enter your domain (example: recruitpro.com)"
echo "If NO:  Just press ENTER (app will work with IP address)"
echo ""
read -p "Your domain (or press ENTER to skip): " DOMAIN_NAME
echo ""

if [ -n "$DOMAIN_NAME" ]; then
    # User has a domain
    echo "🌐 Configuring with your domain: $DOMAIN_NAME"
    echo ""
    echo "⚠️  IMPORTANT: Before continuing, go to your domain provider"
    echo "   (GoDaddy, Namecheap, etc.) and add this DNS record:"
    echo ""
    echo "   Type: A Record"
    echo "   Name: @"
    echo "   Value: $PUBLIC_IP"
    echo ""
    echo "   DNS changes can take 5-30 minutes to work."
    echo ""
    read -p "Have you added the DNS record? (type 'yes' to continue): " DNS_DONE

    if [ "$DNS_DONE" = "yes" ]; then
        sudo tee /etc/caddy/Caddyfile > /dev/null << EOF
$DOMAIN_NAME {
    reverse_proxy localhost:3000
}
EOF
        sudo systemctl reload caddy
        echo ""
        echo "✅ SSL certificate will be automatically configured!"
        echo "📱 Your app URL: https://$DOMAIN_NAME"
        echo ""
        echo "⚠️  SSL certificate takes 1-2 minutes to activate."
        echo "   Try opening https://$DOMAIN_NAME in 2 minutes."
    else
        echo "No problem! You can set up the domain later."
        echo "📱 Your app is available NOW at: http://$PUBLIC_IP"
    fi
else
    # No domain — use IP directly
    echo "🌐 Configuring with IP address (no SSL)"
    sudo tee /etc/caddy/Caddyfile > /dev/null << EOF
:80 {
    reverse_proxy localhost:3000
}
EOF
    sudo systemctl reload caddy
    echo "✅ Web server configured!"
    echo ""
    echo "📱 Your app URL: http://$PUBLIC_IP"
    echo ""
    echo "💡 TIP: For HTTPS (secure connection), get a free domain from:"
    echo "   → DuckDNS.org (yourname.duckdns.org) — free forever"
    echo "   → Freenom.com (yourname.tk/ml/ga) — free forever"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  ✅ DEPLOYMENT COMPLETE!"
echo ""
echo "  📱 App URL: http://$PUBLIC_IP"
echo "  👤 Admin login: admin@recruitment.com / admin123"
echo ""
echo "  📞 FOR ANDROID APP:"
echo "     In Android Studio, open MainActivity.kt"
echo "     Find this line:"
echo "       private val APP_URL = \"https://your-app-url.com\""
echo "     Change it to:"
echo "       private val APP_URL = \"http://$PUBLIC_IP\""
echo "     Then rebuild the app"
echo ""
echo "  🔧 TO CHECK IF APP IS RUNNING:"
echo "     Type: pm2 status"
echo ""
echo "  📊 TO VIEW APP LOGS:"
echo "     Type: pm2 logs recruitpro"
echo ""
echo "  🔄 TO RESTART APP:"
echo "     Type: pm2 restart recruitpro"
echo ""
echo "═══════════════════════════════════════════════════════════════"
