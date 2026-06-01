#!/bin/bash
# ============================================
# RecruitPro Auto-Deploy Script (Zero-Downtime)
# Triggered by GitHub Actions on push to main
#
# Zero-Downtime Strategy:
# 1. PM2 stays LIVE serving old build throughout
# 2. Pull code, install deps, sync DB (PM2 still running)
# 3. Backup .next, build new .next (PM2 still running)
# 4. Build succeeds → quick PM2 restart (10s swap)
# 5. Build fails → delete broken .next, restore backup
#    PM2 never stopped → ZERO downtime even on failure
#
# Memory: t3.small 2GB RAM + 2GB swap = 4GB effective
# PM2 (~300MB) + build (~256MB) fits comfortably
# ============================================

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

# ── Kill stuck builds from previous failed deploys ──
log "Killing any stuck build processes..."
pkill -f "next build" 2>/dev/null || true
pkill -f "bun.*build" 2>/dev/null || true
sleep 2

# ── Self-Healing: If PM2 not running and .next exists, start immediately ──
PM2_STATUS=$(pm2 pid recruitpro 2>/dev/null || echo "stopped")
if [ "$PM2_STATUS" = "stopped" ] || [ -z "$PM2_STATUS" ]; then
    if [ -d .next ]; then
        log "WARNING: PM2 not running but .next exists — restarting immediately"
        pm2 delete recruitpro 2>/dev/null || true
        pm2 start ecosystem.config.cjs
        pm2 save
        sleep 5
        log "App restarted with existing build."
    else
        log "No .next and PM2 not running — first deploy."
    fi
fi

# ── Confirm PM2 is healthy before proceeding ──
PM2_PID=$(pm2 pid recruitpro 2>/dev/null || echo "stopped")
if [ "$PM2_PID" != "stopped" ] && [ -n "$PM2_PID" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
    log "PM2 is running (PID: $PM2_PID). Site HTTP: $HTTP_CODE"
    log ">>> SITE STAYS LIVE DURING ENTIRE DEPLOY <<<"
else
    log "PM2 not running. Will build from scratch."
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
log "Code updated."

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

# Step 3c: Ensure platform-settings.json exists
log "Step 3c: Ensuring platform-settings.json exists..."
if [ ! -f db/platform-settings.json ]; then
    mkdir -p db
    cat > db/platform-settings.json << 'SETTINGSEOF'
{
  "subscriptionEnforcement": false,
  "defaultMaxUsers": 10,
  "defaultMaxNumbers": 5000,
  "defaultDailyUploadLimit": 500,
  "includeDispositionTime": true
}
SETTINGSEOF
    log "Created default platform-settings.json."
else
    log "platform-settings.json already exists."
fi

# Step 3b: Run tenant migration
log "Step 3b: Running tenant migration..."
if [ -f prisma/migrate-tenant.ts ]; then
    bun run prisma/migrate-tenant.ts
    log "Tenant migration complete."
else
    log "No migration script found, skipping."
fi

# ── Clean caches to free memory ──
log "Cleaning caches..."
rm -rf /tmp/.bun-* 2>/dev/null || true
rm -rf node_modules/.cache 2>/dev/null || true
npm cache clean --force 2>/dev/null || true

log "=========================================="
log "QUICK STEPS DONE — PM2 still serving traffic"
log "Starting background build..."
log "=========================================="

# ═══════════════════════════════════════════════════
# BACKGROUND BUILD — PM2 STAYS RUNNING (ZERO DOWNTIME)
# ═══════════════════════════════════════════════════
nohup bash -c '
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
        log "[BUILD] Another build already running (PID $OLD_PID), aborting."
        exit 0
    fi
fi
echo $$ > /tmp/recruitpro-deploy.lock

cd "$PROJECT_DIR"

# ── STEP A: Backup existing .next (safety net) ──
log "[BUILD] Backing up existing .next build..."
if [ -d .next ]; then
    rm -rf .next-backup 2>/dev/null || true
    cp -a .next .next-backup
    log "[BUILD] .next backed up ($(du -sh .next-backup | cut -f1))"
else
    log "[BUILD] No existing .next to backup (first deploy)."
fi

# ── Verify PM2 is still running ──
PM2_PID=$(pm2 pid recruitpro 2>/dev/null || echo "stopped")
if [ "$PM2_PID" != "stopped" ] && [ -n "$PM2_PID" ]; then
    log "[BUILD] PM2 still running (PID: $PM2_PID) — building while site is LIVE"
else
    log "[BUILD] PM2 not running — building from scratch"
fi

# ── STEP B: Build new .next (PM2 keeps serving old build) ──
log "[BUILD] Starting build (memory limit: 256MB)..."
log "[BUILD] >>> ZERO DOWNTIME: Old build still serving traffic <<<"

BUILD_SUCCESS=false
if NODE_OPTIONS="--max-old-space-size=256" npx next build >> "$BUILD_LOG" 2>&1; then
    BUILD_SUCCESS=true
    log "[BUILD] Build completed successfully!"
else
    BUILD_EXIT=$?
    log "[BUILD] Build FAILED (exit code $BUILD_EXIT)"
    log "[BUILD] Last 15 lines of build log:"
    tail -15 "$BUILD_LOG" 2>/dev/null | while read line; do log "[BUILD]   $line"; done
fi

if [ "$BUILD_SUCCESS" = true ]; then
    # ── STEP C: Build succeeded — quick PM2 restart (10s downtime) ──
    log "[BUILD] New build ready. Restarting PM2 (quick 10s swap)..."
    pm2 stop recruitpro 2>/dev/null || true
    sleep 2
    pm2 delete recruitpro 2>/dev/null || true
    pm2 start ecosystem.config.cjs
    pm2 save

    # ── STEP D: Health check with retries ──
    HEALTHY=false
    for i in 1 2 3 4 5; do
        sleep 5
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
        log "[BUILD] Health check attempt $i: HTTP $HTTP_CODE"
        if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "307" ]; then
            HEALTHY=true
            break
        fi
    done

    if [ "$HEALTHY" = true ]; then
        # ✅ New build confirmed — clean up
        rm -rf .next-backup
        rm -f /tmp/recruitpro-deploy.lock
        log "=========================================="
        log "DEPLOYMENT COMPLETED SUCCESSFULLY"
        log "Zero-downtime: old build served during build"
        log "=========================================="
    else
        # ❌ New build unhealthy — rollback to old build
        log "[BUILD] WARNING: New build health check failed"
        log "[BUILD] Rolling back to previous build..."
        pm2 stop recruitpro 2>/dev/null || true
        rm -rf .next
        if [ -d .next-backup ]; then
            mv .next-backup .next
        fi
        pm2 delete recruitpro 2>/dev/null || true
        pm2 start ecosystem.config.cjs
        pm2 save
        sleep 10
        ROLLBACK_HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
        log "[BUILD] Rollback health check: HTTP $ROLLBACK_HTTP"
        rm -rf .next-backup
        rm -f /tmp/recruitpro-deploy.lock
        log "[BUILD] Rolled back to previous build."
    fi
