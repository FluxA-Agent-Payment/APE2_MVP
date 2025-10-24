module.exports = {
  apps: [
    {
      name: 'aep2-sp',
      script: 'dist/services/sp-v2.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        SP_PORT: 7001
      },
      error_file: './logs/sp-error.log',
      out_file: './logs/sp-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000
    },
    {
      name: 'aep2-payee',
      script: 'dist/services/payee.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PAYEE_PORT: 7002
      },
      error_file: './logs/payee-error.log',
      out_file: './logs/payee-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000
    },
    {
      name: 'aep2-faucet',
      script: 'dist/services/faucet.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        FAUCET_PORT: 7003
      },
      error_file: './logs/faucet-error.log',
      out_file: './logs/faucet-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000
    }
  ]
};
