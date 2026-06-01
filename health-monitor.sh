#!/bin/bash
# ============================================
# RecruitPro Health Monitor & Auto-Recovery
# Runs every 60s via cron — permanently fixes 502 errors
#
# What it does:
# 1. Check if Next.js responds on port 3000
# 2. If down → try PM2 restart
# 3. If PM2 restart fails → restore from .next-backup
# 4. If no build exists → show clear error
# 5. Log everything to health-monitor.log
#
# Install: Run this ONE TIME on your EC2 server:
#   (crontab -l 2>/dev/null; echo "* * * * * /home/ubuntu/recruitpro/health-monitor.sh >> /home/ubuntu/recruitpro/logs/health-monitor.log 2>&1") | crontab -
# ============================================

export PATH="$HOME/.bun/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node/ 2>/dev/null | tail -1)/bin:/usr/local/bin:/usr/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

PROJECT_DIR="/home/ubuntu/recruitpro"
LOG_FILE="$PROJECT_DIR/logs/health-monitor.log"
LOCK_FILE="/tmp/recruitpro-health.lock"
MAX_RESTARTS_FILE="/tmp/recruitpro-restart-count"

# Prevent overlapping runs
if [ -f "$LOCK_FILE" ]; then
    OLD_PID=$(cat "$LOCK_FILE" 2>/dev/null)
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        exit 0
    fi
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

cd "$PROJECT_DIR" 2>/dev/null || exit 1

# ── Step 1: Health check ──
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 http://localhost:3000 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "307" ] || [ "$HTTP_CODE" = "404" ]; then
    # Site is healthy — reset restart counter and exit
    echo "0" > "$MAX_RESTARTS_FILE" 2>/dev/null
    rm -f "$LOCK_FILE"
    exit 0
fi

# ── Step 2: Site is DOWN — investigate and fix ──
log "❌ UNHEALTHY: HTTP $HTTP_CODE — starting auto-recovery..."

# Check if PM2 process exists
PM2_PID=$(pm2 pid recruitpro 2>/dev/null || echo "stopped")
PM2_STATUS=$(pm2 status recruitpro 2>/dev/null | grep -o 'stopped\|errored\|online' || echo "unknown")

# Check memory
MEM_AVAIL=$(free -m | awk '/Mem:/ {print $7}')
log "Memory available: ${MEM_AVAIL}MB | PM2 PID: $PM2_PID | PM2 status: $PM2_STATUS"

# ── Step 3: Check restart rate limit (max 3 restarts per 5 minutes) ──
RESTART_COUNT=$(cat "$MAX_RESTARTS_FILE" 2>/dev/null || echo "0")
if [ "$RESTART_COUNT" -ge 3 ]; then
    LAST_RESTART=$(stat -c %Y "$MAX_RESTARTS_FILE" 2>/dev/null || echo "0")
    NOW=$(date +%s)
    ELAPSED=$((NOW - LAST_RESTART))
    if [ "$ELAPSED" -lt 300 ]; then
        log "⚠️ Rate limited: $RESTART_COUNT restarts in last 5 min — skipping (wait ${ELAPSED}s)"
        rm -f "$LOCK_FILE"
        exit 0
    fi
    # Reset counter after 5 minutes
    echo "0" > "$MAX_RESTARTS_FILE"
    RESTART_COUNT=0
fi

# ── Step 4: Kill any stuck build processes hogging memory ──
pkill -f "next build" 2>/dev/null || true
sleep 2

# ── Step 5: Ensure .next build exists ──
if [ ! -d .next ]; then
    if [ -d .next-backup ]; then
        log "No .next found — restoring from backup..."
        mv .next-backup .next
    else
        log "❌ CRITICAL: No .next and no .next-backup — cannot recover automatically"
        log "Manual action needed: SSH in and run 'cd ~/recruitpro && npx next build && pm2 start ecosystem.config.cjs'"
        rm -f "$LOCK_FILE"
        exit 1
    fi
fi

# ── Step 6: Restart PM2 ──
log "Restarting PM2..."
pm2 delete recruitpro 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save 2>/dev/null || true

# Increment restart counter
RESTART_COUNT=$((RESTART_COUNT + 1))
echo "$RESTART_COUNT" > "$MAX_RESTARTS_FILE"

# ── Step 7: Wait and verify ──
for i in 1 2 3 4 5 6; do
    sleep 5
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 http://localhost:3000 2>/dev/null || echo "000")
    log "Recovery attempt $i: HTTP $HTTP_CODE"
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "307" ] || [ "$HTTP_CODE" = "404" ]; then
        log "✅ RECOVERED: Site is back online (HTTP $HTTP_CODE)"
        rm -f "$LOCK_FILE"
        exit 0
    fi
done

# ── Step 8: If still down after PM2 restart, try with backup ──
log "⚠️ Still unhealthy after PM2 restart — trying backup build..."
pm2 stop recruitpro 2>/dev/null || true

if [ -d .next-backup ]; then
    rm -rf .next
    mv .next-backup .next
    log "Restored .next from backup"
fi

pm2 delete recruitpro 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save 2>/dev/null || true

sleep 10
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 http://localhost:3000 2>/dev/null || echo "000")
log "Backup recovery: HTTP $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "307" ] || [ "$HTTP_CODE" = "404" ]; then
    log "✅ RECOVERED via backup build"
else
    log "❌ CRITICAL: Could not recover — manual intervention needed"
fi

rm -f "$LOCK_FILE"
exit 0
