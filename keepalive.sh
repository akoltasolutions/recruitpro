#!/bin/sh
# Keepalive wrapper for Next.js dev server
# Runs in background, auto-restarts if server dies
cd /home/z/my-project
while true; do
  NEXT_WORKER_COUNT=1 NODE_OPTIONS="--max-old-space-size=1024" \
    npx next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Next.js exited with code $EXIT_CODE. Restarting in 2s..." >> /home/z/my-project/dev.log
  sleep 2
done
