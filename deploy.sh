#!/bin/bash
# ============================================
# RecruitPro Auto-Deploy Script
# Triggered by GitHub Actions on push to main
#
# Strategy (Memory-Safe for t3.small / 2GB):
# 1. Kill stuck builds
# 2. Ensure swap is active (2GB swap file)
# 3. Pull code, install deps, sync DB
# 4. STOP PM2 to free ~350MB memory
# 5. Backup .next, build with reduced memory
# 6. Start PM2, health check with retries
# 7. If fails → rollback to .next-backup
# ============================================

set -e

export PATH="$HOME/.bun/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node/ 2>/dev/null | tail -1)/bin:/usr/local/bin:/usr/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

PROJECT_DIR="/home/ubuntu/recruitpro"
LOG_FILE="$PROJECT_DIR/logs/deploy.log"
BUILD_LOG="/tmp/recruitpro-build.log"
LOCK_FILE="/tmp/recruitpro-deploy.lock"
SWAP_FILE="/swapfile"

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

# ── Ensure swap space exists (prevents OOM on 2GB servers) ──
log "Checking swap space..."
SWAP_SIZE=$(free -m | awk '/Swap:/ {print $2}')
if [ "$SWAP_SIZE" -lt 1024 ] 2>/dev/null; then
    log "Swap is ${SWAP_SIZE}MB — setting up 2GB swap file..."
    # Remove any existing swap
    sudo swapoff "$SWAP_FILE" 2>/dev/null || true
    sudo rm -f "$SWAP_FILE"
    # Create 2GB swap file (with sudo for root permissions)
    if sudo dd if=/dev/zero of="$SWAP_FILE" bs=1M count=2048 status=progress 2>&1 | tail -1; then
        sudo chmod 600 "$SWAP_FILE"
        sudo mkswap "$SWAP_FILE" >/dev/null
        sudo swapon "$SWAP_FILE" >/dev/null
        # Make it permanent in /etc/fstab
        if ! sudo grep -q "$SWAP_FILE" /etc/fstab; then
            echo "$SWAP_FILE none swap sw 0 0" | sudo tee -a /etc/fstab > /dev/null
        fi
        # Set swappiness low (only use swap when memory is tight)
        sudo sysctl vm.swappiness=10 >/dev/null 2>&1 || true
        NEW_SWAP=$(free -m | awk '/Swap:/ {print $2}')
        log "Swap configured: ${NEW_SWAP}MB"
    else
        log "WARNING: Could not create swap (permission denied?) — proceeding without swap"
    fi
else
    log "Swap space: ${SWAP_SIZE}MB (sufficient)"
fi

# ── Kill stuck builds from previous deploys ──
log "Killing any stuck build processes..."
pkill -f "next build" 2>/dev/null || true
pkill -f "bun.*build" 2>/dev/null || true
sleep 2

# ── Memory report ──
MEM_FREE=$(free -m | awk '/Mem:/ {print $4}')
MEM_AVAIL=$(free -m | awk '/Mem:/ {print $7}')
log "Memory: Free=${MEM_FREE}MB, Available=${MEM_AVAIL}MB"

# ── Self-Healing: If PM2 not running and .next exists, start immediately ──
PM2_STATUS=$(pm2 pid recruitpro 2>/dev/null || echo "stopped")
if [ "$PM2_STATUS" = "stopped" ] || [ -z "$PM2_STATUS" ]; then
    if [ -d .next ]; then
        log "WARNING: PM2 not running but .next exists — restarting immediately"
        pm2 delete recruitpro 2>/dev/null || true
        pm2 start ecosystem.config.cjs
        pm2 save
        sleep 5
        log "App restarted. Will update in background."
    else
        log "WARNING: PM2 not running and no .next — building from scratch"
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

# Step 3b: Run tenant migration
log "Step 3b: Running tenant migration..."
if [ -f prisma/migrate-tenant.ts ]; then
    bun run prisma/migrate-tenant.ts
    log "Tenant migration complete."
else
    log "No migration script found, skipping."
fi

# ── Clean caches to free memory before build ──
log "Cleaning caches..."
rm -rf /tmp/.bun-* 2>/dev/null || true
rm -rf node_modules/.cache 2>/dev/null || true
npm cache clean --force 2>/dev/null || true
MEM_AFTER_CLEAN=$(free -m | awk '/Mem:/ {print $7}')
log "Memory after cleanup: Available=${MEM_AFTER_CLEAN}MB"

