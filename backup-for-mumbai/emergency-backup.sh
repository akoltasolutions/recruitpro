#!/bin/bash
# ══════════════════════════════════════════════════════════
# RecruitPro — EMERGENCY BACKUP SCRIPT
# Run this on the OLD EU server to download all critical data
# ══════════════════════════════════════════════════════════
#
# Usage:
#   ssh -i "your-key.pem" ubuntu@51.21.37.18 "bash -s" < emergency-backup.sh
#
# Or copy-paste into SSH terminal line by line
# ══════════════════════════════════════════════════════════

set -e

echo "=========================================="
echo "RECRUITPRO EMERGENCY BACKUP"
echo "Date: $(date)"
echo "=========================================="

BACKUP_DIR="/home/ubuntu/recruitpro-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# 1. Backup Database
echo "[1/5] Backing up database..."
mkdir -p "$BACKUP_DIR/db"
if [ -f /home/ubuntu/recruitpro/db/custom.db ]; then
    cp /home/ubuntu/recruitpro/db/custom.db "$BACKUP_DIR/db/"
    echo "  ✓ Database backed up ($(du -sh /home/ubuntu/recruitpro/db/custom.db | cut -f1))"
else
    echo "  ⚠ No database file found"
fi

# 2. Backup .env
echo "[2/5] Backing up .env..."
if [ -f /home/ubuntu/recruitpro/.env ]; then
    cp /home/ubuntu/recruitpro/.env "$BACKUP_DIR/env"
    echo "  ✓ .env backed up"
else
    echo "  ⚠ No .env file found"
fi

# 3. Backup Caddy config
echo "[3/5] Backing up Caddy config..."
if [ -f /etc/caddy/Caddyfile ]; then
    sudo cp /etc/caddy/Caddyfile "$BACKUP_DIR/Caddyfile"
    echo "  ✓ Caddyfile backed up"
else
    echo "  ⚠ No Caddyfile found"
fi

# 4. Backup upload files
echo "[4/5] Backing up upload files..."
if [ -d /home/ubuntu/recruitpro/upload ] && [ "$(ls -A /home/ubuntu/recruitpro/upload 2>/dev/null)" ]; then
    cp -a /home/ubuntu/recruitpro/upload "$BACKUP_DIR/"
    echo "  ✓ Uploads backed up ($(du -sh /home/ubuntu/recruitpro/upload | cut -f1))"
else
    echo "  ⚠ No upload files found"
fi

# 5. Backup PM2 config
echo "[5/5] Backing up PM2 config..."
cp /home/ubuntu/recruitpro/ecosystem.config.cjs "$BACKUP_DIR/"
echo "  ✓ ecosystem.config.cjs backed up"

# Create compressed archive
echo ""
echo "Creating compressed archive..."
cd /home/ubuntu
tar -czf "recruitpro-backup-$(date +%Y%m%d-%H%M%S).tar.gz" "$(basename "$BACKUP_DIR")"
echo "  ✓ Archive created"

echo ""
echo "=========================================="
echo "BACKUP COMPLETE"
echo "=========================================="
echo ""
echo "Backup location: $BACKUP_DIR"
echo "Archive: /home/ubuntu/recruitpro-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
echo ""
echo "To download to your local machine:"
echo "  scp -i 'your-key.pem' ubuntu@51.21.37.18:/home/ubuntu/recruitpro-backup-*.tar.gz ."
echo ""
echo "To download individual files:"
echo "  scp -i 'your-key.pem' ubuntu@51.21.37.18:$BACKUP_DIR/db/custom.db ."
echo "  scp -i 'your-key.pem' ubuntu@51.21.37.18:$BACKUP_DIR/env .env"
echo "=========================================="
