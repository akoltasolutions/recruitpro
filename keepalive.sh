#!/bin/bash
# Keepalive wrapper for Next.js dev server
# Runs in background, auto-restarts if server dies
cd /home/z/my-project
while true; do
  NODE_OPTIONS="--max-old-space-size=1024" \
    bun run dev >> /home/z/my-project/dev.log 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Next.js exited with code $EXIT_CODE. Restarting in 3s..." >> /home/z/my-project/dev.log
  sleep 3
done
