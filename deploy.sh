#!/bin/bash
# ============================================
# RecruitPro Auto-Deploy Script
# Triggered by GitHub Actions on push to main
#
# Strategy:
# - If PM2 is UP: Zero-downtime (background build + quick swap)
# - If PM2 is DOWN: Synchronous build + forced restart
# - Always: Final health check with PM2 guarantee
#
# Memory: t3.small 2GB RAM + 2GB swap = 4GB effective
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

# ── Detect PM2 health ──
PM2_PID=$(pm2 pid recruitpro 2>/dev/null || echo "")
PM2_HTTP="000"
if [ -n "$PM2_PID" ]; then
    PM2_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000 2>/dev/null || echo "000")
fi
PM2_HEALTHY=false
if [ "$PM2_HTTP" = "200" ] || [ "$PM2_HTTP" = "302" ] || [ "$PM2_HTTP" = "307" ]; then
    PM2_HEALTHY=true
fi

log "PM2 PID: ${PM2_PID:-none}, HTTP: $PM2_HTTP, Healthy: $PM2_HEALTHY"

# ── If PM2 is DOWN, try immediate restart with existing .next ──
if [ "$PM2_HEALTHY" = false ]; then
    if [ -d .next ]; then
        log "PM2 DOWN but .next exists — restarting PM2 immediately with existing build"
        pm2 delete recruitpro 2>/dev/null || true
        pm2 start ecosystem.config.cjs
        pm2 save
        sleep 5
        QUICK_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000 2>/dev/null || echo "000")
        if [ "$QUICK_HTTP" = "200" ] || [ "$QUICK_HTTP" = "302" ] || [ "$QUICK_HTTP" = "307" ]; then
            log "Quick restart succeeded (HTTP $QUICK_HTTP). PM2 is back."
            PM2_HEALTHY=true
        else
            log "Quick restart failed (HTTP $QUICK_HTTP). .next may be corrupted."
        fi
    else
        log "PM2 DOWN and no .next directory. Will build from scratch."
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
EMAIL_FROM="RecruitPro <noreply@app.akolta.com>"
ENVEOF
    fi
fi

# Step 1c: Safety net — inject secrets if passed via env vars
log "Step 1c: Checking for deployment secrets..."
if [ -n "$RESEND_API_KEY" ]; then
    if grep -q 'RESEND_API_KEY=' .env 2>/dev/null; then
        sed -i 's|^RESEND_API_KEY=.*|RESEND_API_KEY="'"$RESEND_API_KEY"'"|' .env
    else
        echo 'RESEND_API_KEY="'"$RESEND_API_KEY"'"' >> .env
    fi
    log "RESEND_API_KEY injected into .env (length: ${#RESEND_API_KEY})"
else
    EXISTING_KEY=$(grep '^RESEND_API_KEY=' .env 2>/dev/null | sed 's/^RESEND_API_KEY=//' | tr -d '"')
    if [ -n "$EXISTING_KEY" ]; then
        log "RESEND_API_KEY already in .env (length: ${#EXISTING_KEY})"
    else
        log "WARNING: RESEND_API_KEY not set — forgot-password emails will NOT be sent"
    fi
fi
log ".env has RESEND_API_KEY line: $(grep -c 'RESEND_API_KEY=' .env 2>/dev/null || echo 0)"
log ".env has EMAIL_FROM line: $(grep -c 'EMAIL_FROM=' .env 2>/dev/null || echo 0)"

# Step 2: Install dependencies
log "Step 2: Installing dependencies..."
bun install --frozen-lockfile 2>/dev/null || bun install
log "Dependencies installed."

# Step 2b: Verify resend package
log "Step 2b: Verifying resend package..."
if [ -d node_modules/resend ]; then
    RESEND_VERSION=$(node -e "console.log(require('./node_modules/resend/package.json').version)" 2>/dev/null || echo "unknown")
    log "resend package found (v$RESEND_VERSION)"
else
    log "WARNING: resend package NOT found — forgot-password emails will fail!"
fi

# Step 3: Generate Prisma Client & Sync database
log "Step 3: Generating Prisma Client..."
bunx prisma generate
log "Prisma Client generated."

log "Step 3b: Syncing database schema..."
DB_SYNC_SUCCESS=false
for attempt in 1 2 3; do
    log "  DB sync attempt $attempt..."
    if bunx prisma db push 2>&1; then
        DB_SYNC_SUCCESS=true
        log "  DB sync succeeded on attempt $attempt."
        break
    else
        log "  DB sync attempt $attempt failed."
        if [ "$attempt" -lt 3 ]; then
            log "  Stopping PM2 to release SQLite lock..."
            pm2 stop recruitpro 2>/dev/null || true
            sleep 2
        fi
    fi
