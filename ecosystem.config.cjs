module.exports = {
  apps: [
    {
      name: 'recruitpro',
      script: '.next/standalone/server.js',
      cwd: '/home/ubuntu/recruitpro',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: '/home/ubuntu/recruitpro/logs/error.log',
      out_file: '/home/ubuntu/recruitpro/logs/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
