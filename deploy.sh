#!/bin/bash
# ============================================
# RecruitPro Auto-Deploy Script
# Triggered by GitHub webhook on push to main
# ============================================

set -e

PROJECT_DIR="/home/ubuntu/recruitpro"
LOG_FILE="$PROJECT_DIR/logs/deploy.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=========================================="
log "DEPLOYMENT STARTED"
log "=========================================="

cd "$PROJECT_DIR"

# Step 1: Pull latest code
log "Step 1: Pulling latest code from GitHub..."
git fetch origin
git reset --hard origin/main
log "Code updated to latest version."

# Step 2: Install dependencies
log "Step 2: Installing dependencies..."
bun install --frozen-lockfile 2>/dev/null || bun install
log "Dependencies installed."

# Step 3: Sync database
log "Step 3: Syncing database schema..."
bunx prisma db push
log "Database synced."

# Step 4: Build
log "Step 4: Building application..."
rm -rf .next
bun run build
log "Build completed."

# Step 5: Restart PM2
log "Step 5: Restarting application via PM2..."
pm2 restart recruitpro || pm2 start ecosystem.config.cjs
pm2 save
log "Application restarted."

log "=========================================="
log "DEPLOYMENT COMPLETED SUCCESSFULLY"
log "=========================================="