done

if [ "$DB_SYNC_SUCCESS" = false ]; then
    log "ERROR: All 3 DB sync attempts failed! Schema may be out of sync."
    log "Attempting forced sync with PM2 stopped..."
    pm2 stop recruitpro 2>/dev/null || true
    sleep 3
    if bunx prisma db push --force-reset 2>&1; then
        log "Forced DB sync succeeded (data loss possible for new columns)."
    else
        log "CRITICAL: Forced DB sync also failed! Manual intervention required."
    fi
    pm2 restart recruitpro 2>/dev/null || true
    sleep 3
else
    log "Database synced successfully."
fi

# Step 3d: Migrate existing pending users
log "Step 3d: Migrating approval status data..."
if [ -f prisma/migrate-approval-status.ts ]; then
    bun run prisma/migrate-approval-status.ts
    log "Approval status migration complete."
else
    log "No approval status migration script found, skipping."
fi

# Step 3e: Ensure super admin account
log "Step 3e: Ensuring super admin account..."
if [ -f prisma/migrate-super-admin.ts ]; then
    bun run prisma/migrate-super-admin.ts
    log "Super admin migration complete."
else
    log "No super admin migration script found, skipping."
fi

# Step 3c: Ensure platform-settings.json
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

# Step 3f: Verify critical columns
log "Step 3f: Verifying critical database columns..."
if [ -f prisma/migrate-verify-columns.ts ]; then
    bun run prisma/migrate-verify-columns.ts 2>&1 | tee -a "$LOG_FILE"
    COLUMN_CHECK=${PIPESTATUS[0]}
    if [ "$COLUMN_CHECK" -ne 0 ]; then
        log "WARNING: Critical columns missing! Attempting repair..."
        pm2 stop recruitpro 2>/dev/null || true
        sleep 2
        bunx prisma db push 2>&1 | tee -a "$LOG_FILE"
        bunx prisma generate 2>&1 | tee -a "$LOG_FILE"
        bun run prisma/migrate-verify-columns.ts 2>&1 | tee -a "$LOG_FILE"
        REPAIR_CHECK=${PIPESTATUS[0]}
        if [ "$REPAIR_CHECK" -ne 0 ]; then
            log "CRITICAL: Column repair failed! Manual intervention required."
        else
            log "Column repair verified OK."
        fi
        pm2 restart recruitpro 2>/dev/null || true
        sleep 3
    else
        log "Critical columns verified OK."
    fi
else
    log "No column verification script found, skipping."
fi

# ── Clean caches to free memory ──
log "Cleaning caches..."
rm -rf /tmp/.bun-* 2>/dev/null || true
rm -rf node_modules/.cache 2>/dev/null || true
npm cache clean --force 2>/dev/null || true

# ═════════════════════════════════════════════════
# BUILD PHASE — Strategy depends on PM2 health
# ═════════════════════════════════════════════════
if [ "$PM2_HEALTHY" = true ]; then
    # ── PM2 is UP: Zero-downtime background build ──
    log "=========================================="
    log "PM2 is HEALTHY — Zero-downtime background build"
    log "=========================================="

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

# Backup existing .next
log "[BUILD] Backing up existing .next build..."
if [ -d .next ]; then
    rm -rf .next-backup 2>/dev/null || true
    cp -a .next .next-backup
    log "[BUILD] .next backed up ($(du -sh .next-backup | cut -f1))"
else
    log "[BUILD] No existing .next to backup."
fi

# Build
log "[BUILD] Starting build (memory limit: 512MB)..."
BUILD_SUCCESS=false
if NODE_OPTIONS="--max-old-space-size=512" npx next build >> "$BUILD_LOG" 2>&1; then
    BUILD_SUCCESS=true
    log "[BUILD] Build completed successfully!"
else
    BUILD_EXIT=$?
    log "[BUILD] Build FAILED (exit code $BUILD_EXIT)"
    log "[BUILD] Last 15 lines of build log:"
    tail -15 "$BUILD_LOG" 2>/dev/null | while read line; do log "[BUILD]   $line"; done
fi

