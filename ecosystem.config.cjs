module.exports = {
  apps: [
    {
      name: 'recruitpro',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      cwd: '/home/ubuntu/recruitpro',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      node_args: '--max-old-space-size=224',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 3000,
      error_file: '/home/ubuntu/recruitpro/logs/error.log',
      out_file: '/home/ubuntu/recruitpro/logs/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
