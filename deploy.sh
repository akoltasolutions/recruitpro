#!/bin/bash
# ============================================
# RecruitPro Auto-Deploy Script
# Triggered by GitHub webhook on push to main
# ============================================

set -e

# Ensure bun, pm2, node are in PATH (non-interactive SSH sessions may not load .bashrc)
export PATH="$HOME/.bun/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node/ 2>/dev/null | tail -1)/bin:/usr/local/bin:/usr/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

PROJECT_DIR="/home/ubuntu/recruitpro"
LOG_FILE="$PROJECT_DIR/logs/deploy.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=========================================="
log "DEPLOYMENT STARTED"
log "=========================================="

# Verify tools
log "Checking tools..."
which bun >/dev/null 2>&1 && log "  bun: $(bun --version)" || log "  WARNING: bun not found in PATH"
which node >/dev/null 2>&1 && log "  node: $(node --version)" || log "  WARNING: node not found in PATH"
which pm2 >/dev/null 2>&1 && log "  pm2: $(pm2 --version)" || log "  WARNING: pm2 not found in PATH"
which npx >/dev/null 2>&1 && log "  npx: found" || log "  WARNING: npx not found in PATH"

cd "$PROJECT_DIR"

# Step 0: Backup .env before git reset (it is NOT in git)
log "Step 0: Backing up .env..."
if [ -f .env ]; then
    cp .env /tmp/recruitpro-env-backup
    log ".env backed up to /tmp/recruitpro-env-backup"
fi

# Step 1: Pull latest code
log "Step 1: Pulling latest code from GitHub..."
git fetch origin
git reset --hard origin/main
log "Code updated to latest version."

# Step 1b: Restore .env after git reset
log "Step 1b: Restoring .env..."
if [ -f /tmp/recruitpro-env-backup ]; then
    cp /tmp/recruitpro-env-backup .env
    rm /tmp/recruitpro-env-backup
    log ".env restored successfully."
else
    if [ ! -f .env ]; then
        log "WARNING: No .env file found! Creating default..."
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

# Step 3b: Run tenant migration (backfill organizationId on existing rows)
log "Step 3b: Running tenant migration..."
if [ -f prisma/migrate-tenant.ts ]; then
    bun run prisma/migrate-tenant.ts
    log "Tenant migration complete."
else
    log "No migration script found, skipping."
fi

# Step 4a: Stop PM2 before build to free memory (~911MB server)
log "Step 4a: Stopping PM2 to free memory for build..."
pm2 stop recruitpro 2>/dev/null || true
sleep 2
log "PM2 stopped."

# Step 4b: Build
log "Step 4b: Building application..."
rm -rf .next
NODE_OPTIONS="--max-old-space-size=512" bun run build
log "Build completed."

# Step 5: Delete and recreate PM2 process (restart caches old env vars!)
log "Step 5: Restarting application via PM2..."
pm2 delete recruitpro 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
log "Application restarted."

# Step 6: Clean stray lockfiles that confuse Next.js workspace root detection
log "Step 6: Cleaning stray lockfiles..."
rm -f /home/ubuntu/bun.lock /home/ubuntu/package-lock.json /home/ubuntu/.env
log "Stray lockfiles cleaned."

log "=========================================="
log "DEPLOYMENT COMPLETED SUCCESSFULLY"
log "=========================================="
