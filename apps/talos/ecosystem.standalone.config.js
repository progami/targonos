module.exports = {
  apps: [{
    name: 'talos-app',
    script: 'npm',
    args: 'start',
    cwd: '/home/talos/talos-app/apps/talos',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      BASE_PATH: '/talos',
      NEXT_PUBLIC_BASE_PATH: '/talos',
      HOST: '0.0.0.0'
    },
    error_file: '/home/talos/logs/error.log',
    out_file: '/home/talos/logs/out.log',
    log_file: '/home/talos/logs/combined.log',
    time: true,
    
    // Auto restart settings
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Resource limits
    max_memory_restart: '1G',

    // Pre-start hook to ensure directories exist
    pre_start: () => {
      const fs = require('fs');

      // Ensure log directory exists
      const logDir = '/home/talos/logs';
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // Check if custom server exists
      const serverPath = '/home/talos/talos-app/apps/talos/server.js';
      if (!fs.existsSync(serverPath)) {
        console.error('ERROR: Custom server not found at:', serverPath);
        process.exit(1);
      }
    }
  }]
};
