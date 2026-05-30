#!/bin/bash
# ============================================
# RecruitPro Auto-Deploy Script
# Triggered by GitHub Actions / webhook on push to main
# 
# Strategy: Quick SSH steps (git pull, deps, DB sync)
# then kicks off the build in background via nohup
# so SSH connection doesn't need to stay open.
# ============================================

set -e

# Ensure bun, pm2, node are in PATH (non-interactive SSH sessions may not load .bashrc)
export PATH="$HOME/.bun/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node/ 2>/dev/null | tail -1)/bin:/usr/local/bin:/usr/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

PROJECT_DIR="/home/ubuntu/recruitpro"
LOG_FILE="$PROJECT_DIR/logs/deploy.log"
BUILD_LOG="/tmp/recruitpro-build.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=========================================="
log "DEPLOYMENT STARTED"
log "=========================================="

# Verify tools
log "Checking tools..."
which bun >/dev/null 2>&1 && log "  bun: $(bun --version)" || { log "ERROR: bun not found"; exit 1; }
which node >/dev/null 2>&1 && log "  node: $(node --version)" || { log "ERROR: node not found"; exit 1; }
which pm2 >/dev/null 2>&1 && log "  pm2 found" || { log "ERROR: pm2 not found"; exit 1; }

cd "$PROJECT_DIR"

# Step 0: Backup .env before git reset (it is NOT in git)
log "Step 0: Backing up .env..."
if [ -f .env ]; then
    cp .env /tmp/recruitpro-env-backup
    log ".env backed up."
fi

# Step 1: Pull latest code
log "Step 1: Pulling latest code from GitHub..."
git fetch origin
git reset --hard origin/main
log "Code updated to latest version."

# Step 1b: Restore .env
log "Step 1b: Restoring .env..."
if [ -f /tmp/recruitpro-env-backup ]; then
    cp /tmp/recruitpro-env-backup .env
    rm /tmp/recruitpro-env-backup
    log ".env restored."
else
    if [ ! -f .env ]; then
        log "WARNING: No .env found! Creating default..."
        cat > .env << 'ENVEOF'
DATABASE_URL="file:/home/ubuntu/recruitpro/db/custom.db"
TOKEN_SECRET="recruitpro-prod-secret-key-2024"
NODE_ENV="production"
ALLOW_SEED="true"
WEBHOOK_SECRET="recruitpro-webhook-secret-2024"
ENVEOF
    fi
fi

# Step 2: Install dependencies
log "Step 2: Installing dependencies..."
bun install --frozen-lockfile 2>/dev/null || bun install
log "Dependencies installed."

# Step 3: Sync database
log "Step 3: Syncing database schema..."
bunx prisma db push
log "Database synced."

# Step 3b: Run tenant migration
log "Step 3b: Running tenant migration..."
if [ -f prisma/migrate-tenant.ts ]; then
    bun run prisma/migrate-tenant.ts
    log "Tenant migration complete."
else
    log "No migration script found, skipping."
fi

log "=========================================="
log "QUICK STEPS COMPLETE — starting background build"
log "SSH connection can now close safely."
log "=========================================="

# Step 4+: Build and restart in BACKGROUND (nohup) so SSH can close
# This avoids GitHub Actions / SSH timeout issues on low-memory servers
nohup bash -c '
set -e

export PATH="$HOME/.bun/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node/ 2>/dev/null | tail -1)/bin:/usr/local/bin:/usr/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

PROJECT_DIR="/home/ubuntu/recruitpro"
LOG_FILE="$PROJECT_DIR/logs/deploy.log"
BUILD_LOG="/tmp/recruitpro-build.log"

log() {
    echo "[$(date "+%Y-%m-%d %H:%M:%S")] $1" | tee -a "$LOG_FILE"
}

log "[BG BUILD] Step 4a: Stopping PM2 to free memory..."
pm2 stop recruitpro 2>/dev/null || true
sleep 2
log "[BG BUILD] PM2 stopped."

log "[BG BUILD] Step 4b: Building application (this takes 10-20 min on low-memory server)..."
rm -rf .next
cd "$PROJECT_DIR"
NODE_OPTIONS="--max-old-space-size=512" bun run build >> "$BUILD_LOG" 2>&1
log "[BG BUILD] Build completed successfully."

log "[BG BUILD] Step 5: Restarting application via PM2..."
pm2 delete recruitpro 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
log "[BG BUILD] Application restarted."

log "[BG BUILD] Step 6: Cleaning stray lockfiles..."
rm -f /home/ubuntu/bun.lock /home/ubuntu/package-lock.json /home/ubuntu/.env
log "[BG BUILD] Stray lockfiles cleaned."

# Verify app is responding
sleep 5
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
log "[BG BUILD] Health check: HTTP $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "307" ]; then
    log "=========================================="
    log "DEPLOYMENT COMPLETED SUCCESSFULLY"
    log "=========================================="
else
    log "WARNING: App health check returned HTTP $HTTP_CODE — may need manual investigation"
fi
' > /dev/null 2>&1 &

BG_PID=$!
log "Background build process started (PID: $BG_PID)"
log "Monitor progress: tail -f $BUILD_LOG or $LOG_FILE"
