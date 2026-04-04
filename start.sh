#!/bin/bash
cd /home/z/my-project
rm -rf .next
echo "Starting dev server..."
while true; do
  npx next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  echo "[$(date)] Server exited with code $?. Restarting in 3s..." >> /home/z/my-project/dev.log
  sleep 3
done
