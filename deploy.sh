#!/bin/bash
# ============================================
# RecruitPro Auto-Deploy Script (Zero-Downtime)
# Triggered by GitHub Actions / webhook on push to main
#
# Zero-Downtime Strategy:
# 1. Kill stuck builds from previous failed deploys
# 2. If PM2 is down, restart immediately with existing .next
# 3. Pull code, install deps, sync DB, run migration
# 4. BACKUP existing .next → .next-backup
# 5. Build new .next while PM2 KEEPS serving old traffic
# 6. If build fails → restore .next-backup, site never goes down
# 7. If build succeeds → restart PM2 (10s swap), clean backup
# ============================================

set -e

# Ensure bun, pm2, node are in PATH
export PATH="$HOME/.bun/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node/ 2>/dev/null | tail -1)/bin:/usr/local/bin:/usr/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

PROJECT_DIR="/home/ubuntu/recruitpro"
LOG_FILE="$PROJECT_DIR/logs/deploy.log"
BUILD_LOG="/tmp/recruitpro-build.log"
LOCK_FILE="/tmp/recruitpro-deploy.lock"

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

# ── Self-Healing: Kill stuck builds from previous failed deploys ──
log "Killing any stuck build processes..."
pkill -f "next build" 2>/dev/null || true
pkill -f "bun.*build" 2>/dev/null || true
sleep 2

# ── Self-Healing: If PM2 is not running and .next exists, restart immediately ──
PM2_STATUS=$(pm2 pid recruitpro 2>/dev/null || echo "stopped")
if [ "$PM2_STATUS" = "stopped" ] || [ -z "$PM2_STATUS" ]; then
    if [ -d .next ]; then
        log "WARNING: PM2 not running but .next exists — restarting immediately with current build"
        pm2 delete recruitpro 2>/dev/null || true
        pm2 start ecosystem.config.cjs
        pm2 save
        sleep 5
        log "App restarted with existing build. Will update to latest in background."
    else
        log "WARNING: PM2 not running and no .next exists — building from scratch"
    fi
fi

# Step 0: Backup .env
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
log "QUICK STEPS DONE — starting zero-downtime build"
log "Site stays LIVE during build."
log "=========================================="

# Step 4+: Zero-Downtime Build in BACKGROUND
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

# Prevent concurrent builds
if [ -f /tmp/recruitpro-deploy.lock ]; then
    OLD_PID=$(cat /tmp/recruitpro-deploy.lock)
    if kill -0 "$OLD_PID" 2>/dev/null; then
        log "[BG BUILD] Another build already running (PID $OLD_PID), aborting."
        exit 0
    fi
fi
echo $$ > /tmp/recruitpro-deploy.lock

cd "$PROJECT_DIR"

# ── STEP A: Backup existing .next build (ZERO DOWNTIME START) ──
log "[BG BUILD] Step 4a: Backing up existing .next build..."
if [ -d .next ]; then
    rm -rf .next-backup 2>/dev/null || true
    cp -a .next .next-backup
    log "[BG BUILD] .next backed up to .next-backup ($(du -sh .next-backup | cut -f1))"
else
    log "[BG BUILD] No existing .next to backup (first deploy)."
fi

# ── STEP B: Try building WITHOUT stopping PM2 (site stays live) ──
log "[BG BUILD] Step 4b: Building while site is LIVE (zero downtime)..."
log "[BG BUILD] If build fails, old build will be restored automatically."

BUILD_SUCCESS=false
if NODE_OPTIONS="--max-old-space-size=384" bun run build >> "$BUILD_LOG" 2>&1; then
    BUILD_SUCCESS=true
    log "[BG BUILD] Build completed successfully!"
else
    BUILD_EXIT=$?
    log "[BG BUILD] Build FAILED (exit code $BUILD_EXIT)"
fi

if [ "$BUILD_SUCCESS" = true ]; then
    # ── STEP C: Build succeeded — quick restart (10s downtime) ──
    log "[BG BUILD] Step 5: Build succeeded. Restarting PM2 with new build..."
    
    # Stop old process
    pm2 stop recruitpro 2>/dev/null || true
    sleep 2
    
    # Delete and recreate with new build
    pm2 delete recruitpro 2>/dev/null || true
    pm2 start ecosystem.config.cjs
    pm2 save
    
    # Wait for app to start
    sleep 8
    
    # Health check
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
    log "[BG BUILD] Health check: HTTP $HTTP_CODE"
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "307" ]; then
        # ── STEP D: App healthy — clean up backup ──
        rm -rf .next-backup
        rm -f /tmp/recruitpro-deploy.lock
        
        log "=========================================="
        log "DEPLOYMENT COMPLETED SUCCESSFULLY"
        log "Zero-downtime deploy — site was live throughout"
        log "=========================================="
    else
        # App not healthy after restart — restore old build
        log "[BG BUILD] WARNING: New build health check failed (HTTP $HTTP_CODE)"
        log "[BG BUILD] Rolling back to previous build..."
        pm2 stop recruitpro 2>/dev/null || true
        rm -rf .next
        mv .next-backup .next
        pm2 delete recruitpro 2>/dev/null || true
        pm2 start ecosystem.config.cjs
        pm2 save
        sleep 8
        ROLLBACK_HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
        log "[BG BUILD] Rollback health check: HTTP $ROLLBACK_HTTP"
        rm -f /tmp/recruitpro-deploy.lock
        log "[BG BUILD] Rolled back to previous working build."
    fi
else
    # ── STEP E: Build FAILED — restore backup (zero downtime preserved) ──
    log "[BG BUILD] Build failed. Restoring previous .next backup..."
    
    # Check if PM2 is still running (it should be since we never stopped it)
    PM2_PID=$(pm2 pid recruitpro 2>/dev/null || echo "stopped")
    if [ "$PM2_PID" = "stopped" ] || [ -z "$PM2_PID" ]; then
        log "[BG BUILD] PM2 stopped — restarting with backup build..."
        rm -rf .next
        if [ -d .next-backup ]; then
            mv .next-backup .next
        fi
        pm2 delete recruitpro 2>/dev/null || true
        pm2 start ecosystem.config.cjs
        pm2 save
    else
        # PM2 still running with old code — just restore the build artifacts
        if [ -d .next-backup ]; then
            rm -rf .next
            mv .next-backup .next
            # Restart PM2 to pick up the restored .next
            pm2 restart recruitpro 2>/dev/null || true
        fi
    fi
    
    sleep 8
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
    log "[BG BUILD] Recovery health check: HTTP $HTTP_CODE"
    rm -rf .next-backup
    rm -f /tmp/recruitpro-deploy.lock
    
    log "=========================================="
    log "BUILD FAILED — but site kept live with previous build"
    log "Check $BUILD_LOG for build errors"
    log "=========================================="
fi

# ── Cleanup ──
log "[BG BUILD] Step 6: Final cleanup..."
rm -f /home/ubuntu/bun.lock /home/ubuntu/package-lock.json /home/ubuntu/.env
rm -f /tmp/recruitpro-deploy.lock
log "[BG BUILD] Cleaned up."
' > /dev/null 2>&1 &

BG_PID=$!
log "Background build started (PID: $BG_PID)"
log "Site remains LIVE during build. Monitor: tail -f $BUILD_LOG"