if [ "$BUILD_SUCCESS" = true ]; then
    log "[BUILD] New build ready. Restarting PM2..."
    pm2 stop recruitpro 2>/dev/null || true
    sleep 2
    pm2 delete recruitpro 2>/dev/null || true
    pm2 start ecosystem.config.cjs
    pm2 save

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
        rm -rf .next-backup
        rm -f /tmp/recruitpro-deploy.lock
        log "=========================================="
        log "DEPLOYMENT COMPLETED SUCCESSFULLY"
        log "=========================================="
    else
        log "[BUILD] WARNING: New build unhealthy — rolling back..."
        pm2 stop recruitpro 2>/dev/null || true
        rm -rf .next
        if [ -d .next-backup ]; then mv .next-backup .next; fi
        pm2 delete recruitpro 2>/dev/null || true
        pm2 start ecosystem.config.cjs
        pm2 save
        sleep 10
        rm -rf .next-backup
        rm -f /tmp/recruitpro-deploy.lock
        log "[BUILD] Rolled back to previous build."
    fi
else
    log "[BUILD] Build FAILED — restoring backup..."
    rm -rf .next
    if [ -d .next-backup ]; then mv .next-backup .next; fi
    rm -rf .next-backup

    PM2_PID=$(pm2 pid recruitpro 2>/dev/null || echo "")
    if [ -n "$PM2_PID" ]; then
        pm2 restart recruitpro 2>/dev/null || true
    else
        pm2 delete recruitpro 2>/dev/null || true
        pm2 start ecosystem.config.cjs
    fi
    pm2 save
    sleep 10
    rm -f /tmp/recruitpro-deploy.lock
    log "=========================================="
    log "BUILD FAILED — site kept LIVE with old build"
    log "=========================================="
fi

rm -f /home/ubuntu/bun.lock /home/ubuntu/package-lock.json /home/ubuntu/.env
rm -f /tmp/recruitpro-deploy.lock
' > /dev/null 2>&1 &

    BG_PID=$!
    log "Background build started (PID: $BG_PID)"
    log "Monitor: tail -f $BUILD_LOG"
    log "DEPLOYMENT QUEUED — PM2 keeps serving traffic"

else
    # ═════════════════════════════════════════════════
    # PM2 is DOWN: Synchronous build + forced restart
    # ═════════════════════════════════════════════════
    log "=========================================="
    log "PM2 is DOWN — Synchronous build + forced restart"
    log "=========================================="

    # Backup existing .next if it exists
    if [ -d .next ]; then
        rm -rf .next-backup 2>/dev/null || true
        cp -a .next .next-backup
        log "Backed up existing .next ($(du -sh .next-backup | cut -f1))"
    fi

    # Free memory before build
    log "Freeing memory before build..."
    pm2 stop recruitpro 2>/dev/null || true
    pm2 delete recruitpro 2>/dev/null || true
    sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
    sleep 2

    # Build synchronously
    log "Starting synchronous build..."
    BUILD_SUCCESS=false
    if NODE_OPTIONS="--max-old-space-size=512" npx next build 2>&1 | tee -a "$LOG_FILE"; then
        BUILD_SUCCESS=true
        log "Build completed successfully!"
    else
        BUILD_EXIT=$?
        log "Build FAILED (exit code $BUILD_EXIT)"
        log "Last 20 lines of build log:"
        tail -20 "$BUILD_LOG" 2>/dev/null | while read line; do log "  $line"; done
    fi

    # Start PM2 regardless of build result
    log "Starting PM2..."
    if [ "$BUILD_SUCCESS" = false ] && [ -d .next-backup ]; then
        log "Build failed — restoring backup .next..."
        rm -rf .next
        mv .next-backup .next
    fi
    rm -rf .next-backup 2>/dev/null || true

    pm2 delete recruitpro 2>/dev/null || true
    pm2 start ecosystem.config.cjs
    pm2 save

    # Health check with retries
    HEALTHY=false
    for i in 1 2 3 4 5 6 7 8; do
        sleep 5
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
        log "Health check attempt $i: HTTP $HTTP_CODE"
        if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "307" ]; then
            HEALTHY=true
            break
        fi
        # If PM2 crashed, restart it
        PM2_CHECK=$(pm2 pid recruitpro 2>/dev/null || echo "")
        if [ -z "$PM2_CHECK" ]; then
            log "PM2 crashed! Restarting..."
            pm2 delete recruitpro 2>/dev/null || true
            pm2 start ecosystem.config.cjs
            pm2 save
        fi
    done

    if [ "$HEALTHY" = true ]; then
        log "=========================================="
        log "DEPLOYMENT COMPLETED SUCCESSFULLY"
        log "PM2 restarted — site is back online"
        log "=========================================="
    else
        log "=========================================="
        log "CRITICAL: Site still down after all retries!"
        log "Manual intervention required."
        log "=========================================="
    fi

    rm -f /home/ubuntu/bun.lock /home/ubuntu/package-lock.json /home/ubuntu/.env
    rm -f /tmp/recruitpro-deploy.lock
fi
