// ═══════════════════════════════════════════════════════════════
//  PM2 Configuration — Keeps RecruitPro running 24/7
//  Usage: pm2 start ecosystem.config.js
// ═══════════════════════════════════════════════════════════════

module.exports = {
  apps: [
    {
      name: 'recruitpro',
      script: 'server.js',
      cwd: '/home/ubuntu/recruitpro/.next/standalone',
      interpreter: 'bun',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '0.0.0.0',
      },
      // Auto-restart if app crashes
      autorestart: true,
      // Max 10 restarts in 60 seconds before stopping
      max_restarts: 10,
      // Wait 5 seconds between restarts
      restart_delay: 5000,
      // Log files
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/home/ubuntu/recruitpro/logs/error.log',
      out_file: '/home/ubuntu/recruitpro/logs/out.log',
      merge_logs: true,
      // Memory limit — restart if exceeds 1GB
      max_memory_restart: '1G',
    },
  ],
};