log "=========================================="
log "QUICK STEPS DONE — starting build"
log "=========================================="

# ── Build in BACKGROUND (memory-safe) ──
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
        log "[BUILD] Another build already running (PID $OLD_PID), aborting."
        exit 0
    fi
fi
echo $$ > /tmp/recruitpro-deploy.lock

cd "$PROJECT_DIR"

# ── STEP A: Backup existing .next ──
log "[BUILD] Backing up existing .next build..."
if [ -d .next ]; then
    rm -rf .next-backup 2>/dev/null || true
    cp -a .next .next-backup
    log "[BUILD] .next backed up ($(du -sh .next-backup | cut -f1))"
else
    log "[BUILD] No existing .next to backup (first deploy)."
fi

# ── STEP B: STOP PM2 to free ~350MB for build ──
log "[BUILD] Stopping PM2 to free memory for build..."
PM2_PID=$(pm2 pid recruitpro 2>/dev/null || echo "stopped")
if [ "$PM2_PID" != "stopped" ] && [ -n "$PM2_PID" ]; then
    pm2 stop recruitpro 2>/dev/null || true
    sleep 3
    log "[BUILD] PM2 stopped (freed ~350MB)"
else
    log "[BUILD] PM2 was not running"
fi

# Clear any remaining node/bun processes hogging memory
pkill -f "next build" 2>/dev/null || true
sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
sleep 1

MEM_BEFORE=$(free -m | awk "/Mem:/ {print \$7}")
log "[BUILD] Available memory before build: ${MEM_BEFORE}MB"

# ── STEP C: Build with memory-safe settings ──
log "[BUILD] Starting build (memory limit: 256MB)..."
BUILD_SUCCESS=false
if NODE_OPTIONS="--max-old-space-size=256" npx next build >> "$BUILD_LOG" 2>&1; then
    BUILD_SUCCESS=true
    log "[BUILD] Build completed successfully!"
else
    BUILD_EXIT=$?
    log "[BUILD] Build FAILED (exit code $BUILD_EXIT)"
    # Show last 10 lines of build log
    log "[BUILD] Build error tail:"
    tail -10 "$BUILD_LOG" 2>/dev/null | while read line; do log "[BUILD]   $line"; done
fi

if [ "$BUILD_SUCCESS" = true ]; then
    # ── STEP D: Build succeeded — start PM2 ──
    log "[BUILD] Starting PM2 with new build..."
    pm2 delete recruitpro 2>/dev/null || true
    pm2 start ecosystem.config.cjs
    pm2 save

    # ── STEP E: Health check with retries ──
    HEALTHY=false
    for i in 1 2 3 4 5; do
        sleep 5
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
        log "[BUILD] Health check attempt $i: HTTP $HTTP_CODE"
        if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "307" ]; then
            HEALTHY=true
            break
        fi
        log "[BUILD] Retrying in 5s..."
    done

    if [ "$HEALTHY" = true ]; then
        rm -rf .next-backup
        rm -f /tmp/recruitpro-deploy.lock
        log "=========================================="
        log "DEPLOYMENT COMPLETED SUCCESSFULLY"
        log "=========================================="
    else
        log "[BUILD] WARNING: Health check failed after 5 attempts"
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
    # ── STEP F: Build FAILED — restore backup ──
    log "[BUILD] Build failed. Restoring previous build..."
    rm -rf .next
    if [ -d .next-backup ]; then
        mv .next-backup .next
    fi
    pm2 delete recruitpro 2>/dev/null || true
    pm2 start ecosystem.config.cjs
    pm2 save
    sleep 10
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
    log "[BUILD] Recovery health check: HTTP $HTTP_CODE"
    rm -rf .next-backup
    rm -f /tmp/recruitpro-deploy.lock
    log "=========================================="
    log "BUILD FAILED — rolled back to previous build"
    log "Check $BUILD_LOG for errors"
    log "=========================================="
fi

# ── Final cleanup ──
log "[BUILD] Cleaning up..."
rm -f /home/ubuntu/bun.lock /home/ubuntu/package-lock.json /home/ubuntu/.env
rm -f /tmp/recruitpro-deploy.lock
MEM_FINAL=$(free -m | awk "/Mem:/ {print \$7}")
log "[BUILD] Final available memory: ${MEM_FINAL}MB"
log "[BUILD] Done."
' > /dev/null 2>&1 &

BG_PID=$!
log "Build started in background (PID: $BG_PID)"
log "Monitor: tail -f $BUILD_LOG"