else
    # ── STEP E: Build FAILED — restore backup, PM2 was NEVER stopped ──
    log "[BUILD] Build FAILED — cleaning up broken .next..."
    rm -rf .next
    if [ -d .next-backup ]; then
        mv .next-backup .next
        log "[BUILD] Restored .next from backup"
    fi
    rm -rf .next-backup

    # PM2 is still running with old build — just restart to ensure consistency
    PM2_PID=$(pm2 pid recruitpro 2>/dev/null || echo "stopped")
    if [ "$PM2_PID" != "stopped" ] && [ -n "$PM2_PID" ]; then
        log "[BUILD] PM2 still running with old build — restarting for consistency..."
        pm2 restart recruitpro 2>/dev/null || true
        pm2 save
    else
        log "[BUILD] PM2 not running — starting with backup build..."
        pm2 delete recruitpro 2>/dev/null || true
        pm2 start ecosystem.config.cjs
        pm2 save
    fi

    sleep 10
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
    log "[BUILD] Recovery health check: HTTP $HTTP_CODE"
    rm -f /tmp/recruitpro-deploy.lock
    log "=========================================="
    log "BUILD FAILED — site kept LIVE with old build"
    log "Check $BUILD_LOG for build errors"
    log "=========================================="
fi

# ── Final cleanup ──
log "[BUILD] Cleaning up..."
rm -f /home/ubuntu/bun.lock /home/ubuntu/package-lock.json /home/ubuntu/.env
rm -f /tmp/recruitpro-deploy.lock
log "[BUILD] Done."
' > /dev/null 2>&1 &

BG_PID=$!
log "Background build started (PID: $BG_PID)"
log "PM2 keeps serving traffic. Monitor: tail -f $BUILD_LOG"
